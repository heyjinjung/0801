/*
 * Sync utilities
 * - hydrateProfile: 서버 권위 프로필 로드
 * - EnsureHydrated: 최초 마운트 시 하이드레이트 트리거(렌더 차단 안함)
 * - RealtimeSyncProvider: WS 수신 → 프로필/상태 동기화 (필요 시 재하이드레이트)
 * - withReconcile: 쓰기 요청 후 재조정(hydrate)
 */
import React, { useEffect } from "react";
import { api, API_ORIGIN } from "../lib/unifiedApi";
import { useGlobalStore, setProfile, setHydrated, mergeProfile, setOffline } from "@/store/globalStore";

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
    // E2E/Test visibility: mark hydration complete even on partial failures
    try {
      if (typeof window !== 'undefined') {
        (window as any).__appHydrated = true;
        document?.body?.setAttribute?.('data-hydrated', 'true');
        window.dispatchEvent(new CustomEvent('app:hydrated'));
      }
    } catch {
      // noop
    }
  }
}

export function EnsureHydrated(props: { children?: React.ReactNode }) {
  const { dispatch } = useGlobalStore();
  useEffect(() => {
    // 최초 1회 하이드레이트 (토큰 없으면 실패하지만 harmless)
    hydrateProfile(dispatch);
    // online/offline 이벤트 수신하여 전역 오프라인 상태 반영
    function onOnline() { try { setOffline(dispatch, false); } catch {} }
    function onOffline() { try { setOffline(dispatch, true); } catch {} }
    try {
      window.addEventListener('online', onOnline);
      window.addEventListener('offline', onOffline);
      // 초기 상태 동기화
      // @ts-ignore
      if (typeof navigator !== 'undefined' && navigator?.onLine === false) setOffline(dispatch, true);
    } catch {}
    return () => {
      try {
        window.removeEventListener('online', onOnline);
        window.removeEventListener('offline', onOffline);
      } catch {}
    };
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
  let retryAttempt = 0;

    function toWs(origin: string) {
      return origin.replace(/^http/i, "ws");
    }

    function safeHydrate() {
      const now = Date.now();
      if (now - lastHydrate < minInterval) return;
      lastHydrate = now;
      hydrateProfile(dispatch);
    }

    function connect() {
      try {
        const url = toWs(API_ORIGIN) + "/ws/updates";
        ws = new WebSocket(url);
        ws.onopen = () => {
          retryAttempt = 0; // reset backoff
          // eslint-disable-next-line no-console
          console.log("[sync] WS connected", url);
          // 연결 직후 초기 sync 요청(서버 지원 시 마지막 시퀀스부터 재플레이 요청하도록 확장 가능)
          safeHydrate();
          try {
            (window as any).__realtimeReady = true;
            window.dispatchEvent(new CustomEvent('app:realtime-ready'));
          } catch { /* ignore */ }
        };
        ws.onmessage = (ev) => {
          try {
            const msg = JSON.parse(ev.data);
            const type = msg?.type;
            switch (type) {
              case "profile_update":
              case "purchase_update":
              case "reward_granted":
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
          const delay = Math.min(8000, 500 * Math.pow(2, retryAttempt++));
          setTimeout(() => {
            if (!closed) {
              connect();
            }
          }, delay);
        };
        ws.onerror = () => {
          try { ws?.close(); } catch { /* noop */ }
        };
      } catch (e) {
        // eslint-disable-next-line no-console
        console.warn("[sync] WS init failed", e);
      }
    }

    connect();

    return () => {
      closed = true;
      try { ws?.close(); } catch { /* noop */ }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Test-only: allow E2E to inject a profile update that directly merges into the global store
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = (e: Event) => {
      try {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const detail = (e as any).detail as { gold?: number; gold_balance?: number; gems?: number; gems_balance?: number } | undefined;
        if (!detail || typeof detail !== 'object') return;
        const gold = (detail as any).gold ?? (detail as any).gold_balance;
        const gems = (detail as any).gems ?? (detail as any).gems_balance;
        const patch: Record<string, unknown> = {};
        if (typeof gold === 'number' && Number.isFinite(gold)) patch.goldBalance = Number(gold);
        if (typeof gems === 'number' && Number.isFinite(gems)) (patch as any).gemsBalance = Number(gems);
        if (Object.keys(patch).length > 0) {
          mergeProfile(dispatch, patch as any);
        }
      } catch {
        // ignore
      }
    };
    window.addEventListener('realtime:test-profile-update', handler as EventListener);
    return () => window.removeEventListener('realtime:test-profile-update', handler as EventListener);
  }, [dispatch]);

  // Test-only: allow E2E to trigger catalog invalidation
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handler = () => {
      try { window.dispatchEvent(new CustomEvent('catalog:invalidate')); } catch { /* ignore */ }
    };
    window.addEventListener('realtime:test-catalog-update', handler as EventListener);
    return () => window.removeEventListener('realtime:test-catalog-update', handler as EventListener);
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
