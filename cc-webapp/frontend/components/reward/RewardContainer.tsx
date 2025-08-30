'use client';

import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { 
  Star, 
  Zap, 
  Gift, 
  Target, 
  Trophy,
  Calendar,
  BarChart3,
  Gamepad2,
  CheckCircle,
  Clock,
  ChevronRight,
  Award,
  Coins,
  Users,
  Crown,
  Gem,
  Sparkles,
  ShoppingCart,
  TrendingUp,
  TrendingDown
} from 'lucide-react';
import ProgressBar from '@/components/ui/data-display/ProgressBar';
import Tabs from '@/components/ui/navigation/Tabs';
import { Button } from '@/components/ui/basic/button';
import ModernCard from '@/components/ui/data-display/ModernCard';
import RewardResultModal from '@/components/ui/feedback/RewardResultModal';
import { useWithReconcile } from '@/lib/sync';
import { useGlobalStore, applyReward } from '@/store/globalStore';
import { api as unifiedApi } from '@/lib/unifiedApi';

// 타입 정의
interface UserLevel {
  currentLevel: number;
  currentPoints: number;
  pointsToNext: number;
  totalPoints: number;
  levelName: string;
}

interface RewardItem {
  id: string;
  name: string;
  description: string;
  cost: number;
  category: string;
  image: string;
  isAvailable: boolean;
  stock?: number;
  icon: React.ReactNode;
  accent: string;
  rarity: string;
}

interface PointTransaction {
  id: string;
  type: 'EARN' | 'SPEND';
  amount: number;
  description: string;
  timestamp: string;
}

