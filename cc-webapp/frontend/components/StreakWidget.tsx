'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { useRealtimeSync } from '@/contexts/RealtimeSyncContext';
import { api as unifiedApi } from '@/lib/unifiedApi';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Alert, AlertDescription } from './ui/alert';
import { Clock, Flame, Gift, CheckCircle } from 'lucide-react';

type Preview = {
  action_type: string;
  streak_count: number;
  claimed_today: boolean;
  claimable: boolean;
  today_reward_gold: number;
  today_reward_xp: number;
  next_day_reward_gold: number;
  next_day_reward_xp: number;
};

interface Props {
  actionType?: string; // 기본 SLOT_SPIN (백엔드와 동일)
  className?: string;
}

export default function StreakWidget({ actionType = 'SLOT_SPIN', className }: Props) {
  const { state, refreshStreaks } = useRealtimeSync();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null as string | null);
  const [preview, setPreview] = useState(null as Preview | null);

  const streakState = state?.streaks?.[actionType];
  const currentCount = streakState?.current_count ?? 0;

  // 초기 프리뷰 로드 및 WS 변경 시 재조회 최소화
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setError(null);
        const data = await unifiedApi.get<Preview>(`streak/preview`, {
          // 서버 쿼리 파라미터: action_type
          // unifiedApi는 body/params 직렬화 유틸이 없으므로 경로 쿼리 직접 부착
          // 서버 표준 준수
          transform: (d: any) => d,
        });
        if (!cancelled) setPreview(data);
      } catch (e: any) {
        if (!cancelled) setError(e?.message || '미리보기 로드 실패');
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const claimDisabled = useMemo(() => {
    if (loading) return true;
    if (!preview) return true;
    if (!preview.claimable) return true;
    return false;
  }, [loading, preview]);

  const onTick = async () => {
    try {
      setLoading(true);
      setError(null);
      await unifiedApi.post(`streak/tick`, { action_type: actionType });
      // 서버가 WS로 streak_update 브로드캐스트 → 상태 자동 반영
      await refreshStreaks();
      // 프리뷰 갱신
      const p = await unifiedApi.get<Preview>(`streak/preview`, { transform: (d: any) => d });
      setPreview(p);
    } catch (e: any) {
      setError(e?.message || '틱 업데이트 실패');
    } finally {
      setLoading(false);
    }
  };

  const onClaim = async () => {
    try {
      setLoading(true);
      setError(null);
      await unifiedApi.post(`streak/claim`, { action_type: actionType });
      await refreshStreaks();
      const p = await unifiedApi.get<Preview>(`streak/preview`, { transform: (d: any) => d });
      setPreview(p);
      // 보상 후 프로필/리워드 WS로 동기화됨
    } catch (e: any) {
      setError(e?.message || '보상 수령 실패');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={className} data-testid="streak-widget">
      <div className="glass-metal rounded-xl p-4 border border-border-secondary/60">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <Flame className="w-4 h-4 text-warning" />
            <span className="text-sm text-muted-foreground">연속 기록</span>
          </div>
          <Badge variant="outline" className="text-xs" data-testid="streak-action">
            {actionType}
          </Badge>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <div className="text-2xl font-semibold" data-testid="streak-count">
              {currentCount}
            </div>
            <div className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {preview ? (
                preview.claimed_today ? (
                  <span>오늘 보상 수령 완료</span>
                ) : (
                  <span>오늘 보상 대기</span>
                )
              ) : (
                <span>로딩중…</span>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={onTick}
              disabled={loading}
              data-testid="streak-tick-btn"
            >
              <Flame className="w-4 h-4 mr-1" /> Tick
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={onClaim}
              disabled={claimDisabled}
              data-testid="streak-claim-btn"
              className="bg-gradient-game"
            >
              <Gift className="w-4 h-4 mr-1" /> Claim
            </Button>
          </div>
        </div>

        {preview && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-3 grid grid-cols-2 gap-2 text-xs"
          >
            <div className="glass-effect rounded-lg p-2">
              <div className="text-muted-foreground mb-1">오늘 보상</div>
              <div className="text-foreground" data-testid="streak-today-reward">
                +{preview.today_reward_gold} Gold / +{preview.today_reward_xp} XP
              </div>
            </div>
            <div className="glass-effect rounded-lg p-2">
              <div className="text-muted-foreground mb-1">다음 보상</div>
              <div className="text-foreground" data-testid="streak-next-reward">
                +{preview.next_day_reward_gold} Gold / +{preview.next_day_reward_xp} XP
              </div>
            </div>
          </motion.div>
        )}

        {error && (
          <div className="mt-3">
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          </div>
        )}

        {preview?.claimed_today && (
          <div className="mt-3 text-xs text-success flex items-center gap-1">
            <CheckCircle className="w-3 h-3" />
            오늘 보상이 지급되었습니다.
          </div>
        )}
      </div>
    </div>
  );
}
