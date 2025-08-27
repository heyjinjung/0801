/*
 * Sync utilities
 * - hydrateProfile: 서버 권위 프로필 로드
 * - EnsureHydrated: 최초 마운트 시 하이드레이트 트리거(렌더 차단 안함)
 * - RealtimeSyncProvider: WS 수신 → 프로필/상태 동기화 (필요 시 재하이드레이트)
 * - withReconcile: 쓰기 요청 후 재조정(hydrate)
 * - withIdem: 멱등키 생성/전달 유틸(쓰기 호출 보조)
 */
import React, { useEffect } from "react";
import { api, API_ORIGIN } from "../lib/unifiedApi";
import { getAccessToken } from "../utils/tokenStorage";
import {
  useGlobalStore,
  setProfile,
  setHydrated,
  applyReward,
} from "../store/globalStore";

export async function hydrateProfile(dispatch: ReturnType<typeof useGlobalStore>["dispatch"]) {
  try {
    // 최초 진입 병렬 hydrate:
  // - /auth/me (필수)
    // - /users/balance (권위 잔액)
    // - /games/stats/me (통계 – 전역 저장은 아직 없으나, 워밍업/요건 충족용 호출)
    const [profileRes, balanceRes] = await Promise.all([
      api.get("auth/me"),
      api.get("users/balance").catch(() => null),
      // 통계는 실패/401 무시 (호출만 수행)
      api.get("games/stats/me").catch(() => null),
    ]);

    const data = profileRes as any;
    // balance 응답에서 가능한 키를 우선적으로 사용
    const balAny = balanceRes as any;
    const goldFromBalanceRaw = balAny?.gold ?? balAny?.gold_balance ?? balAny?.cyber_token_balance ?? balAny?.balance;
    const goldFromBalance = Number.isFinite(Number(goldFromBalanceRaw)) ? Number(goldFromBalanceRaw) : undefined;

    const mapped = {
      id: data?.id ?? data?.user_id ?? "unknown",
      nickname: data?.nickname ?? data?.name ?? "",
      goldBalance: goldFromBalance ?? Number(data?.gold ?? data?.gold_balance ?? 0),
      gemsBalance: Number(data?.gems ?? data?.gems_balance ?? 0),
      level: data?.level ?? data?.battlepass_level ?? undefined,
      xp: data?.xp ?? undefined,
      updatedAt: new Date().toISOString(),
      ...data,
    } as any;
    setProfile(dispatch, mapped);
  } catch (e) {
    // 401 등은 무시(로그인 전/토큰 만료 시점)
    // eslint-disable-next-line no-console
    console.warn("[sync] hydrateProfile 실패", e);
  } finally {
    setHydrated(dispatch, true);
  }
}

