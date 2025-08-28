/**
 * 실시간 동기화 데이터를 사용하는 편의 훅들
 */

import { useMemo } from 'react';
import { useRealtimeSync } from '../contexts/RealtimeSyncContext';

// 타입 정의
interface AchievementData {
    id: number;
    progress: number;
    unlocked: boolean;
    type?: string;
    last_updated?: string;
}

interface EventData {
    id: number;
    progress: Record<string, any>;
    completed: boolean;
    last_updated?: string;
}

/**
 * 사용자 프로필 데이터 훅
 */
export function useRealtimeProfile() {
    const { state, refreshProfile } = useRealtimeSync();

    return {
        profile: state.profile,
        isConnected: state.connection.status === 'connected',
        lastUpdated: state.profile.last_updated,
        refresh: refreshProfile
    };
}

/**
 * 특정 업적 진행도 추적 훅
 */
export function useRealtimeAchievement(achievementId: number) {
    const { state, refreshAchievements } = useRealtimeSync();

    const achievement = state.achievements[achievementId];

    return {
        achievement,
        progress: achievement?.progress ?? 0,
        unlocked: achievement?.unlocked ?? false,
        lastUpdated: achievement?.last_updated,
        refresh: refreshAchievements
    };
}

/**
 * 모든 업적 데이터 훅
 */
export function useRealtimeAchievements() {
    const { state, refreshAchievements } = useRealtimeSync();

    const achievements = useMemo(() => {
        return Object.values(state.achievements).sort((a, b) => a.id - b.id);
    }, [state.achievements]);

    const stats = useMemo(() => {
        const total = achievements.length;
        const unlocked = achievements.filter((a: AchievementData) => a.unlocked).length;
        const inProgress = achievements.filter((a: AchievementData) => !a.unlocked && a.progress > 0).length;

        return {
            total,
            unlocked,
            inProgress,
            completionRate: total > 0 ? unlocked / total : 0
        };
    }, [achievements]);

    return {
        achievements,
        stats,
        refresh: refreshAchievements
    };
}

/**
 * 특정 스트릭 상태 훅
 */
export function useRealtimeStreak(actionType: string = 'SLOT_SPIN') {
    const { state, refreshStreaks } = useRealtimeSync();

    const streak = state.streaks[actionType];

    return {
        streak,
        currentCount: streak?.current_count ?? 0,
        lastActionDate: streak?.last_action_date,
        lastUpdated: streak?.last_updated,
        refresh: refreshStreaks
    };
}

/**
 * 특정 이벤트 진행도 훅
 */
export function useRealtimeEvent(eventId: number) {
    const { state, refreshEvents } = useRealtimeSync();

    const event = state.events[eventId];

    return {
        event,
        progress: event?.progress ?? {},
        completed: event?.completed ?? false,
        lastUpdated: event?.last_updated,
        refresh: refreshEvents
    };
}

/**
 * 모든 활성 이벤트 훅
 */
export function useRealtimeEvents() {
    const { state, refreshEvents } = useRealtimeSync();

    const events = useMemo(() => {
        return Object.values(state.events).sort((a, b) => a.id - b.id);
    }, [state.events]);

    const activeEvents = useMemo(() => {
        return events.filter((event: EventData) => !event.completed);
    }, [events]);

    const completedEvents = useMemo(() => {
        return events.filter((event: EventData) => event.completed);
    }, [events]);

    return {
        events,
        activeEvents,
        completedEvents,
        refresh: refreshEvents
    };
}

/**
 * 특정 게임 통계 훅
 */
export function useRealtimeStats(gameType?: string) {
    const { state } = useRealtimeSync();

    if (gameType) {
        const stats = state.stats[gameType];
        return {
            stats: stats?.data ?? {},
            lastUpdated: stats?.last_updated,
            gameType
        };
    }

    return {
        allStats: state.stats,
        gameTypes: Object.keys(state.stats)
    };
}

/**
 * 최근 보상 내역 훅
 */