export default function RewardContainer() {
  // 전역 store 및 withReconcile 훅
  const { dispatch, state } = useGlobalStore();
  const withReconcile = useWithReconcile();
  const [selectedTab, setSelectedTab] = useState(
    'daily' as 'daily' | 'achievements' | 'level' | 'accumulated'
  );
  interface ModalState {
    isOpen: boolean;
    type: 'success' | 'error' | 'info';
    title: string;
    message: string;
    reward?: {
      type: 'token' | 'item' | 'bonus';
      amount?: number;
      name?: string;
      icon?: React.ReactNode;
    };
  }

  const [modal, setModal] = useState({
    isOpen: false,
    type: 'info' as 'success' | 'error' | 'info',
    title: '',
    message: '',
  } as ModalState);

  // 일일 출석 데이터
  const dailyRewards = [
    { day: 1, reward: '100 토큰', claimed: true, type: 'token' },
    { day: 2, reward: '150 토큰', claimed: true, type: 'token' },
    { day: 3, reward: '무료 스핀 5회', claimed: true, type: 'spin' },
    { day: 4, reward: '200 토큰', claimed: true, type: 'token' },
    { day: 5, reward: '250 토큰', claimed: true, type: 'token' },
    { day: 6, reward: '무료 스핀 10회', claimed: true, type: 'spin' },
    { day: 7, reward: '500 토큰', claimed: true, type: 'token' },
    { day: 8, reward: '300 토큰', claimed: false, type: 'token', today: true },
    { day: 9, reward: '무료 스핀 15회', claimed: false, type: 'spin' },
    { day: 10, reward: '1000 토큰', claimed: false, type: 'token', special: true },
  ];

  // 업적 데이터
  const achievements = [
    {
      id: 'first-win',
      title: '첫 승리',
      description: '첫 번째 게임에서 승리하기',
      progress: 1,
      target: 1,
      reward: '500 토큰',
      completed: true,
      icon: <Trophy size={20} className="text-yellow-400" />,
    },
    {
      id: 'win-streak',
      title: '연승 달인',
      description: '5연승 달성하기',
      progress: 3,
      target: 5,
      reward: '1000 토큰',
      completed: false,
      icon: <Zap size={20} className="text-orange-400" />,
    },
    {
      id: 'slot-master',
      title: '슬롯 마스터',
      description: '슬롯 게임 100회 플레이',
      progress: 78,
      target: 100,
      reward: '2000 토큰',
      completed: false,
      icon: <Gamepad2 size={20} className="text-purple-400" />,
    },
    {
      id: 'big-winner',
      title: '대박 터뜨리기',
      description: '한 번에 10,000 토큰 이상 획득',
      progress: 0,
      target: 1,
      reward: '5000 토큰',
      completed: false,
      icon: <Star size={20} className="text-blue-400" />,
    },
  ];

  // 레벨업 보상 데이터
  const levelRewards = [
    { level: 14, reward: '1000 토큰', claimed: true },
    { level: 15, reward: '1200 토큰', claimed: true, current: true },
    { level: 16, reward: '1400 토큰', claimed: false },
    { level: 17, reward: '1600 토큰', claimed: false },
    { level: 18, reward: '1800 토큰', claimed: false },
    { level: 19, reward: '2000 토큰', claimed: false },
    { level: 20, reward: 'VIP 업그레이드', claimed: false, special: true },
  ];

  // 누적 보상함 데이터
  const accumulatedRewards = [
    {
      id: 'daily-bonus',
      title: '일일 출석 보너스',
      amount: '300 토큰',
      source: '7일 연속 출석',
      time: '2시간 전',
      claimed: false,
    },
    {
      id: 'achievement-reward',
      title: '업적 달성 보상',
      amount: '500 토큰',
      source: '첫 승리 달성',
      time: '5시간 전',
      claimed: false,
    },
    {
      id: 'level-reward',
      title: '레벨업 보상',
      amount: '1200 토큰',
      source: '레벨 15 달성',
      time: '1일 전',
      claimed: true,
    },
  ];

  // 핸들러 함수들
  const handleDailyRewardClaim = async (day: number, rewardLabel: string, type: string) => {
    // 서버 권위 API 호출로 변경: POST /api/streak/claim
    try {
      const result: any = await withReconcile(async () => {
        return unifiedApi.post('streak/claim', { action_type: 'DAILY_LOGIN' });
      });
      // 응답 예시: { awarded_gold, awarded_xp, new_gold_balance, streak_count }
      const awarded = Number(result?.awarded_gold || 0);
      if (Number.isFinite(awarded) && awarded > 0) {
        // 낙관 적용: 전역 store에 보상 반영(WS reward_granted와 중복 시 이후 hydrate로 수렴)
        applyReward(dispatch, awarded, 'gold');
      }
      setModal({
        isOpen: true,
        type: 'success',
        title: '출석 보상 획득!',
        message: `${day}일차 출석 보상을 성공적으로 받았습니다.`,
        reward: {
          type: 'token',
          amount: awarded || undefined,
          name: awarded ? `${awarded} 토큰` : rewardLabel,
          icon: <Coins className="w-6 h-6 text-yellow-400" />,
        },
      });
    } catch (e: any) {
      // 이미 수령한 경우 등 메시지 통일
      const msg = String(e?.message || '보상 수령에 실패했습니다. 잠시 후 다시 시도해 주세요.');
      const already = msg.includes('already claimed') || msg.includes('하루에 1번');
      setModal({
        isOpen: true,
        type: already ? 'info' : 'error',
        title: already ? '이미 수령된 출석 보상' : '보상 수령 실패',
        message: already
          ? '오늘의 출석 보상은 이미 수령하였습니다.'
          : '네트워크 혹은 서버 오류로 보상을 받지 못했습니다.',
      });
    }
  };

  const handleAchievementClaim = (title: string, reward: string) => {
    const rewardAmount = parseInt(reward.match(/\d+/)?.[0] || '0');
    setModal({
      isOpen: true,
      type: 'success',
      title: '업적 달성!',
      message: `"${title}" 업적을 완료했습니다!`,
      reward: {
        type: 'token',
        amount: rewardAmount,
        name: reward,
        icon: <Trophy className="w-6 h-6 text-amber-400" />,
      },
    });
  };

  const handleLevelRewardClaim = (level: number, reward: string) => {
    const rewardAmount = parseInt(reward.match(/\d+/)?.[0] || '0');
    setModal({
      isOpen: true,
      type: 'success',
      title: '레벨업 보상!',
      message: `레벨 ${level} 달성 보상을 받았습니다!`,
      reward: {
        type: reward.includes('VIP') ? 'bonus' : 'token',
        amount: rewardAmount || undefined,
        name: reward,
        icon: reward.includes('VIP') ? (
          <Crown className="w-6 h-6 text-purple-400" />
        ) : (
          <Coins className="w-6 h-6 text-yellow-400" />
        ),
      },
    });
  };

  const handleAccumulatedRewardClaim = (title: string, amount: string) => {
    const rewardAmount = parseInt(amount.match(/\d+/)?.[0] || '0');
    setModal({
      isOpen: true,
      type: 'success',
      title: '누적 보상 수령!',
      message: `${title} 보상을 받았습니다.`,
      reward: {
        type: 'token',
        amount: rewardAmount,
        name: amount,
        icon: <Gift className="w-6 h-6 text-green-400" />,
      },
    });
  };

  const closeModal = () => {
    setModal((prev: ModalState) => ({ ...prev, isOpen: false }));
  };

  const currentStreak = 7;
  const currentLevel = 15;
  const currentExp = 750;
  const nextLevelExp = 1000;

  return (
    <div
      className="min-h-screen w-full text-white font-['Inter','SF_Pro_Display',-apple-system,BlinkMacSystemFont,sans-serif] relative"
      style={{
        background:
          'linear-gradient(135deg, #0a0a0a 0%, #1a1a2e 25%, #0f0f23 50%, #1a1a2e 75%, #0a0a0a 100%)',
      }}
    >
      {/* 프리미엄 배경 오버레이 */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: `
          radial-gradient(circle at 20% 20%, rgba(139, 92, 246, 0.1) 0%, transparent 50%),
          radial-gradient(circle at 80% 80%, rgba(79, 70, 229, 0.08) 0%, transparent 50%),
          radial-gradient(circle at 40% 60%, rgba(168, 85, 247, 0.05) 0%, transparent 50%)
        `,
        }}
      />

      <div className="max-w-md mx-auto px-4 py-4 space-y-4 relative z-10">
        {/* 프리미엄 헤더 */}
        <motion.div
          className="text-center py-6"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
        >
          <h1 className="text-white text-2xl font-bold tracking-tight mb-2">🏆 리워드 센터</h1>
          <p className="text-gray-400 text-sm">플레이어 업적과 보상</p>
        </motion.div>

        {/* 탭 메뉴 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, delay: 0.1 }}
        >
          <Tabs
            items={[
              { key: 'daily', label: '일일 출석', icon: <Calendar className="w-4 h-4" /> },
              { key: 'achievements', label: '업적', icon: <Trophy className="w-4 h-4" /> },
              { key: 'level', label: '레벨업', icon: <BarChart3 className="w-4 h-4" /> },
              { key: 'accumulated', label: '누적', icon: <Star className="w-4 h-4" /> },
            ]}
            activeTab={selectedTab}
            onTabChange={(key) =>
              setSelectedTab(key as 'daily' | 'achievements' | 'level' | 'accumulated')
            }
            variant="default"
            size="sm"
          />
        </motion.div>

        {/* 일일 출석 체크 */}
        {selectedTab === 'daily' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4 }}
            className="space-y-4"
          >
            {/* 출석 현황 */}
            <div
              className="rounded-xl p-4 bg-gradient-to-r from-blue-500/20 to-cyan-500/20 border border-white/20 backdrop-blur-[10px]"
              style={{
                background:
                  'linear-gradient(145deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.08) 50%, rgba(59,130,246,0.05) 100%)',
              }}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Calendar size={20} className="text-blue-400" />
                  <div>
                    <h3 className="text-white text-base font-semibold">연속 출석</h3>
                    <p className="text-gray-300 text-sm">{currentStreak}일 연속</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-blue-400 text-lg font-bold">{currentStreak}</p>
                  <p className="text-gray-400 text-xs">일</p>
                </div>
              </div>
            </div>

            {/* 출석 달력 */}
            <div className="grid grid-cols-5 gap-2">
              {dailyRewards.map((day, index) => (
                <motion.div
                  key={day.day}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.3, delay: index * 0.05 }}
                  className={`relative rounded-xl p-3 text-center cursor-pointer transition-all duration-300 ${
                    day.claimed
                      ? 'bg-green-500/20 border border-green-400/30'
                      : day.today
                      ? 'bg-yellow-500/20 border border-yellow-400/30 animate-pulse'
                      : day.special
                      ? 'bg-purple-500/20 border border-purple-400/30'
                      : 'bg-gray-600/20 border border-gray-400/30'
                  }`}
                  onClick={() => {
                    if (day.today && !day.claimed) {
                      // 서버 권위 API: streak/claim 호출
                      handleDailyRewardClaim(day.day, day.reward, day.type);
                    }
                  }}
                  style={{
                    background: `${
                      day.claimed
                        ? 'linear-gradient(145deg, rgba(255,255,255,0.08) 0%, rgba(16,185,129,0.05) 100%)'
                        : day.today
                        ? 'linear-gradient(145deg, rgba(255,255,255,0.08) 0%, rgba(245,158,11,0.05) 100%)'
                        : day.special
                        ? 'linear-gradient(145deg, rgba(255,255,255,0.08) 0%, rgba(139,92,246,0.05) 100%)'
                        : 'linear-gradient(145deg, rgba(255,255,255,0.04) 0%, rgba(107,114,128,0.05) 100%)'
                    }`,
                    backdropFilter: 'blur(10px)',
                  }}
                >
                  <div className="text-xs text-gray-400 mb-1">Day {day.day}</div>
                  <div className="text-xs text-white font-medium mb-1">{day.reward}</div>
                  {day.claimed && <CheckCircle size={14} className="text-green-400 mx-auto" />}
                  {day.today && (
                    <div className="w-2 h-2 bg-yellow-400 rounded-full mx-auto animate-ping"></div>
                  )}
                  {day.special && !day.claimed && (
                    <Star size={14} className="text-purple-400 mx-auto" />
                  )}
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}

        {/* 업적 시스템 */}
        {selectedTab === 'achievements' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4 }}
            className="space-y-4"
          >
            {achievements.map((achievement, index) => (
              <motion.div
                key={achievement.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
                className={`rounded-xl p-4 transition-all duration-300 cursor-pointer ${
                  achievement.completed
                    ? 'bg-gradient-to-r from-green-500/20 to-emerald-500/20 border border-green-400/30'
                    : 'bg-gradient-to-r from-orange-500/20 to-red-500/20 border border-orange-400/30'
                }`}
                onClick={() => {
                  if (achievement.completed) {
                    handleAchievementClaim(achievement.title, achievement.reward);
                  }
                }}
                style={{
                  background: `${
                    achievement.completed
                      ? 'linear-gradient(145deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.08) 50%, rgba(16,185,129,0.05) 100%)'
                      : 'linear-gradient(145deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.08) 50%, rgba(251,146,60,0.05) 100%)'
                  }`,
                  border: '1px solid rgba(255,255,255,0.2)',
                  backdropFilter: 'blur(10px)',
                }}
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0">
                    {achievement.icon}
                  </div>

                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-white text-base font-semibold">{achievement.title}</h3>
                      {achievement.completed && (
                        <CheckCircle size={18} className="text-green-400" />
                      )}
                    </div>

                    <p className="text-gray-300 text-sm mb-3">{achievement.description}</p>

                    {/* 진행률 바 */}
                    {!achievement.completed && (
                      <div className="mb-3">
                        <ProgressBar
                          value={achievement.progress}
                          max={achievement.target}
                          variant="gradient"
                          size="sm"
                          showLabel={true}
                        />
                      </div>
                    )}

                    <div className="flex items-center justify-between">
                      <span className="text-yellow-400 text-sm font-medium">
                        보상: {achievement.reward}
                      </span>
                      <ChevronRight size={16} className="text-gray-400" />
                    </div>
                  </div>
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}

        {/* 레벨업 보상 */}
        {selectedTab === 'level' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4 }}
            className="space-y-4"
          >
            {/* 현재 레벨 정보 */}
            <div
              className="rounded-xl p-4 bg-gradient-to-r from-purple-500/20 to-indigo-500/20 border border-white/20 backdrop-blur-[10px]"
              style={{
                background:
                  'linear-gradient(145deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.08) 50%, rgba(139,92,246,0.05) 100%)',
              }}
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <BarChart3 size={20} className="text-purple-400" />
                  <div>
                    <h3 className="text-white text-base font-semibold">레벨 {currentLevel}</h3>
                    <p className="text-gray-300 text-sm">다음 레벨까지</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-purple-400 text-lg font-bold">
                    {currentExp}/{nextLevelExp}
                  </p>
                  <p className="text-gray-400 text-xs">EXP</p>
                </div>
              </div>

              {/* EXP 바 */}
              <ProgressBar
                value={currentExp}
                max={nextLevelExp}
                variant="gradient"
                size="md"
                showLabel={false}
              />
            </div>

            {/* 레벨 보상 목록 */}
            <div className="space-y-2">
              {levelRewards.map((reward, index) => (
                <motion.div
                  key={reward.level}
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.6, delay: index * 0.05 }}
                  className={`rounded-xl p-3 transition-all duration-300 ${
                    reward.claimed
                      ? 'bg-green-500/20 border border-green-400/30'
                      : reward.current
                      ? 'bg-purple-500/20 border border-purple-400/30 cursor-pointer'
                      : reward.special
                      ? 'bg-yellow-500/20 border border-yellow-400/30'
                      : 'bg-gray-600/20 border border-gray-400/30'
                  }`}
                  onClick={() => {
                    if (reward.current && !reward.claimed) {
                      handleLevelRewardClaim(reward.level, reward.reward);
                    }
                  }}
                  style={{
                    background: `${
                      reward.claimed
                        ? 'linear-gradient(145deg, rgba(255,255,255,0.08) 0%, rgba(16,185,129,0.05) 100%)'
                        : reward.current
                        ? 'linear-gradient(145deg, rgba(255,255,255,0.08) 0%, rgba(139,92,246,0.05) 100%)'
                        : reward.special
                        ? 'linear-gradient(145deg, rgba(255,255,255,0.08) 0%, rgba(245,158,11,0.05) 100%)'
                        : 'linear-gradient(145deg, rgba(255,255,255,0.04) 0%, rgba(107,114,128,0.05) 100%)'
                    }`,
                    backdropFilter: 'blur(10px)',
                  }}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div
                        className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold ${
                          reward.current ? 'bg-purple-500 text-white' : 'bg-white/10 text-gray-400'
                        }`}
                      >
                        {reward.level}
                      </div>
                      <span className="text-white text-sm font-medium">{reward.reward}</span>
                    </div>

                    {reward.claimed ? (
                      <CheckCircle size={18} className="text-green-400" />
                    ) : reward.current ? (
                      <Award size={18} className="text-purple-400" />
                    ) : reward.special ? (
                      <Star size={18} className="text-yellow-400" />
                    ) : (
                      <Clock size={18} className="text-gray-400" />
                    )}
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}

        {/* 누적 보상함 */}
        {selectedTab === 'accumulated' && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.4 }}
            className="space-y-3"
          >
            {accumulatedRewards.map((reward, index) => (
              <motion.div
                key={reward.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.6, delay: index * 0.1 }}
                className={`rounded-xl p-4 transition-all duration-300 cursor-pointer ${
                  reward.claimed
                    ? 'bg-gray-600/20 border border-gray-400/30 opacity-60'
                    : 'bg-gradient-to-r from-emerald-500/20 to-teal-500/20 border border-emerald-400/30'
                }`}
                onClick={() => {
                  if (!reward.claimed) {
                    handleAccumulatedRewardClaim(reward.title, reward.amount);
                  }
                }}
                style={{
                  background: `${
                    reward.claimed
                      ? 'linear-gradient(145deg, rgba(255,255,255,0.04) 0%, rgba(107,114,128,0.05) 100%)'
                      : 'linear-gradient(145deg, rgba(255,255,255,0.12) 0%, rgba(255,255,255,0.08) 50%, rgba(5,150,105,0.05) 100%)'
                  }`,
                  border: '1px solid rgba(255,255,255,0.2)',
                  backdropFilter: 'blur(10px)',
                }}
              >
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center flex-shrink-0">
                    <Gift
                      size={18}
                      className={reward.claimed ? 'text-gray-400' : 'text-emerald-400'}
                    />
                  </div>

                  <div className="flex-1">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="text-white text-base font-semibold">{reward.title}</h3>
                      {reward.claimed && <CheckCircle size={18} className="text-green-400" />}
                    </div>

                    <p className="text-emerald-400 text-sm font-medium mb-2">{reward.amount}</p>

                    <div className="flex items-center justify-between">
                      <span className="text-gray-400 text-xs">{reward.source}</span>
                      <span className="text-gray-400 text-xs">{reward.time}</span>
                    </div>
                  </div>

                  {!reward.claimed && (
                    <ChevronRight size={18} className="text-emerald-400 flex-shrink-0" />
                  )}
                </div>
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>

      {/* 보상 결과 모달 */}
      <RewardResultModal
        isOpen={modal.isOpen}
        onClose={closeModal}
        type={modal.type}
        title={modal.title}
        message={modal.message}
        reward={modal.reward}
      />
    </div>
  );
}

interface UserLevel {
  currentLevel: number;
  currentPoints: number;
  pointsToNext: number;
  totalPoints: number;
  levelName: string;
}

function RewardDashboard({ userLevel }: { userLevel: UserLevel }) {
  const progressPercentage =
    (userLevel.currentPoints / (userLevel.currentPoints + userLevel.pointsToNext)) * 100;

  return (
    <motion.div
      className="relative"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
    >
      <div
        className="relative p-6 rounded-2xl backdrop-blur-xl border overflow-hidden
                      bg-gradient-to-br from-purple-900/30 to-purple-800/40 border-purple-600/50
                      shadow-[0_8px_32px_rgba(0,0,0,0.4)] transform-gpu"
      >
        {/* 강화된 내부 테두리 */}
        <div className="absolute inset-[1px] rounded-2xl border border-purple-400/20 pointer-events-none"></div>

        {/* 포인트 효과 */}
        <div className="absolute inset-0 bg-gradient-to-br from-purple-400/10 via-transparent to-black/20 pointer-events-none"></div>

        <div className="relative z-10">
          {/* 포인트 잔액 */}
          <div className="text-center mb-6">
            <div className="flex items-center justify-center gap-2 mb-2">
              <Gem className="w-6 h-6 text-purple-400" />
              <span className="text-2xl font-black text-white">
                {userLevel.currentPoints.toLocaleString()}
              </span>
              <span className="text-sm text-purple-300">포인트</span>
            </div>
            <div className="text-sm text-slate-300">사용 가능한 포인트</div>
          </div>

          {/* 레벨 정보 */}
          <div className="mb-4">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <Award className="w-5 h-5 text-amber-400" />
                <span className="text-lg font-bold text-white">레벨 {userLevel.currentLevel}</span>
              </div>
              <div className="text-amber-300 text-sm font-medium">{userLevel.levelName}</div>
            </div>

            {/* 진행률 바 */}
            <div className="relative">
              <ProgressBar
                value={userLevel.currentPoints}
                max={userLevel.currentPoints + userLevel.pointsToNext}
                variant="gradient"
                size="sm"
                className="mb-1"
              />
              <div className="flex justify-between text-xs text-slate-400">
                <span>현재: {userLevel.currentPoints.toLocaleString()}</span>
                <span>다음: {userLevel.pointsToNext.toLocaleString()} 필요</span>
              </div>
            </div>
          </div>

          {/* 총 포인트 */}
          <div className="text-center text-sm text-slate-300">
            총 획득 포인트: {userLevel.totalPoints.toLocaleString()}
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function RewardItemCard({
  item,
  onExchange,
}: {
  item: RewardItem;
  onExchange: (itemId: string) => void;
}) {
  const handleExchange = () => {
    if (item.isAvailable) {
      onExchange(item.id);
    }
  };

  const getRarityColor = (rarity: string) => {
    switch (rarity) {
      case 'COMMON':
        return 'border-gray-500/50 bg-gray-900/20';
      case 'RARE':
        return 'border-blue-500/50 bg-blue-900/20';
      case 'EPIC':
        return 'border-purple-500/50 bg-purple-900/20';
      case 'LEGENDARY':
        return 'border-amber-500/50 bg-amber-900/20';
      default:
        return 'border-gray-500/50 bg-gray-900/20';
    }
  };

  return (
    <motion.div
      className="relative group cursor-pointer"
      whileHover={{ y: -6, scale: 1.01 }}
      whileTap={{ scale: 0.97 }}
      onClick={handleExchange}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
    >
      <div
        className={`relative h-[280px] p-4 rounded-2xl backdrop-blur-xl border overflow-hidden
                      bg-gradient-to-br from-slate-800/95 to-slate-900/90 border-slate-600/50
                      shadow-[0_8px_32px_rgba(0,0,0,0.4)] hover:shadow-[0_16px_48px_rgba(0,0,0,0.5)] 
                      transition-all duration-500 
                      hover:bg-opacity-100 flex flex-col justify-between
                      transform-gpu ${getRarityColor(item.rarity)}`}
      >
        {/* 강화된 내부 테두리 */}
        <div className="absolute inset-[1px] rounded-2xl border border-white/10 pointer-events-none"></div>

        {/* 아이템별 포인트 컬러 효과 */}
        <div
          className={`absolute inset-0 bg-gradient-to-br from-${item.accent}/10 via-transparent to-black/20 pointer-events-none`}
        ></div>
        <div
          className={`absolute top-0 right-0 w-16 h-16 bg-gradient-to-bl from-${item.accent}/15 to-transparent rounded-full blur-2xl`}
        ></div>

        {/* 상단 컨텐츠 */}
        <div className="relative z-10">
          {/* 등급 표시 */}
          <div className="absolute top-0 right-0 z-20">
            <div
              className={`px-2 py-1 rounded-full text-[9px] font-bold uppercase tracking-wider
                            ${
                              item.rarity === 'LEGENDARY'
                                ? 'bg-amber-500/20 text-amber-300 border border-amber-500/50'
                                : item.rarity === 'EPIC'
                                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/50'
                                : item.rarity === 'RARE'
                                ? 'bg-blue-500/20 text-blue-300 border border-blue-500/50'
                                : 'bg-gray-500/20 text-gray-300 border border-gray-500/50'
                            }`}
            >
              {item.rarity}
            </div>
          </div>

          {/* 아이콘 */}
          <div className="mb-4 mt-2">
            <motion.div
              className="w-12 h-12 mx-auto rounded-xl 
                        bg-gradient-to-br from-slate-600/70 to-slate-700/90 
                        flex items-center justify-center border border-slate-500/50
                        group-hover:from-slate-500/70 group-hover:to-slate-600/90 
                        transition-all duration-500 shadow-lg backdrop-blur-md"
              whileHover={{ rotate: 5 }}
              transition={{ duration: 0.3 }}
            >
              {item.icon}
            </motion.div>
          </div>

          {/* 제목과 설명 */}
          <div className="text-center mb-4">
            <motion.h3 className="text-base font-black text-white mb-2 leading-tight drop-shadow-lg">
              {item.name}
            </motion.h3>
            <p className="text-xs text-slate-100 leading-relaxed px-1 drop-shadow-sm">
              {item.description.substring(0, 50)}...
            </p>
          </div>

          {/* 가격 및 재고 */}
          <div className="mb-4">
            <div className="flex items-center justify-center gap-2 text-xs">
              <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-700/60 border border-slate-600/60 backdrop-blur-sm">
                <Gem className="w-3 h-3 text-purple-400" />
                <span className="text-white font-medium">{item.cost.toLocaleString()}</span>
              </div>
              {item.stock && (
                <div className="flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-700/60 border border-slate-600/60 backdrop-blur-sm">
                  <span className="text-white font-medium">재고: {item.stock}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 하단 교환 버튼 */}
        <div className="relative z-10">
          <motion.div
            className={`w-full py-3 px-4 rounded-xl 
                       border transition-all duration-500 
                       flex items-center justify-center gap-2 
                       shadow-lg hover:shadow-xl backdrop-blur-sm
                       text-white font-bold relative overflow-hidden
                       ${
                         item.isAvailable
                           ? 'bg-gradient-to-r from-purple-600 to-purple-700 hover:from-purple-500 hover:to-purple-600 border-purple-500/70 hover:border-purple-400/80'
                           : 'bg-gradient-to-r from-slate-600 to-slate-700 border-slate-500/70 cursor-not-allowed'
                       }`}
            whileHover={item.isAvailable ? { scale: 1.02 } : {}}
            whileTap={item.isAvailable ? { scale: 0.98 } : {}}
          >
            {item.isAvailable && (
              <div
                className="absolute inset-0 bg-gradient-to-r from-transparent via-white/15 to-transparent 
                              skew-x-12 translate-x-full group-hover:translate-x-[-200%] transition-transform duration-1000"
              ></div>
            )}
            <ShoppingCart className="w-4 h-4 text-white relative z-10 drop-shadow" />
            <span className="text-white relative z-10 drop-shadow">
              {item.isAvailable ? '교환하기' : '품절'}
            </span>
          </motion.div>
        </div>
      </div>
    </motion.div>
  );
}

function RewardHistory({ transactions }: { transactions: PointTransaction[] }) {
  return (
    <motion.div
      className="relative"
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.6, ease: "easeOut" }}
    >
      <div className="relative p-6 rounded-2xl backdrop-blur-xl border overflow-hidden
                      bg-gradient-to-br from-slate-800/95 to-slate-900/90 border-slate-600/50
                      shadow-[0_8px_32px_rgba(0,0,0,0.4)] transform-gpu">
        
        <div className="absolute inset-[1px] rounded-2xl border border-white/10 pointer-events-none"></div>
        
        <div className="relative z-10">
          <div className="flex items-center gap-2 mb-4">
            <Clock className="w-5 h-5 text-blue-400" />
            <h3 className="text-lg font-bold text-white">포인트 히스토리</h3>
          </div>

          <div className="space-y-3 max-h-60 overflow-y-auto">
            {transactions.map((transaction) => (
              <div key={transaction.id} className="flex items-center justify-between p-3 rounded-lg bg-slate-700/30 border border-slate-600/30">
                <div className="flex items-center gap-3">
                  <div className={`w-8 h-8 rounded-full flex items-center justify-center
                                  ${transaction.type === 'EARN' ? 'bg-green-500/20' : 'bg-red-500/20'}`}>
                    {transaction.type === 'EARN' ? (
                      <TrendingUp className="w-4 h-4 text-green-400" />
                    ) : (
                      <TrendingDown className="w-4 h-4 text-red-400" />
                    )}
                  </div>
                  <div>
                    <div className="text-sm text-white font-medium">
                      {transaction.description}
                    </div>
                    <div className="text-xs text-slate-400">
                      {new Date(transaction.timestamp).toLocaleDateString()}
                    </div>
                  </div>
                </div>
                <div className={`text-sm font-bold
                                ${transaction.type === 'EARN' ? 'text-green-400' : 'text-red-400'}`}>
                  {transaction.type === 'EARN' ? '+' : '-'}{transaction.amount.toLocaleString()}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </motion.div>
  );
}