export function EnsureHydrated(props: { children?: React.ReactNode }) {
  const { dispatch } = useGlobalStore();
  useEffect(() => {
    // 최초 1회 하이드레이트 (토큰 없으면 실패하지만 harmless)
    hydrateProfile(dispatch);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return React.createElement(React.Fragment, null, props.children ?? null);
}

// 간단 WS 프로바이더 (프로필/구매/리워드 이벤트 수신)
export function RealtimeSyncProvider(props: { children?: React.ReactNode }) {
  const { dispatch } = useGlobalStore();
  useEffect(() => {
    if (typeof window === "undefined") return;
    let ws: WebSocket | null = null;
    let closed = false;
    let lastHydrate = 0;
    const minInterval = 600; // ms, 잦은 재하이드레이트 방지
    // 최근 보상 이벤트 중복 억제(간단 TTL)
    const recentRewardTimestamps: number[] = [];
    const REWARD_TTL = 1500; // 1.5s 내 중복 억제

    function toWs(origin: string) {
      return origin.replace(/^http/i, "ws");
    }

    function safeHydrate() {
      const now = Date.now();
      if (now - lastHydrate < minInterval) return;
      lastHydrate = now;
      hydrateProfile(dispatch);
    }

    function tryApplyRewardFromMessage(msg: any) {
      try {
        if (!msg || msg?.type !== "reward_granted") return;
        // 중복 처리 방지: 최근 일정 시간 내 동일 타임스탬프/양의 보상만 적용
        const ts = Number(msg?.timestamp || Date.now());
        const now = Date.now();
        // TTL 정리
        for (let i = recentRewardTimestamps.length - 1; i >= 0; i -= 1) {
          if (now - recentRewardTimestamps[i] > REWARD_TTL) recentRewardTimestamps.splice(i, 1);
        }
        if (recentRewardTimestamps.some(t => Math.abs(ts - t) < 200)) {
          return; // 너무 근접한 중복 이벤트로 간주
        }
        const rawAmount = (msg?.awarded_gold ?? msg?.gold ?? msg?.amount);
        const amount = Number(rawAmount);
        const currency = (msg?.currency === 'gems') ? 'gems' : 'gold';
        const reused = Boolean(msg?.idempotency_reused || msg?.reused);
        if (!Number.isFinite(amount) || amount <= 0) return;
        if (reused) return; // 멱등 재사용은 즉시반영 스킵
        // 즉시 반영 후 TTL 큐에 기록, 곧이어 hydrate로 권위값 동기화
        applyReward(dispatch, amount, currency as any);
        recentRewardTimestamps.push(ts);
      } catch {
        // noop
      }
    }

    try {
      // 인증 토큰 확인 후, 서버의 /api/realtime/sync 엔드포인트로 연결
      const token = getAccessToken();
      if (!token) {
        console.warn("[sync] No token found – skipping WS connect");
        return () => { /* noop */ };
      }
      const url = `${toWs(API_ORIGIN)}/api/realtime/sync?token=${encodeURIComponent(token)}`;
      ws = new WebSocket(url);
      ws.onopen = () => {
        // eslint-disable-next-line no-console
        console.log("[sync] WS connected", url);
      };
      ws.onmessage = (ev) => {
        try {
          const msg = JSON.parse(ev.data);
          const type = msg?.type;
          switch (type) {
            case "profile_update":
            case "purchase_update":
            case "reward_granted":
              // 즉시 보상 반영(있으면) → 권위 재하이드레이트로 최종 일치
              tryApplyRewardFromMessage(msg);
            case "game_update":
              safeHydrate();
              break;
            default:
              break;
          }
        } catch {
          // ignore
        }
      };
      ws.onclose = () => {
        if (closed) return;
        // eslint-disable-next-line no-console
        console.log("[sync] WS closed – retry soon");
        setTimeout(() => {
          if (!closed) {
            // 재연결
            hydrateProfile(dispatch);
          }
        }, 1500);
      };
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn("[sync] WS init failed", e);
    }

    return () => {
      closed = true;
      try { ws?.close(); } catch { /* noop */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return React.createElement(React.Fragment, null, props.children ?? null);
}

// 간단 UUIDv4 (라이브러리 무의존)
function uuidv4() {
  // eslint-disable-next-line no-bitwise
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, function (c) {
    const r = (Math.random() * 16) | 0,
      v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

type ReconcileOptions = { reconcile?: boolean };

export async function withReconcile<T>(
  dispatch: ReturnType<typeof useGlobalStore>["dispatch"],
  serverCall: (idemKey: string) => Promise<T>,
  options: ReconcileOptions = { reconcile: true }
): Promise<T> {
  const idemKey = uuidv4();
  const result = await serverCall(idemKey);
  if (options.reconcile !== false) {
    await hydrateProfile(dispatch);
  }
  return result;
}

export function useWithReconcile() {
  const { dispatch } = useGlobalStore();
  return React.useMemo(() => {
    return async function run<T>(serverCall: (idemKey: string) => Promise<T>, opts?: ReconcileOptions) {
      return withReconcile<T>(dispatch, serverCall, opts);
    };
  }, [dispatch]);
}

// 멱등키 부여 전용 유틸 (쓰기 계열 호출 보조)
export function withIdem<T>(fn: (idemKey: string) => Promise<T>): Promise<T> {
  const key = uuidv4();
  return fn(key);
}
