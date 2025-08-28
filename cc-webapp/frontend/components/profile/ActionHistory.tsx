'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import useRecentActions, { RecentAction } from '@/hooks/useRecentActions';
import { useRealtimeUserActions } from '@/hooks/useRealtimeData';
import { useGlobalProfile } from '@/store/globalStore';

/**
 * ActionHistory
 * - /api/actions/recent/{user} 읽기 전용 표시
 * - 서버 커서 기반 페이지네이션 미정이므로, 우선 limit 증분(load more) 방식으로 구현
 * - 로컬에서 데이터 가공 최소화, 서버 반환 그대로 표기(민감 데이터는 서버에서 필터링 가정)
 */
export default function ActionHistory() {
  const profile = useGlobalProfile();
  const userId = Number(profile?.id || 0);

  const [limit, setLimit] = useState(10);
  const { actions, loading, error, reload, loadMore, hasMore } = useRecentActions(
    userId > 0 ? userId : undefined,
    limit,
    !!userId
  );

  // WS 버퍼(최근 사용자 액션) → 상단 프리팬드 병합
  const { actions: wsActions } = useRealtimeUserActions(userId);
  const mergedActions = React.useMemo(() => {
    const base = Array.isArray(actions) ? actions : [];
    // WS 액션을 API 기반 목록 상단에 프리팬드, id 기준 중복 제거
    const combined = [...(wsActions || []), ...base];
    const seen = new Set<string | number>();
    const dedup = combined.filter((a: any) => {
      const id = (a?.id ?? `${a?.timestamp}:${a?.action_type}`) as string | number;
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
    return dedup as RecentAction[];
  }, [actions, wsActions]);

  const sentinelRef = useRef(null as any);
  const lastAutoLoadAtRef = useRef(0);

  const onLoadMore = useCallback(() => {
    // 하이브리드: 커서 모드면 API 요청, 배열 모드면 limit 증가
    if (typeof loadMore === 'function') {
      loadMore();
    } else {
      setLimit((n: number) => Math.min(100, n + 10));
    }
  }, [loadMore]);

  // 프로필 변경 시 초기화
  useEffect(() => {
    setLimit(10);
  }, [userId]);

  // IntersectionObserver로 자동 로드
  useEffect(() => {
    if (!sentinelRef.current) return;
    const el = sentinelRef.current;
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting && !loading && hasMore) {
            const now = Date.now();
            if (now - lastAutoLoadAtRef.current < 400) return; // 짧은 쿨다운
            lastAutoLoadAtRef.current = now;
            onLoadMore();
          }
        });
      },
      { rootMargin: '128px' }
    );
    io.observe(el);
    return () => io.disconnect();
  }, [onLoadMore, loading, hasMore]);

  return (
    <Card
      className="glass-effect p-4 md:p-6 border border-primary/20"
      aria-label="profile-action-history-card"
    >
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold">최근 활동</h3>
        <Badge variant="outline">읽기 전용</Badge>
      </div>

      {error && <div className="mb-3 text-sm text-red-400">불러오기 오류: {error}</div>}

    {!mergedActions || mergedActions.length === 0 ? (
        <div className="text-sm text-muted-foreground">표시할 활동이 없습니다.</div>
      ) : (
        <div className="space-y-2" aria-label="action-history-list" role="list">
      {mergedActions.map((a: RecentAction) => (
            <div
              role="listitem"
        key={`${a.id ?? `${(a as any).timestamp}:${a.action_type}`}`}
              className="flex items-center justify-between rounded-lg p-3 border border-border/50 bg-card/40"
            >
              <div className="text-sm">
                <div className="font-medium">{a.action_type}</div>
                <div className="text-muted-foreground text-xs">
          {new Date((a as any).created_at || (a as any).timestamp).toLocaleString()}
                </div>
              </div>
              {a.action_data && (
                <div className="text-xs text-muted-foreground truncate max-w-[50%]">
                  {JSON.stringify(a.action_data)}
                </div>
              )}
            </div>
          ))}
          {/* Sentinel for auto-load */}
          <div ref={sentinelRef} />
        </div>
      )}

      <div className="mt-4 flex items-center gap-2">
        <button
          className="px-3 py-2 rounded-md bg-primary/80 hover:bg-primary text-white text-sm"
          onClick={() => reload()}
          disabled={loading}
        >
          새로고침
        </button>
        <button
          className="px-3 py-2 rounded-md bg-secondary/70 hover:bg-secondary text-white text-sm"
          onClick={onLoadMore}
          disabled={loading || !hasMore}
          aria-label="action-history-load-more"
        >
          더 보기
        </button>
        {loading && <span className="text-xs text-muted-foreground">불러오는 중…</span>}
      </div>
    </Card>
  );
}
