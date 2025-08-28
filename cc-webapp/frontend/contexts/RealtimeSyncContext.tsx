'use client';

import React, { useContext, useEffect, useReducer, useCallback, useRef, createContext } from 'react';
import { API_ORIGIN } from '../lib/unifiedApi';
import { WSClient, createWSClient, WebSocketMessage, SyncEventData } from '../utils/wsClient';
import { useAuth } from '../hooks/useAuth';
import { useAuthToken } from '../hooks/useAuthToken';
import { globalFallbackPoller, createSyncPollingTasks } from '../utils/fallbackPolling';
// Toast는 직접 의존하지 않고 window 이벤트로 브로드캐스트합니다.

/**
 * 실시간 동기화 전역 상태 정의
 */
export interface RealtimeSyncState {
  // 사용자 프로필 데이터
  profile: {
    gold: number;
    exp: number;
    tier: string;
    total_spent: number;
    last_updated?: string;
  };

  // 업적 진행도
  achievements: Record<
    number,
    {
      id: number;
      progress: number;
      unlocked: boolean;
      type?: string;
      last_updated?: string;
    }
  >;

  // 스트릭 상태
  streaks: Record<
    string,
    {
      action_type: string;
      current_count: number;
      last_action_date: string;
      last_updated?: string;
    }
  >;

  // 이벤트 진행도
  events: Record<
    number,
    {
      id: number;
      progress: Record<string, any>;
      completed: boolean;
      last_updated?: string;
    }
  >;

  // 게임 통계
  stats: Record<
    string,
    {
      game_type: string;
      data: Record<string, any>;
      last_updated?: string;
    }
  >;

  // 최근 보상 내역 (UI 알림용)
  recent_rewards: Array<{
    id: string;
    reward_type: string;
    reward_data: Record<string, any>;
    source: string;
    timestamp: string;
  }>;

  // 결제 진행 상태 (배지/알림용 경량 상태)
  purchase: {
    pending_count: number; // 진행중 결제 건수(추정)
    last_status?: 'pending' | 'success' | 'failed' | 'idempotent_reuse';
    last_product_id?: string;
    last_receipt?: string;
    last_updated?: string;
  };

  // 최근 구매 히스토리(WS 기반 경량 로그, 최대 20개)
  recent_purchases: Array<{
    id: string; // receipt_code 또는 합성 키
    status: 'pending' | 'success' | 'failed' | 'idempotent_reuse';
    product_id?: string;
    amount?: number;
    receipt_code?: string;
    timestamp: string; // 수신 시각
  }>;

  // 최근 사용자 액션(WS 기반 경량 로그, 최대 50개)
  recent_user_actions: Array<{
    id?: string | number;
    user_id: number;
    action_type: string;
    action_data?: Record<string, any>;
    timestamp: string; // 수신 시각 또는 created_at
  }>;

  // WebSocket 연결 상태
  connection: {
    status: 'disconnected' | 'connecting' | 'connected' | 'reconnecting';
    last_connected?: string;
    reconnect_attempts: number;
  };

  // 마지막 폴백 폴링 시간
  last_poll_time?: string;
}

/**
 * 상태 업데이트 액션 타입
 */
type SyncAction =
  | {
      type: 'SET_CONNECTION_STATUS';
      payload: { status: RealtimeSyncState['connection']['status']; attempts?: number };
    }
  | { type: 'UPDATE_PROFILE'; payload: SyncEventData['profile_update'] }
  | { type: 'UPDATE_ACHIEVEMENT'; payload: SyncEventData['achievement_progress'] }
  | { type: 'UPDATE_STREAK'; payload: SyncEventData['streak_update'] }
  | { type: 'UPDATE_EVENT'; payload: SyncEventData['event_progress'] }
  | { type: 'UPDATE_STATS'; payload: SyncEventData['stats_update'] }
  | { type: 'ADD_REWARD'; payload: SyncEventData['reward_granted'] }
  | { type: 'CLEAR_OLD_REWARDS' }
  | { type: 'SET_LAST_POLL_TIME'; payload: string }
  | { type: 'INITIALIZE_STATE'; payload: Partial<RealtimeSyncState> }
  | { type: 'UPDATE_PURCHASE'; payload: SyncEventData['purchase_update'] }
  | { type: 'ADD_USER_ACTION'; payload: SyncEventData['user_action'] };

