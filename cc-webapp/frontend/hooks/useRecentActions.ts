import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from '@/lib/unifiedApi';

export interface RecentAction {
  id: number;
  user_id: number;
  action_type: string;
  created_at: string;
  action_data?: Record<string, any> | null;
}

type CursorResponse = {
  items: RecentAction[];
  next_cursor?: string | null;
};

type RecentActionsResponse = RecentAction[] | CursorResponse;

/**
 * useRecentActions
 * - 특정 사용자 최근 액션 목록 로드
 * - TTL 내 중복 호출 방지(dedupe)
 */
export function useRecentActions(userId?: number, limit = 10, auto = true) {
  const [actions, setActions] = useState(null as any); // RecentAction[] | null
  const [loading, setLoading] = useState(false as any as boolean);
  const [error, setError] = useState(null as any); // string | null
  const [nextCursor, setNextCursor] = useState(null as any); // string | null
  const [hasMore, setHasMore] = useState(false as any as boolean);

  const lastFetchedRef = useRef(0 as any);
  const inFlightRef = useRef(null as any); // Promise<any> | null
  const fullListRef = useRef(null as any); // RecentAction[] | null
  const displayLimitRef = useRef(limit as any); // number

  const TTL_MS = 1000; // 1초 dedupe

  const load = useCallback(async () => {
    if (!userId || userId <= 0) return null;
    const now = Date.now();
    if (inFlightRef.current) return inFlightRef.current;
    if (now - lastFetchedRef.current < TTL_MS && actions) return actions;

    setLoading(true); setError(null);
    const p = api
      .get(`actions/recent/${userId}?limit=${encodeURIComponent(limit)}&mode=cursor`)
      .then((res: RecentActionsResponse) => {
        lastFetchedRef.current = Date.now();

        // Cursor 기반 응답 처리
        if (res && !Array.isArray(res) && 'items' in res) {
          const items = (res as CursorResponse).items || [];
          const next = (res as CursorResponse).next_cursor ?? null;
          setNextCursor(next);
          setHasMore(!!next);
          fullListRef.current = null; // cursor 모드에서는 fullList 사용 안 함
          displayLimitRef.current = limit;
          setActions(items);
          return items;
        }

        // 배열 응답(폴백)
        const list = Array.isArray(res) ? (res as RecentAction[]) : [];
        fullListRef.current = list;
        displayLimitRef.current = limit;
        setNextCursor(null);
        const slice = limit > 0 ? list.slice(0, limit) : list;
        setHasMore(slice.length < list.length);
        setActions(slice);
        return list;
      })
      .catch((e: any) => {
        setError(e?.message || 'recent actions load failed');
        throw e;
      })
      .finally(() => {
        setLoading(false);
        inFlightRef.current = null;
      });
    inFlightRef.current = p;
    return p;
  }, [userId, limit, actions]);

  const reload = useCallback(() => {
    lastFetchedRef.current = 0;
    setNextCursor(null);
    setHasMore(false);
    fullListRef.current = null;
    displayLimitRef.current = limit;
    return load();
  }, [load]);

  const loadMore = useCallback(async () => {
    if (!userId || userId <= 0) return null;
    // Cursor 모드
    if (nextCursor) {
      if (inFlightRef.current) return inFlightRef.current;
      setLoading(true); setError(null);
      const p = api
        .get(`actions/recent/${userId}?limit=${encodeURIComponent(limit)}&mode=cursor&cursor=${encodeURIComponent(nextCursor)}`)
        .then((res: RecentActionsResponse) => {
          // Expect cursor response; fallback safe-guards
          let newItems: RecentAction[] = [];
          let next: string | null = null;
          if (res && !Array.isArray(res) && 'items' in res) {
            newItems = (res as CursorResponse).items || [];
            next = (res as CursorResponse).next_cursor ?? null;
          } else if (Array.isArray(res)) {
            newItems = res as RecentAction[];
            next = null;
          }
          setNextCursor(next);
          setHasMore(!!next);
          setActions((prev: any) => {
            const merged = [...(prev || []), ...newItems];
            // id 기준 중복 제거
            const seen = new Set<number>();
            const dedup = merged.filter(a => {
              if (seen.has(a.id)) return false;
              seen.add(a.id); return true;
            });
            return dedup;
          });
          return newItems;
        })
        .catch((e: any) => {
          setError(e?.message || 'recent actions load more failed');
          throw e;
        })
        .finally(() => {
          setLoading(false);
          inFlightRef.current = null;
        });
      inFlightRef.current = p;
      return p;
    }

    // 배열(폴백) 모드: displayLimit만 확장
    if (fullListRef.current) {
      const nextDisplay = displayLimitRef.current + limit;
      displayLimitRef.current = nextDisplay;
      const list = fullListRef.current;
      const slice = list.slice(0, nextDisplay);
      setHasMore(slice.length < list.length);
      setActions(slice);
      return slice;
    }
    return null;
  }, [userId, nextCursor, limit]);

  useEffect(() => {
    if (auto) {
      load();
    }
  }, [auto, load]);

  return { actions, loading, error, reload, loadMore, hasMore, nextCursor };
}

export default useRecentActions;