export function useRealtimeRewards() {
    const { state, clearOldRewards } = useRealtimeSync();

    const rewardsByType = useMemo(() => {
        const grouped: Record<string, typeof state.recent_rewards> = {};
        state.recent_rewards.forEach(reward => {
            if (!grouped[reward.reward_type]) {
                grouped[reward.reward_type] = [];
            }
            grouped[reward.reward_type].push(reward);
        });
        return grouped;
    }, [state.recent_rewards]);

    return {
        recentRewards: state.recent_rewards,
        rewardsByType,
        clearOld: clearOldRewards,
        hasNewRewards: state.recent_rewards.length > 0
    };
}

/**
 * WebSocket 연결 상태 훅
 */
export function useRealtimeConnection() {
    const { state, connect, disconnect, triggerFallbackPoll } = useRealtimeSync();

    return {
        status: state.connection.status,
        isConnected: state.connection.status === 'connected',
        isConnecting: state.connection.status === 'connecting',
        isReconnecting: state.connection.status === 'reconnecting',
        reconnectAttempts: state.connection.reconnect_attempts,
        lastConnected: state.connection.last_connected,
        lastPollTime: state.last_poll_time,

        // 연결 제어
        connect,
        disconnect,
        fallbackPoll: triggerFallbackPoll
    };
}

/**
 * 실시간 변경 감지 훅 (특정 데이터가 변경되었는지 체크)
 */
export function useRealtimeChangeDetection() {
    const { state } = useRealtimeSync();

    return useMemo(() => {
        const now = new Date().toISOString();
        const recentThreshold = 5000; // 5초 이내

        const isRecent = (timestamp?: string) => {
            if (!timestamp) return false;
            return new Date(now).getTime() - new Date(timestamp).getTime() < recentThreshold;
        };

        return {
            profileChanged: isRecent(state.profile.last_updated),
            hasRecentAchievements: Object.values(state.achievements).some(a => isRecent(a.last_updated)),
            hasRecentStreaks: Object.values(state.streaks).some(s => isRecent(s.last_updated)),
            hasRecentEvents: Object.values(state.events).some(e => isRecent(e.last_updated)),
            hasRecentStats: Object.values(state.stats).some(s => isRecent(s.last_updated)),
            hasRecentRewards: state.recent_rewards.some(r => isRecent(r.timestamp))
        };
    }, [state]);
}

/**
 * 실시간 골드 변화 애니메이션용 훅
 */
export function useRealtimeGoldAnimation() {
    const { profile } = useRealtimeProfile();
    const changeDetection = useRealtimeChangeDetection();

    return {
        currentGold: profile.gold,
        hasRecentChange: changeDetection.profileChanged,
        shouldAnimate: changeDetection.profileChanged
    };
}

/**
 * 결제 진행 배지/요약 훅
 */
export function useRealtimePurchaseBadge() {
    const { state } = useRealtimeSync();
    return {
        pendingCount: state.purchase?.pending_count ?? 0,
        lastStatus: state.purchase?.last_status,
        lastUpdated: state.purchase?.last_updated,
        lastProductId: state.purchase?.last_product_id
    };
}

/**
 * 최근 구매 히스토리 훅(WS 기반 경량 로그)
 */
export function useRealtimePurchases() {
    const { state } = useRealtimeSync();
    return {
        recentPurchases: state.recent_purchases,
        hasHistory: (state.recent_purchases?.length ?? 0) > 0,
        lastUpdated: state.purchase?.last_updated,
    };
}

/**
 * 최근 사용자 액션(WS 버퍼) 훅
 * - RealtimeSyncContext.state.recent_user_actions 노출
 * - 선택적으로 userId로 필터링
 */
export function useRealtimeUserActions(userId?: number) {
    const { state } = useRealtimeSync();

    const list = useMemo(() => {
        const all = state.recent_user_actions || [];
        if (!userId || userId <= 0) return all;
        return all.filter((a) => a.user_id === userId);
    }, [state.recent_user_actions, userId]);

    return {
        actions: list,
        hasBuffer: list.length > 0,
        latestAt: list[0]?.timestamp,
    };
}
