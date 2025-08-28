'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { api as unifiedApi } from '@/lib/unifiedApi';
import { useRealtimeStats } from '@/hooks/useRealtimeData';

/**
 * ProfileStats
 * - RealtimeSyncContext.state.stats 기반으로 프로필 게임 통계를 표시
 * - 최초 진입 시 전역 stats가 비어있다면 /games/stats/me를 한 번 워밍업 호출(서버 권위)
 * - 로컬에서 임의 가산/감산 없음. 모든 수치는 서버 또는 WS 이벤트 반영값 사용
 */
export default function ProfileStats() {
  const { allStats } = useRealtimeStats();
  const [warmed, setWarmed] = useState(false);

  useEffect(() => {
    // 전역 stats가 비어있을 때만 1회 워밍업 호출
    const hasStats = allStats && Object.keys(allStats).length > 0;
    if (!hasStats && !warmed) {
      unifiedApi
        .get('games/stats/me')
        .catch(() => null)
        .finally(() => setWarmed(true));
    }
  }, [allStats, warmed]);

  // 숫자 안전 선택 헬퍼
  const pickNumber = (obj: Record<string, any> | undefined, keys: string[]): number => {
    if (!obj) return 0;
    for (const k of keys) {
      const v = obj[k];
      if (typeof v === 'number' && Number.isFinite(v)) return v;
    }
    return 0;
  };

  const { totalGames, totalWins, perGame } = useMemo(() => {
    const entries = Object.values(allStats || {}) as Array<{
      game_type?: string;
      data?: Record<string, any>;
    }>;
    let tg = 0;
    let tw = 0;
    const per: Array<{ game: string; games: number; wins: number }> = [];
    for (const e of entries) {
      const game = e?.game_type || 'unknown';
      const games = pickNumber(e?.data, [
        'total_games_played',
        'total_games',
        'games',
        'plays',
        'spins',
      ]);
      const wins = pickNumber(e?.data, ['total_wins', 'wins']);
      tg += games;
      tw += wins;
      per.push({ game, games, wins });
    }
    return { totalGames: tg, totalWins: tw, perGame: per };
  }, [allStats]);

  const winRate =
    totalGames > 0 ? Math.min(100, Math.max(0, Math.round((totalWins / totalGames) * 100))) : 0;

  return (
    <Card
      className="glass-effect p-4 md:p-6 border border-primary/20"
      aria-label="profile-stats-card"
    >
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-lg font-semibold">프로필 통계</h3>
        <Badge variant="secondary">실시간</Badge>
      </div>

      <div className="grid grid-cols-2 gap-4 mb-6">
        <div className="rounded-xl p-4 border border-border/60 bg-card/60">
          <div className="text-sm text-muted-foreground">총 플레이</div>
          <div className="text-2xl font-bold">{totalGames}</div>
        </div>
        <div className="rounded-xl p-4 border border-border/60 bg-card/60">
          <div className="text-sm text-muted-foreground">총 승리</div>
          <div className="text-2xl font-bold">{totalWins}</div>
        </div>
      </div>

      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm text-muted-foreground">승률</span>
          <span className="text-sm font-medium">{winRate}%</span>
        </div>
        <Progress value={winRate} />
      </div>

      <div className="space-y-3">
        {perGame.length === 0 ? (
          <div className="text-sm text-muted-foreground">표시할 게임 통계가 없습니다.</div>
        ) : (
          perGame.map((row: { game: string; games: number; wins: number }) => (
            <div
              key={row.game}
              className="flex items-center justify-between rounded-lg p-3 border border-border/50 bg-card/40"
            >
              <div className="font-medium">{row.game}</div>
              <div className="text-sm text-muted-foreground">
                플레이 {row.games} / 승 {row.wins}
              </div>
            </div>
          ))
        )}
      </div>
    </Card>
  );
}
