'use client';

import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ArrowLeft,
  Calendar,
  Target,
  Gift,
  Trophy,
  Star,
  Clock,
  CheckCircle,
  Plus,
  Edit,
  Trash2,
  Play,
  Pause,
  Users,
  Coins,
  Award,
  Flame,
  Zap,
  Crown,
  Sparkles,
  Timer,
  TrendingUp,
  Eye,
  Settings
} from 'lucide-react';
import { User, Event, Mission } from '../types';
import { EventBackend, MissionBackend, UserMissionBackend } from '../types/eventMission';
import { eventMissionApi } from '../utils/eventMissionApi';
import { useEvents } from '../hooks/useEvents';
import useAuthGate from '../hooks/useAuthGate';
import useTelemetry from '../hooks/useTelemetry';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Textarea } from './ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from './ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './ui/Tabs';
import { Progress } from './ui/progress';
import { Badge } from './ui/badge';
import { Switch } from './ui/switch';
import { useWithReconcile } from '@/lib/sync';
import { useGlobalStore, applyReward } from '@/store/globalStore';

interface EventMissionPanelProps {
  user: User;
  onBack: () => void;
  onUpdateUser: (user: User) => void;
  onAddNotification: (message: string) => void;
}

export function EventMissionPanel({
  user,
  onBack,
  onUpdateUser,
  onAddNotification,
}: EventMissionPanelProps) {
  const withReconcile = useWithReconcile();
  const { dispatch } = useGlobalStore();
  // 공통 Auth Gate (마운트 후 토큰 존재 여부 결정)
  const { isReady: authReady, authenticated } = useAuthGate();
  const { record: t } = useTelemetry('events');
  const [activeTab, setActiveTab] = useState('events');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [editingItem, setEditingItem] = useState(null as Event | Mission | null);
  const [searchQuery, setSearchQuery] = useState('');

  // 실제 데이터 로드 전까지는 빈 배열 + 로딩/인증 플래그 사용 (하드코딩 Mock 제거)
  const [events, setEvents] = useState([] as Event[]); // 화면 표현용 포맷
  const [missions, setMissions] = useState([] as Mission[]);
  const [loading, setLoading] = useState(true);
  // useEvents 훅 (이벤트 목록/참여/보상)
  const {
    events: rawEvents,
    loading: eventsLoading,
    error: eventsError,
    join: joinEvent,
    claim: claimEvent,
    updateProgress: updateEventProgress,
    refresh: refreshEvents,
  } = useEvents();

  // rawEvents 변경 시 포맷 → 기존 UI 구조에 맞게 매핑
  useEffect(() => {
    const formattedEvents = (rawEvents || []).map((event: any) => ({
      id: String(event.id),
      title: event.title,
      description: event.description || '',
      type: event.event_type,
      status: event.is_active ? 'active' : 'inactive',
      startDate: new Date(event.start_date),
      endDate: new Date(event.end_date),
      rewards: Object.entries(event.rewards || {}).map(([type, amount]) => ({
        type,
        amount: Number(amount),
      })),
      participants: event.participation_count ?? 0,
      maxParticipants: 10000,
      requirements: Object.keys(event.requirements || {}),
      icon: '🎮',
      progress: event.user_participation?.progress || {},
      completed: event.user_participation?.completed || false,
      claimed: event.user_participation?.claimed || false,
      joined: event.user_participation?.joined || false,
    }));
    setEvents(formattedEvents);
  }, [rawEvents]);

  const [authRequired, setAuthRequired] = useState(false);
  const [loadError, setLoadError] = useState(null as string | null);

  // Fetch API data
  const fetchData = async () => {
    // 비로그인 상태에서는 호출 자체 스킵 (403 콘솔 노이즈 제거)
    if (!authenticated) {
      setAuthRequired(true);
      setLoading(false);
      t('fetch_skip', { reason: 'unauthenticated' });
      return;
    }
    t('fetch_start');
    setLoading(true);
    setLoadError(null);
    setAuthRequired(false);
    try {
      // 이벤트는 useEvents 훅이 자동 로드 (refreshEvents 필요 시 재호출)
      await refreshEvents();

      // 미션 데이터
      const missionsData = await eventMissionApi.missions.getAll();
      if (missionsData === null) {
        if (!checkAuthStatus()) {
          setAuthRequired(true);
        }
        t('fetch_missions_null');
      } else if (Array.isArray(missionsData)) {
        const formattedMissions = missionsData.map((missionData: UserMissionBackend) => {
          const mission = missionData.mission;
          return {
            id: String(mission.id),
            title: mission.title,
            description: mission.description || '',
            type: mission.mission_type,
            category: mission.category || 'general',
            status: missionData.completed
              ? 'completed'
              : missionData.current_progress > 0
              ? 'in-progress'
              : 'available',
            target: mission.target_value,
            progress: missionData.current_progress,
            rewards: Object.entries(mission.rewards || {}).map(([type, amount]) => ({
              type,
              amount: Number(amount),
            })),
            icon: mission.icon || '🎯',
            deadline: mission.reset_period
              ? `${mission.reset_period === 'daily' ? '오늘' : '이번 주'} 자정`
              : '없음',
            claimed: missionData.claimed,
          };
        });
        setMissions(formattedMissions);
        t('fetch_missions_success', { count: formattedMissions.length });
      }
    } catch (error) {
      console.error('이벤트/미션 데이터 로드 중 오류:', error);
      if (error instanceof Error) {
        setLoadError(error.message);
        onAddNotification(`이벤트/미션 로드 실패: ${error.message}`);
        t('fetch_error', { message: error.message });
      } else {
        setLoadError('알 수 없는 오류');
        onAddNotification('이벤트/미션 로드 중 알 수 없는 오류');
        t('fetch_error', { message: 'unknown' });
      }
    } finally {
      setLoading(false);
      t('fetch_end');
    }
  };

  // 인증 상태 확인
  const checkAuthStatus = () => {
    try {
      if (typeof window === 'undefined') return false;
      const bundle = localStorage.getItem('cc_auth_tokens');
      return !!bundle;
    } catch {
      return false;
    }
  };

  // 컴포넌트 마운트 시 데이터 로드
  useEffect(() => {
    // authReady 이후에만 의존 (SSR 초기 phase 방지)
    if (!authReady) return;
    fetchData();
  }, [authReady, authenticated]);

  // Statistics
  const activeEvents = events.filter((e: Event) => e.status === 'active').length;
  const completedMissions = missions.filter((m: Mission) => m.status === 'completed').length;
  const totalParticipants = events.reduce(
    (sum: number, e: Event) => sum + (e.participants || 0),
    0
  );

  // Handle mission completion
  const handleCompleteMission = async (missionId: string) => {
    if (!authenticated) {
      onAddNotification('로그인 후 이용 가능합니다.');
      setAuthRequired(true);
      t('mission_action_skip', { missionId, reason: 'unauthenticated' });
      return;
    }
    const mission = missions.find((m: Mission) => m.id === missionId);
    if (!mission) return;

    try {
      if (mission.progress >= mission.maxProgress && mission.status !== 'completed') {
        // 미션 완료 → 보상 수령 (서버 권위 + 재하이드레이트)
        const res: any = await withReconcile(async () =>
          eventMissionApi.missions.claimRewards(parseInt(missionId))
        );
        const gold = Number(res?.awarded_gold ?? res?.rewards?.gold ?? 0);
        const gems = Number(res?.awarded_gems ?? res?.rewards?.gems ?? 0);
        if (gold > 0) applyReward(dispatch, gold, 'gold');
        if (gems > 0) applyReward(dispatch, gems, 'gems');
        onAddNotification('미션 보상을 받았습니다!');
        t('mission_claim', { missionId });
      } else if (mission.status !== 'completed') {
        // 미션이 진행 중인 경우, 진행 상태를 업데이트
        await eventMissionApi.missions.updateProgress(parseInt(missionId), 1);
        onAddNotification('미션 진행 상태가 업데이트 되었습니다!');
        t('mission_progress', { missionId });
      }
      fetchData(); // 데이터 리로드
    } catch (error) {
      console.error('미션 처리 중 오류:', error);
      onAddNotification('미션 진행 상태 업데이트에 실패했습니다.');
      t('mission_action_error', { missionId });
    }
  };

  // 미션 보상 수령 처리
  const handleClaimMissionReward = async (missionId: string) => {
    if (!authenticated) {
      onAddNotification('로그인 후 이용 가능합니다.');
      setAuthRequired(true);
      t('mission_claim_skip', { missionId, reason: 'unauthenticated' });
      return;
    }
    try {
      // 서버 권위 보상 수령 + 재하이드레이트
      const response: any = await withReconcile(async () =>
        eventMissionApi.missions.claimRewards(parseInt(missionId))
      );
      const rewards: Record<string, any> = response?.rewards || {};
      const gold = Number(response?.awarded_gold ?? rewards.gold ?? 0);
      const gems = Number(response?.awarded_gems ?? rewards.gems ?? 0);
      if (gold > 0) applyReward(dispatch, gold, 'gold');
      if (gems > 0) applyReward(dispatch, gems, 'gems');
      const rewardMessage = Object.entries(rewards)
        .map(([type, amount]) => `${type}: ${amount}`)
        .join(', ');
      if (rewardMessage) onAddNotification(`보상 수령 완료: ${rewardMessage}`);
      // 데이터 다시 로드
      fetchData();
      t('mission_claim_success', { missionId });
    } catch (error) {
      console.error('미션 보상 수령 중 오류:', error);
      onAddNotification('미션 보상을 받는 중 문제가 발생했습니다.');
      t('mission_claim_error', { missionId });
    }
  };

  // Handle event participation
  const handleJoinEvent = async (eventId: string) => {
    if (!authenticated) {
      onAddNotification('로그인 후 이용 가능합니다.');
      setAuthRequired(true);
      t('event_join_skip', { eventId, reason: 'unauthenticated' });
      return;
    }
    try {
      await joinEvent(parseInt(eventId));

      onAddNotification(`🎉 이벤트에 참여했습니다! 조건을 달성하여 보상을 받으세요.`);

      // 최신 데이터로 업데이트
      refreshEvents();
      t('event_join_success', { eventId });
    } catch (error) {
      console.error('이벤트 참여 중 오류:', error);
      onAddNotification('이벤트 참여 중 문제가 발생했습니다.');
      t('event_join_error', { eventId });
    }
  };

  // 이벤트 보상 수령
  const handleClaimEventReward = async (eventId: string) => {
    if (!authenticated) {
      onAddNotification('로그인 후 이용 가능합니다.');
      setAuthRequired(true);
      t('event_claim_skip', { eventId, reason: 'unauthenticated' });
      return;
    }
    try {
      // 서버 권위 보상 수령 + 재하이드레이트
      const response: any = await withReconcile(async () => claimEvent(parseInt(eventId)));
      const rewards: Record<string, any> = response?.rewards || {};
      const gold = Number(response?.awarded_gold ?? rewards.gold ?? 0);
      const gems = Number(response?.awarded_gems ?? rewards.gems ?? 0);
      if (gold > 0) applyReward(dispatch, gold, 'gold');
      if (gems > 0) applyReward(dispatch, gems, 'gems');
      const rewardMessage = Object.entries(rewards)
        .map(([type, amount]) => `${type}: ${amount}`)
        .join(', ');
      if (rewardMessage) onAddNotification(`이벤트 보상 수령 완료: ${rewardMessage}`);
      // 데이터 다시 로드
      refreshEvents();
      t('event_claim_success', { eventId });
    } catch (error) {
      console.error('이벤트 보상 수령 중 오류:', error);
      onAddNotification('이벤트 보상을 받는 중 문제가 발생했습니다.');
      t('event_claim_error', { eventId });
    }
  };

  // 모델 지민 이벤트 진행도 수동 증가 (임시 UI)
  const handleIncrementModelIndex = async (eventId: string, delta: number) => {
    try {
      // 기존 훅은 단일 progress 숫자만 전달 -> 누적 대신 덮어쓰므로 우선 증가 방식: 현재 progress 읽어와 + delta
      const target = events.find((e: any) => e.id === eventId);
      const current =
        typeof target?.progress?.model_index_points === 'number'
          ? target.progress.model_index_points
          : 0;
      await updateEventProgress(parseInt(eventId), current + delta);
      await refreshEvents();
      onAddNotification(`모델 지민 +${delta}`);
      t('event_progress_update', { eventId, delta });
    } catch (e) {
      console.error('모델 지민 증가 실패', e);
      onAddNotification('모델 지민 증가 실패');
      t('event_progress_error', { eventId });
    }
  };

  // Get difficulty color
  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'easy':
        return 'text-success';
      case 'medium':
        return 'text-warning';
      case 'hard':
        return 'text-error';
      case 'extreme':
        return 'text-gradient-primary';
      default:
        return 'text-muted-foreground';
    }
  };

  // Get status color
  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-success';
      case 'completed':
        return 'bg-gold';
      case 'scheduled':
        return 'bg-info';
      case 'ended':
        return 'bg-muted';
      case 'locked':
        return 'bg-muted';
      default:
        return 'bg-muted';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-black to-primary-soft relative overflow-hidden">
      {/* Animated Background */}
      <div className="absolute inset-0">
        {[...Array(20)].map((_, i) => (
          <motion.div
            key={i}
            initial={{
              opacity: 0,
              x: Math.random() * window.innerWidth,
              y: Math.random() * window.innerHeight,
            }}
            animate={{
              opacity: [0, 0.3, 0],
              scale: [0, 2, 0],
              rotate: 360,
            }}
            transition={{
              duration: 8,
              repeat: Infinity,
              delay: i * 0.3,
              ease: 'easeInOut',
            }}
            className="absolute w-1 h-1 bg-primary rounded-full"
          />
        ))}
      </div>

      {/* 간소화된 헤더 */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 p-4 border-b border-border-secondary backdrop-blur-sm"
      >
        <div className="flex items-center gap-4 max-w-7xl mx-auto">
          <Button
            variant="outline"
            onClick={onBack}
            className="border-border-secondary hover:border-primary btn-hover-lift"
          >
            <ArrowLeft className="w-4 h-4" />
          </Button>

          <div>
            <h1 className="text-xl font-bold text-gradient-primary">이벤트 & 미션</h1>
          </div>

          <div className="ml-auto text-gold font-bold">
            {completedMissions}/{missions.length}
          </div>
        </div>
      </motion.div>

      {/* 상단 상태 표시 (로딩 / 인증 필요 / 오류) */}
      <div className="relative z-10 max-w-7xl mx-auto px-4 mt-2">
        {loading && (
          <div className="text-sm text-muted-foreground animate-pulse">
            이벤트 & 미션 로딩 중...
          </div>
        )}
        {!loading && authRequired && (
          <div className="text-sm text-warning">
            로그인이 필요합니다. 로그인 후 다시 열어주세요.
          </div>
        )}
        {!loading && loadError && <div className="text-sm text-error">로드 오류: {loadError}</div>}
        {!loading &&
          !authRequired &&
          events.length === 0 &&
          missions.length === 0 &&
          !loadError && (
            <div className="text-sm text-muted-foreground">표시할 이벤트/미션이 없습니다.</div>
          )}
      </div>

      {/* Stats Overview */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
        className="relative z-10 p-4 lg:p-6"
      >
        <div className="max-w-7xl mx-auto">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <div className="glass-effect rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-primary">{activeEvents}</div>
              <div className="text-sm text-muted-foreground">진행중인 이벤트</div>
            </div>
            <div className="glass-effect rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-success">{completedMissions}</div>
              <div className="text-sm text-muted-foreground">완료한 미션</div>
            </div>
            <div className="glass-effect rounded-xl p-4 text-center">
              <div className="text-2xl font-bold text-gold">
                {totalParticipants.toLocaleString()}
              </div>
              <div className="text-sm text-muted-foreground">총 참여자</div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Main Content */}
      <div className="relative z-10 max-w-7xl mx-auto p-4 lg:p-6 pb-24">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-2 bg-secondary/30">
            <TabsTrigger value="events" className="data-[state=active]:bg-primary">
              <Calendar className="w-4 h-4 mr-2" />
              이벤트
            </TabsTrigger>
            <TabsTrigger value="missions" className="data-[state=active]:bg-success">
              <Target className="w-4 h-4 mr-2" />
              미션
            </TabsTrigger>
          </TabsList>

          {/* Events Tab */}
          <TabsContent value="events" className="space-y-6">
            {/* Event Controls */}
            <div className="flex items-center justify-between">
              <div className="relative flex-1 max-w-md">
                <Input
                  placeholder="이벤트 검색..."
                  value={searchQuery}
                  onChange={(e: any) => setSearchQuery(e.target.value as string)}
                  className="pl-10"
                />
              </div>

              {user.isAdmin && (
                <Button
                  onClick={() => setShowCreateModal(true)}
                  className="bg-gradient-game btn-hover-lift"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  이벤트 생성
                </Button>
              )}
            </div>

            {/* Events Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {events.map((event: Event, index: number) => (
                <motion.div
                  key={event.id}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className="glass-effect rounded-xl p-6 card-hover-float relative overflow-hidden"
                >
                  {/* Event Status Badge */}
                  <div
                    className={`absolute top-4 right-4 px-2 py-1 rounded-full text-xs font-bold text-white ${getStatusColor(
                      String(event.status || '')
                    )}`}
                  >
                    {event.status === 'active'
                      ? '진행중'
                      : event.status === 'scheduled'
                      ? '예정'
                      : event.status === 'ended'
                      ? '종료'
                      : event.status || ''}
                  </div>

                  {/* Event Header */}
                  <div className="flex items-start gap-4 mb-4">
                    <div className="text-4xl">{event.icon}</div>
                    <div className="flex-1">
                      <h3 className="text-lg font-bold text-foreground mb-2">{event.title}</h3>
                      <p className="text-sm text-muted-foreground mb-3">{event.description}</p>

                      {/* Event Info */}
                      <div className="flex items-center gap-4 text-xs text-muted-foreground">
                        <div className="flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {event.endDate
                            ? typeof event.endDate === 'string'
                              ? new Date(event.endDate).toLocaleDateString()
                              : event.endDate.toLocaleDateString()
                            : 'N/A'}
                        </div>
                        <div className="flex items-center gap-1">
                          <Users className="w-3 h-3" />
                          {(event.participants || 0).toLocaleString()}
                          {event.maxParticipants
                            ? `/${event.maxParticipants.toLocaleString()}`
                            : ''}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Progress Bar for Limited Events */}
                  {event.maxParticipants && (
                    <div className="mb-4">
                      <Progress
                        value={
                          event.participants && event.maxParticipants
                            ? (event.participants / event.maxParticipants) * 100
                            : 0
                        }
                        className="h-2"
                      />
                      <div className="text-xs text-muted-foreground mt-1 text-center">
                        {event.participants && event.maxParticipants
                          ? `${Math.round(
                              (event.participants / event.maxParticipants) * 100
                            )}% 달성`
                          : '0% 달성'}
                      </div>
                    </div>
                  )}

                  {/* Rewards */}
                  <div className="mb-4">
                    <div className="text-sm font-medium text-foreground mb-2">보상:</div>
                    <div className="flex flex-wrap gap-2">
                      {(event.rewards || []).map((reward: any, idx: number) => (
                        <Badge key={idx} variant="secondary" className="text-xs">
                          {reward.type === 'gold'
                            ? `${reward.amount.toLocaleString()}G`
                            : reward.type === 'exp'
                            ? `${reward.amount.toLocaleString()}XP`
                            : reward.name || `아이템 x${reward.amount}`}
                        </Badge>
                      ))}
                    </div>
                  </div>

                  {/* Requirements */}
                  {event.requirements && (
                    <div className="mb-4">
                      <div className="text-sm font-medium text-foreground mb-2">조건:</div>
                      <div className="space-y-1">
                        {event.requirements.map((req: string, idx: number) => (
                          <div
                            key={idx}
                            className="text-xs text-muted-foreground flex items-center gap-2"
                          >
                            <CheckCircle className="w-3 h-3 text-success" />
                            {req}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Action Button */}
                  <Button
                    onClick={() => handleJoinEvent(String(event.id))}
                    disabled={event.status !== 'active'}
                    className={`w-full btn-hover-lift ${
                      event.type === 'limited'
                        ? 'bg-gradient-to-r from-error to-warning'
                        : event.type === 'special'
                        ? 'bg-gradient-gold text-black'
                        : event.type === 'seasonal'
                        ? 'bg-gradient-to-r from-success to-info'
                        : 'bg-gradient-game'
                    }`}
                  >
                    {event.status === 'active'
                      ? '참여하기'
                      : event.status === 'scheduled'
                      ? '곧 시작'
                      : '종료됨'}
                  </Button>

                  {/* Admin Controls */}
                  {user.isAdmin && (
                    <div className="flex gap-2 mt-3">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditingItem(event);
                          setShowCreateModal(true);
                        }}
                        className="flex-1"
                      >
                        <Edit className="w-4 h-4 mr-1" />
                        수정
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="border-error text-error hover:bg-error hover:text-white"
                      >
                        <Trash2 className="w-4 h-4 mr-1" />
                        삭제
                      </Button>
                    </div>
                  )}
                </motion.div>
              ))}
            </div>
          </TabsContent>

          {/* Missions Tab */}
          <TabsContent value="missions" className="space-y-6">
            {/* Mission Categories */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              {['daily', 'weekly', 'achievement', 'special'].map((type: string) => {
                const typeMissions = missions.filter((m: Mission) => m.type === type);
                const completed = typeMissions.filter(
                  (m: Mission) => m.status === 'completed'
                ).length;

                return (
                  <div key={type} className="glass-effect rounded-xl p-4 text-center">
                    <div className="text-xl mb-2">
                      {type === 'daily'
                        ? '📅'
                        : type === 'weekly'
                        ? '📆'
                        : type === 'achievement'
                        ? '🏆'
                        : '✨'}
                    </div>
                    <div className="text-lg font-bold text-foreground">
                      {completed}/{typeMissions.length}
                    </div>
                    <div className="text-sm text-muted-foreground capitalize">
                      {type === 'daily'
                        ? '일일'
                        : type === 'weekly'
                        ? '주간'
                        : type === 'achievement'
                        ? '업적'
                        : '특별'}{' '}
                      미션
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Missions List */}
            <div className="space-y-4">
              {missions.map((mission: Mission, index: number) => (
                <motion.div
                  key={mission.id}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: index * 0.1 }}
                  className={`glass-effect rounded-xl p-6 ${
                    mission.status === 'completed'
                      ? 'border-2 border-gold/30 gold-soft-glow'
                      : mission.status === 'locked'
                      ? 'opacity-60'
                      : ''
                  } card-hover-float`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4 flex-1">
                      <div className="text-3xl">{mission.icon}</div>

                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h3 className="text-lg font-bold text-foreground">{mission.title}</h3>

                          <Badge
                            variant="outline"
                            className={`text-xs ${getDifficultyColor(
                              String(mission.difficulty || '')
                            )}`}
                          >
                            {mission.difficulty === 'easy'
                              ? '쉬움'
                              : mission.difficulty === 'medium'
                              ? '보통'
                              : mission.difficulty === 'hard'
                              ? '어려움'
                              : '극한'}
                          </Badge>

                          <Badge
                            className={`text-xs text-white ${getStatusColor(
                              String(mission.status || '')
                            )}`}
                          >
                            {mission.status === 'completed'
                              ? '완료'
                              : mission.status === 'locked'
                              ? '잠금'
                              : '진행중'}
                          </Badge>
                        </div>

                        <p className="text-sm text-muted-foreground mb-3">{mission.description}</p>

                        {/* Progress */}
                        <div className="mb-3">
                          <div className="flex justify-between text-sm mb-1">
                            <span className="text-muted-foreground">진행도</span>
                            <span className="font-medium text-foreground">
                              {mission.progress}/{mission.maxProgress}
                            </span>
                          </div>
                          <Progress
                            value={
                              mission.progress && mission.maxProgress
                                ? (mission.progress / mission.maxProgress) * 100
                                : 0
                            }
                            className="h-2"
                          />
                        </div>

                        {/* Rewards */}
                        <div className="flex flex-wrap gap-2 mb-3">
                          {(mission.rewards || []).map((reward: any, idx: number) => (
                            <Badge key={idx} variant="secondary" className="text-xs">
                              {reward.type === 'gold'
                                ? `${reward.amount.toLocaleString()}G`
                                : reward.type === 'exp'
                                ? `${reward.amount.toLocaleString()}XP`
                                : reward.name || `아이템 x${reward.amount}`}
                            </Badge>
                          ))}
                        </div>

                        {/* Expiry */}
                        {mission.expiresAt && (
                          <div className="text-xs text-error flex items-center gap-1">
                            <Timer className="w-3 h-3" />
                            {mission.expiresAt
                              ? Math.ceil(
                                  ((typeof mission.expiresAt === 'string'
                                    ? new Date(mission.expiresAt)
                                    : mission.expiresAt
                                  ).getTime() -
                                    Date.now()) /
                                    (1000 * 60 * 60)
                                )
                              : 0}
                            시간 남음
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="ml-4">
                      {mission.status === 'completed' ? (
                        <Button disabled className="bg-gold text-black">
                          <CheckCircle className="w-4 h-4 mr-2" />
                          완료됨
                        </Button>
                      ) : mission.status === 'locked' ? (
                        <Button disabled variant="outline">
                          잠금
                        </Button>
                      ) : mission.progress &&
                        mission.maxProgress &&
                        mission.progress >= mission.maxProgress ? (
                        <Button
                          onClick={() => handleCompleteMission(String(mission.id))}
                          className="bg-gradient-game btn-hover-lift"
                        >
                          <Gift className="w-4 h-4 mr-2" />
                          보상 받기
                        </Button>
                      ) : (
                        <Button variant="outline" disabled>
                          진행중
                        </Button>
                      )}
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}