/**
 * 초기 상태
 */
const initialState: RealtimeSyncState = {
  profile: {
    gold: 0,
    exp: 0,
    tier: 'STANDARD',
    total_spent: 0,
  },
  achievements: {},
  streaks: {},
  events: {},
  stats: {},
  recent_rewards: [],
  purchase: {
    pending_count: 0,
  },
  recent_purchases: [],
  recent_user_actions: [],
  connection: {
    status: 'disconnected',
    reconnect_attempts: 0,
  },
};

/**
 * 상태 리듀서
 */
function syncStateReducer(state: RealtimeSyncState, action: SyncAction): RealtimeSyncState {
  const timestamp = new Date().toISOString();

  switch (action.type) {
    case 'SET_CONNECTION_STATUS':
      return {
        ...state,
        connection: {
          ...state.connection,
          status: action.payload.status,
          reconnect_attempts: action.payload.attempts ?? state.connection.reconnect_attempts,
          last_connected:
            action.payload.status === 'connected' ? timestamp : state.connection.last_connected,
        },
      };

    case 'UPDATE_PROFILE':
      if (!action.payload) return state;
      return {
        ...state,
        profile: {
          ...state.profile,
          ...(action.payload.gold !== undefined && { gold: action.payload.gold }),
          ...(action.payload.exp !== undefined && { exp: action.payload.exp }),
          ...(action.payload.tier !== undefined && { tier: action.payload.tier }),
          ...(action.payload.total_spent !== undefined && {
            total_spent: action.payload.total_spent,
          }),
          last_updated: timestamp,
        },
      };

    case 'UPDATE_ACHIEVEMENT':
      if (!action.payload) return state;
      return {
        ...state,
        achievements: {
          ...state.achievements,
          [action.payload.achievement_id]: {
            id: action.payload.achievement_id,
            progress: action.payload.progress,
            unlocked: action.payload.unlocked,
            type: action.payload.achievement_type,
            last_updated: timestamp,
          },
        },
      };

    case 'UPDATE_STREAK':
      if (!action.payload) return state;
      return {
        ...state,
        streaks: {
          ...state.streaks,
          [action.payload.action_type]: {
            action_type: action.payload.action_type,
            current_count: action.payload.current_count,
            last_action_date: action.payload.last_action_date,
            last_updated: timestamp,
          },
        },
      };

    case 'UPDATE_EVENT':
      if (!action.payload) return state;
      return {
        ...state,
        events: {
          ...state.events,
          [action.payload.event_id]: {
            id: action.payload.event_id,
            progress: action.payload.progress,
            completed: action.payload.completed,
            last_updated: timestamp,
          },
        },
      };

    case 'UPDATE_STATS':
      if (!action.payload?.game_type) return state;
      return {
        ...state,
        stats: {
          ...state.stats,
          [action.payload.game_type]: {
            game_type: action.payload.game_type,
            data: action.payload.stats,
            last_updated: timestamp,
          },
        },
      };

    case 'ADD_REWARD':
      if (!action.payload) return state;
      const rewardId = `${action.payload.reward_type}-${timestamp}`;
      return {
        ...state,
        recent_rewards: [
          {
            id: rewardId,
            reward_type: action.payload.reward_type,
            reward_data: action.payload.reward_data,
            source: action.payload.source,
            timestamp,
          },
          ...state.recent_rewards.slice(0, 9), // 최대 10개 유지
        ],
      };

    case 'UPDATE_PURCHASE': {
      const p = action.payload;
      if (!p) return state;
      // pending 증가/감소 로직 (최소 0 유지)
      let pending = state.purchase.pending_count;
      if (p.status === 'pending') pending += 1;
      if (p.status === 'success' || p.status === 'failed' || p.status === 'idempotent_reuse') {
        pending = Math.max(0, pending - 1);
      }
      // 히스토리 업데이트(최근 20개 유지, receipt_code 기준 업데이트)
      const key = p.receipt_code || `${p.user_id || 'me'}:${p.product_id || ''}`;
      const history = [...state.recent_purchases];
      const idx = history.findIndex((h) => h.id === key);
      const entry = {
        id: key,
        status: p.status,
        product_id: p.product_id,
        amount: typeof p.amount === 'number' ? p.amount : undefined,
        receipt_code: p.receipt_code,
        timestamp,
      } as const;
      if (idx >= 0) {
        history[idx] = { ...history[idx], ...entry, timestamp };
      } else {
        history.unshift(entry);
      }
      const trimmed = history.slice(0, 20);
      return {
        ...state,
        purchase: {
          pending_count: pending,
          last_status: p.status,
          last_product_id: p.product_id,
          last_receipt: p.receipt_code,
          last_updated: timestamp,
        },
        recent_purchases: trimmed,
      };
    }

    case 'ADD_USER_ACTION': {
      const ua = action.payload;
      if (!ua) return state;
      const timestamp = (ua as any)?.created_at || new Date().toISOString();
      const entry = {
        id: (ua as any)?.id,
        user_id: ua.user_id,
        action_type: ua.action_type,
        action_data: ua.action_data,
        timestamp,
      } as const;
      // 상단 프리팬드, 최대 50개 유지, 동일 (id||timestamp+type) 기준 중복 제거
      const key = entry.id ?? `${entry.timestamp}:${entry.action_type}`;
      const dedup = [entry, ...state.recent_user_actions].filter((v, idx, arr) => {
        const k = (v.id ?? `${v.timestamp}:${v.action_type}`) as any;
        return arr.findIndex((w) => (w.id ?? `${w.timestamp}:${w.action_type}`) === k) === idx;
      });
      return {
        ...state,
        recent_user_actions: dedup.slice(0, 50),
      };
    }

    case 'CLEAR_OLD_REWARDS':
      const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
      return {
        ...state,
        recent_rewards: state.recent_rewards.filter((reward) => reward.timestamp > oneHourAgo),
      };

    case 'SET_LAST_POLL_TIME':
      return {
        ...state,
        last_poll_time: action.payload,
      };

    case 'INITIALIZE_STATE':
      return {
        ...state,
        ...action.payload,
      };

    default:
      return state;
  }
}

/**
 * Context 인터페이스
 */
interface RealtimeSyncContextType {
  state: RealtimeSyncState;

  // WebSocket 연결 관리
  connect: () => Promise<void>;
  disconnect: () => void;

  // 수동 데이터 새로고침
  refreshProfile: () => Promise<void>;
  refreshAchievements: () => Promise<void>;
  refreshStreaks: () => Promise<void>;
  refreshEvents: () => Promise<void>;

  // 최근 보상 관리
  clearOldRewards: () => void;

  // 폴백 폴링 트리거
  triggerFallbackPoll: () => Promise<void>;
}

/**
 * Context 생성
 */
// NOTE: createContext 제네릭 사용 시 빌드 환경 문제로 타입 인식 오류가 발생하므로
// 초기값 any 후 hook 내부에서 런타임 검증 & 캐스팅
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const RealtimeSyncContext = createContext(null as any);

/**
 * Provider Props
 */
interface RealtimeSyncProviderProps {
  children?: React.ReactNode;
  apiBaseUrl?: string;
}

/**
 * Provider 컴포넌트
 */
export function RealtimeSyncProvider({ children, apiBaseUrl }: RealtimeSyncProviderProps) {
  const [state, dispatch] = useReducer(syncStateReducer, initialState);
  const { user } = useAuth();
  const { getAccessToken, getValidAccessToken } = useAuthToken();
  const wsClientRef = useRef(null as WSClient | null);
  const fallbackPollingActive = useRef(false);
  const pushToast = useCallback((message: string, type?: string) => {
    if (typeof window === 'undefined') return;
    try {
      window.dispatchEvent(
        new CustomEvent('app:notification', { detail: { type: type || 'info', payload: message } })
      );
    } catch {
      // ignore
    }
  }, []);
  const lastPurchaseByReceiptRef = useRef(new Map<string, { status: string; at: number }>());

  // Prefer the same origin resolution as unifiedApi to avoid cross-origin/SSR mismatches
  const baseUrl =
    apiBaseUrl ||
    API_ORIGIN ||
    (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:8000');

  // WebSocket 메시지 핸들러
  const handleWebSocketMessage = useCallback(
    (message: WebSocketMessage) => {
      console.log('[RealtimeSync] Received message:', message.type, message.data);

      switch (message.type) {
        case 'profile_update':
          try {
            const p = message.data as SyncEventData['profile_update'];
            const goldPart =
              p && typeof p.gold === 'number'
                ? `잔액이 업데이트되었습니다: ${p.gold}G`
                : '프로필이 업데이트되었습니다.';
            pushToast(goldPart, 'system');
          } catch {}
          dispatch({ type: 'UPDATE_PROFILE', payload: message.data });
          break;

        case 'purchase_update': {
          const data = message.data as SyncEventData['purchase_update'];
          // 사용자 토스트 알림
          const status = data?.status ?? 'pending';
          const product = data?.product_id ? `상품 ${data.product_id}` : '구매';
          let type: string = 'shop';
          let text: string = '';
          // 중복/전이 억제: 동일 receipt_code 기준 1.5초 내 동일 상태 무시, pending→final 병합
          const key = data?.receipt_code || `${data?.user_id || 'me'}:${data?.product_id || ''}`;
          const now = Date.now();
          const last = key ? lastPurchaseByReceiptRef.current.get(key) : undefined;
          if (last && last.status === status && now - last.at < 1500) {
            break; // 동일 상태 단시간 재수신 무시
          }
          // pending 이후 최종 상태 도달 시 최종 상태만 노출
          if (last && last.status === 'pending' && (status === 'success' || status === 'failed')) {
            // 계속 진행 (pending 토스트는 생략하고 최종만 표시)
          }
          lastPurchaseByReceiptRef.current.set(key, { status, at: now });

          if (status === 'success') {
            type = 'success';
            text = `${product} 결제가 완료되었습니다${
              data?.amount ? ` (금액: ${data.amount})` : ''
            }.`;
          } else if (status === 'failed') {
            type = 'error';
            text = `${product} 결제가 실패했습니다${
              data?.reason_code ? ` (${data.reason_code})` : ''
            }.`;
          } else if (status === 'idempotent_reuse') {
            type = 'system';
            text = `${product} 결제가 이미 처리되었습니다.`;
          } else {
            type = 'shop';
            text = `${product} 결제가 진행 중입니다...`;
          }
          pushToast(text, type);
          // 전역 상태 업데이트(배지/요약용)
          dispatch({ type: 'UPDATE_PURCHASE', payload: data });
          break;
        }

        case 'achievement_progress':
          dispatch({ type: 'UPDATE_ACHIEVEMENT', payload: message.data });
          break;

        case 'streak_update':
          dispatch({ type: 'UPDATE_STREAK', payload: message.data });
          break;

        case 'event_progress':
          dispatch({ type: 'UPDATE_EVENT', payload: message.data });
          break;

        case 'reward_granted':
          try {
            const r = message.data as SyncEventData['reward_granted'];
            // 보상 데이터에서 금액 추정(awarded_gold 우선)
            const data: any = r?.reward_data || {};
            const amount =
              (typeof data.awarded_gold === 'number' && data.awarded_gold) ||
              (typeof data.gold === 'number' && data.gold) ||
              (typeof data.amount === 'number' && data.amount);
            const msg = amount
              ? `보상 지급 +${amount}G (${r?.reward_type || 'reward'})`
              : `보상 지급 (${r?.reward_type || 'reward'})`;
            pushToast(msg, 'reward');
          } catch {}
          dispatch({ type: 'ADD_REWARD', payload: message.data });
          break;

        case 'stats_update':
          dispatch({ type: 'UPDATE_STATS', payload: message.data });
          break;

        case 'user_action':
          // 최근 사용자 액션 버퍼에 프리팬드. 별도 토스트는 기본 비활성(과다 노이즈 방지)
          dispatch({ type: 'ADD_USER_ACTION', payload: message.data });
          break;

        case 'pong':
          // 하트비트 응답 - 특별한 처리 불요
          break;

        default:
          console.warn('[RealtimeSync] Unknown message type:', message.type);
      }
    },
    [pushToast]
  );

  // Test-only hook: allow E2E to simulate purchase_update without a real WS backend
  // This is a no-op in production unless a CustomEvent is explicitly dispatched from the page context.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = (e: Event) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const detail = (e as any).detail as SyncEventData['purchase_update'];
        if (detail && typeof detail === 'object') {
          dispatch({ type: 'UPDATE_PURCHASE', payload: detail });
        }
      } catch {
        // ignore
      }
    };
    window.addEventListener('realtime:test-purchase-update', handler as EventListener);
    return () =>
      window.removeEventListener('realtime:test-purchase-update', handler as EventListener);
  }, []);

  // Test-only: recent user action injection for E2E without real WS
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = (e: Event) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const detail = (e as any).detail as SyncEventData['user_action'];
        if (detail && typeof detail === 'object') {
          dispatch({ type: 'ADD_USER_ACTION', payload: detail });
        }
      } catch {
        // ignore
      }
    };
    window.addEventListener('realtime:test-user-action', handler as EventListener);
    return () =>
      window.removeEventListener('realtime:test-user-action', handler as EventListener);
  }, []);

  // WebSocket 연결
  const connect = useCallback(async () => {
    const token = getAccessToken() || (await getValidAccessToken());
    if (!token || !user) {
      console.log('[RealtimeSync] Cannot connect - no token or user');
      return;
    }

    if (wsClientRef.current?.isConnected()) {
      console.log('[RealtimeSync] Already connected');
      return;
    }

    dispatch({ type: 'SET_CONNECTION_STATUS', payload: { status: 'connecting' } });

    try {
      const wsClient = createWSClient({
        url: `${baseUrl}/api/realtime/sync`,
        token,
        onConnect: () => {
          console.log('[RealtimeSync] WebSocket connected');
          dispatch({
            type: 'SET_CONNECTION_STATUS',
            payload: { status: 'connected', attempts: 0 },
          });

          // WebSocket 연결 성공 시 폴백 폴링 중지
          stopFallbackPolling();
        },
        onDisconnect: () => {
          console.log('[RealtimeSync] WebSocket disconnected');
          dispatch({ type: 'SET_CONNECTION_STATUS', payload: { status: 'disconnected' } });

          // WebSocket 연결 해제 시 폴백 폴링 시작
          if (user && !fallbackPollingActive.current) {
            startFallbackPolling();
          }
        },
        onMessage: handleWebSocketMessage,
        onError: (error) => {
          console.error('[RealtimeSync] WebSocket error:', error);
        },
        onReconnecting: (attempt) => {
          console.log('[RealtimeSync] Reconnecting...', attempt);
          dispatch({
            type: 'SET_CONNECTION_STATUS',
            payload: { status: 'reconnecting', attempts: attempt },
          });
        },
      });

      wsClientRef.current = wsClient;
      await wsClient.connect();
    } catch (error) {
      console.error('[RealtimeSync] Connection failed:', error);
      dispatch({ type: 'SET_CONNECTION_STATUS', payload: { status: 'disconnected' } });
    }
  }, [getAccessToken, user, baseUrl, handleWebSocketMessage]);

  // WebSocket 연결 해제
  const disconnect = useCallback(() => {
    if (wsClientRef.current) {
      wsClientRef.current.disconnect();
      wsClientRef.current = null;
    }
    dispatch({ type: 'SET_CONNECTION_STATUS', payload: { status: 'disconnected', attempts: 0 } });
  }, []);

  // API 호출 헬퍼
  const apiCall = useCallback(
    async (endpoint: string) => {
      const token = await getValidAccessToken();
      if (!token) throw new Error('No token available');

      const response = await fetch(`${baseUrl}${endpoint}`, {
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        throw new Error(`API call failed: ${response.status} ${response.statusText}`);
      }

      return response.json();
    },
    [getValidAccessToken, baseUrl]
  );

  // 수동 데이터 새로고침 함수들
  const refreshProfile = useCallback(async () => {
    try {
      const profile = await apiCall('/api/auth/me');
      dispatch({
        type: 'UPDATE_PROFILE',
        payload: {
          user_id: profile.id,
          gold: profile.gold,
          exp: profile.exp,
          tier: profile.tier,
          total_spent: profile.total_spent,
        },
      });
    } catch (error) {
      console.error('[RealtimeSync] Failed to refresh profile:', error);
    }
  }, [apiCall]);

  const refreshAchievements = useCallback(async () => {
    try {
      // TODO: 업적 API 엔드포인트가 구현되면 연결
      console.log('[RealtimeSync] Achievement refresh - TODO');
    } catch (error) {
      console.error('[RealtimeSync] Failed to refresh achievements:', error);
    }
  }, [apiCall]);

  const refreshStreaks = useCallback(async () => {
    try {
      const streakData = await apiCall('/api/streak/status');
      dispatch({
        type: 'UPDATE_STREAK',
        payload: {
          user_id: user?.id || 0,
          action_type: streakData.action_type || 'SLOT_SPIN',
          current_count: streakData.current_count,
          last_action_date: streakData.last_action_date,
        },
      });
    } catch (error) {
      console.error('[RealtimeSync] Failed to refresh streaks:', error);
    }
  }, [apiCall, user]);

  const refreshEvents = useCallback(async () => {
    try {
      const events = await apiCall('/api/events/active');
      // TODO: 이벤트 상태 업데이트 로직
      console.log('[RealtimeSync] Events refresh - TODO:', events);
    } catch (error) {
      console.error('[RealtimeSync] Failed to refresh events:', error);
    }
  }, [apiCall]);

  // 최근 보상 정리
  const clearOldRewards = useCallback(() => {
    dispatch({ type: 'CLEAR_OLD_REWARDS' });
  }, []);

  // 폴백 폴링 (WebSocket 연결 실패시)
  const triggerFallbackPoll = useCallback(async () => {
    console.log('[RealtimeSync] Triggering fallback polling...');

    try {
      await Promise.allSettled([refreshProfile(), refreshStreaks(), refreshEvents()]);

      dispatch({ type: 'SET_LAST_POLL_TIME', payload: new Date().toISOString() });
    } catch (error) {
      console.error('[RealtimeSync] Fallback polling failed:', error);
    }
  }, [refreshProfile, refreshStreaks, refreshEvents]);

  // 폴백 폴링 시작
  const startFallbackPolling = useCallback(() => {
    if (fallbackPollingActive.current) {
      console.log('[RealtimeSync] Fallback polling already active');
      return;
    }

    console.log('[RealtimeSync] Starting fallback polling');
    fallbackPollingActive.current = true;

    const pollingTasks = createSyncPollingTasks(refreshProfile, refreshStreaks, refreshEvents, {
      onError: (error, retryCount) => {
        console.warn(`[RealtimeSync] Polling task failed (retry ${retryCount}):`, error);
      },
      onSuccess: () => {
        dispatch({ type: 'SET_LAST_POLL_TIME', payload: new Date().toISOString() });
      },
      onMaxRetriesReached: () => {
        console.error('[RealtimeSync] Polling task reached max retries, stopping');
      },
    });

    // 폴링 태스크 등록 및 시작
    pollingTasks.forEach((task) => {
      globalFallbackPoller.register(task);
      globalFallbackPoller.start(task.id);
    });
  }, [refreshProfile, refreshStreaks, refreshEvents]);

  // 폴백 폴링 중지
  const stopFallbackPolling = useCallback(() => {
    if (!fallbackPollingActive.current) {
      return;
    }

    console.log('[RealtimeSync] Stopping fallback polling');
    fallbackPollingActive.current = false;

    // 등록된 폴링 태스크 중지 및 제거
    const taskIds = ['sync-profile', 'sync-streaks', 'sync-events'];
    taskIds.forEach((taskId) => {
      globalFallbackPoller.stop(taskId);
      globalFallbackPoller.unregister(taskId);
    });
  }, []);

  // 인증 상태 변경시 연결 관리
  useEffect(() => {
    const token = getAccessToken();
    if (token && user) {
      connect();
    } else {
      disconnect();
    }

    return () => {
      disconnect();
      globalFallbackPoller.dispose();
    };
  }, [getAccessToken, user, connect, disconnect]);

  // 정리 작업 (오래된 보상 제거)
  useEffect(() => {
    const interval = window.setInterval(() => {
      clearOldRewards();
    }, 10 * 60 * 1000); // 10분마다 정리

    return () => window.clearInterval(interval);
  }, [clearOldRewards]);

  const contextValue: RealtimeSyncContextType = {
    state,
    connect,
    disconnect,
    refreshProfile,
    refreshAchievements,
    refreshStreaks,
    refreshEvents,
    clearOldRewards,
    triggerFallbackPoll,
  };

  return (
    <RealtimeSyncContext.Provider value={contextValue}>{children}</RealtimeSyncContext.Provider>
  );
}

/**
 * Hook for using realtime sync context
 */
export function useRealtimeSync(): RealtimeSyncContextType {
  const context = useContext(RealtimeSyncContext) as RealtimeSyncContextType | null;
  if (!context) {
    throw new Error('useRealtimeSync must be used within a RealtimeSyncProvider');
  }
  return context;
}
