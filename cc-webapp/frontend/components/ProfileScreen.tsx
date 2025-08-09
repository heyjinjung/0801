'use client';

import React, { useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import { ArrowLeft, Star, Trophy, Target, Flame, Award, Coins, LogIn, UserX } from 'lucide-react';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { Progress } from './ui/progress';
import { User, UserStats, UserBalance } from '../types/user';
import { userApi } from '../utils/apiClient';
import { isAuthenticated, getTokens } from '../utils/tokenStorage';

interface ProfileScreenProps {
  onBack: () => void;
  onAddNotification: (message: string) => void;
}

export function ProfileScreen({ onBack, onAddNotification }: ProfileScreenProps) {
  const [user, setUser] = useState(null);
  const [stats, setStats] = useState(null);
  const [balance, setBalance] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<any>(null);
  const [balance, setBalance] = useState<any>(null);
  const [stats, setStats] = useState<any>(null);
  const [authChecked, setAuthChecked] = useState(false);

  useEffect(() => {
    const checkAuthAndFetchData = async () => {
      try {
        setLoading(true);

        // 먼저 localStorage에서 토큰 확인
        const tokens = getTokens();
        const accessToken = tokens?.access_token;
        if (!accessToken) {
          console.log('액세스 토큰이 없습니다. 로그인이 필요합니다.');
          setError('로그인이 필요합니다.');
          setAuthChecked(true);
          setLoading(false);
          onAddNotification('로그인 후 프로필을 확인할 수 있습니다.');
          return;
        }

        console.log('액세스 토큰이 있습니다. 프로필 데이터를 가져옵니다...');

        // 인증된 경우 프로필 데이터 가져오기
        const [profileData, statsData, balanceData] = await Promise.all([
          userApi.getProfile(),
          userApi.getStats(),
          userApi.getBalance(),
        ]);

        console.log('프로필 데이터 로드 성공:', { profileData, statsData, balanceData });

        setUser(profileData);
        setStats(statsData);
        setBalance(balanceData);
        setAuthChecked(true);
      } catch (err) {
        console.error('프로필 데이터 로드 에러:', err);

        const errorMessage = err instanceof Error ? err.message : '알 수 없는 오류가 발생했습니다.';

        if (
          errorMessage.includes('인증이 만료되었습니다') ||
          errorMessage.includes('다시 로그인해주세요')
        ) {
          setError('인증이 만료되었습니다. 다시 로그인해주세요.');
          onAddNotification('세션이 만료되었습니다. 다시 로그인해주세요.');
        } else {
          setError('프로필 데이터를 불러올 수 없습니다.');
          onAddNotification('프로필 로드 중 오류가 발생했습니다.');
        }
        setAuthChecked(true);
      } finally {
        setLoading(false);
      }
    };

    checkAuthAndFetchData();
  }, [onAddNotification]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-background via-black/95 to-primary/5">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center"
        >
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-primary mx-auto mb-4"></div>
          <p className="text-lg text-muted-foreground">프로필을 불러오는 중...</p>
        </motion.div>
      </div>
    );
  }

  if (error && !user) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background via-black/95 to-primary/5 relative">
        <div className="absolute inset-0 bg-gradient-to-br from-transparent via-primary/3 to-gold/5 pointer-events-none" />

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="relative z-10 min-h-screen flex flex-col items-center justify-center p-4"
        >
          <Card className="glass-effect max-w-md w-full p-8 text-center border-border-secondary/50">
            <div className="mb-6">
              {error.includes('로그인이 필요합니다') ? (
                <UserX className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
              ) : (
                <LogIn className="w-16 h-16 text-primary mx-auto mb-4" />
              )}
            </div>

            <h2 className="text-xl font-bold mb-4 text-foreground">
              {error.includes('로그인이 필요합니다') ? '로그인이 필요합니다' : '인증 오류'}
            </h2>

            <p className="text-muted-foreground mb-6">{error}</p>

            <div className="space-y-3">
              <Button
                onClick={onBack}
                className="w-full glass-effect hover:bg-primary/10 transition-all duration-300"
              >
                <ArrowLeft className="w-4 h-4 mr-2" />
                홈으로 돌아가기
              </Button>

              {error.includes('로그인이 필요합니다') && (
                <div className="space-y-2">
                  <Button
                    variant="default"
                    className="w-full bg-primary hover:bg-primary/90 transition-all duration-300"
                    onClick={async () => {
                      try {
                        // 테스트 로그인 시도
                        console.log('테스트 로그인 시도...');
                        const loginResponse = await fetch('http://localhost:8000/api/auth/login', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            site_id: 'test123',
                            password: 'password123',
                          }),
                        });

                        if (loginResponse.ok) {
                          const loginData = await loginResponse.json();
                          localStorage.setItem('access_token', loginData.access_token);
                          localStorage.setItem(
                            'refresh_token',
                            loginData.refresh_token || loginData.access_token
                          );
                          onAddNotification('테스트 로그인 성공!');
                          // 페이지 새로고침으로 프로필 다시 로드
                          window.location.reload();
                        } else {
                          onAddNotification('테스트 로그인 실패. 테스트 계정이 없습니다.');
                        }
                      } catch (err) {
                        console.error('로그인 오류:', err);
                        onAddNotification('로그인 중 오류가 발생했습니다.');
                      }
                    }}
                  >
                    <LogIn className="w-4 h-4 mr-2" />
                    테스트 로그인 (test123)
                  </Button>

                  <Button
                    variant="outline"
                    className="w-full glass-effect hover:bg-primary/10 transition-all duration-300"
                    onClick={() => {
                      // 로그인 페이지로 이동 로직 추가 필요
                      onAddNotification('실제 로그인 기능이 곧 추가될 예정입니다.');
                    }}
                  >
                    <LogIn className="w-4 h-4 mr-2" />
                    정식 로그인하기
                  </Button>
                </div>
              )}
            </div>
          </Card>
        </motion.div>
      </div>
    );
  }

  // 안전한 계산을 위한 체크
  const progressToNext =
    user?.experience && user?.maxExperience ? (user.experience / user.maxExperience) * 100 : 0;

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-black/95 to-primary/5 relative">
      {/* 배경 효과 */}
      <div className="absolute inset-0 bg-gradient-to-br from-transparent via-primary/3 to-gold/5 pointer-events-none" />

      {/* 헤더 */}
      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 p-4 lg:p-6 border-b border-border-secondary/50 backdrop-blur-xl bg-card/80"
      >
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              onClick={onBack}
              className="glass-effect hover:bg-primary/10 transition-all duration-300"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              뒤로가기
            </Button>

            <h1 className="text-xl lg:text-2xl font-bold text-gradient-primary">프로필</h1>
          </div>

          <div className="glass-effect rounded-xl p-3 border border-primary/20">
            <div className="text-right">
              <div className="text-sm text-muted-foreground">{user?.nickname || '사용자'}</div>
              <div className="text-lg font-bold text-primary">프로필</div>
            </div>
          </div>
        </div>
      </motion.header>

      {/* 메인 콘텐츠 - 2개 카드형 구조 */}
      <div className="relative z-10 p-4 lg:p-6 pb-20">
        <div className="max-w-4xl mx-auto space-y-6">
          {/* 🎯 첫 번째 카드: 단순화된 프로필 정보 */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="relative"
          >
            <Card className="glass-effect p-8 border-2 border-primary/30 bg-gradient-to-r from-primary/10 to-gold/10 card-hover-float overflow-hidden">
              {/* 배경 패턴 */}
              <div className="absolute inset-0 opacity-5">
                <div className="absolute top-4 right-4 text-8xl">⭐</div>
                <div className="absolute bottom-4 left-4 text-6xl">💰</div>
              </div>

              <div className="relative z-10 text-center space-y-6">
                {/* 🎯 닉네임 (단순하게) */}
                <div>
                  <h2 className="text-4xl font-black text-gradient-primary mb-4">
                    {user?.nickname || '사용자'}
                  </h2>

                  {/* 🎯 연속출석일만 표시 */}
                  <div className="flex justify-center">
                    <Badge className="bg-success/20 text-success border-success/30 px-4 py-2 text-lg">
                      <Flame className="w-5 h-5 mr-2" />
                      {user?.dailyStreak || 0}일 연속 출석
                    </Badge>
                  </div>
                </div>

                {/* 🎯 경험치 진행도 */}
                <div className="space-y-3 max-w-md mx-auto">
                  <div className="flex items-center justify-between text-lg">
                    <span className="font-medium">경험치 진행도</span>
                    <span className="font-bold">
                      {user?.experience?.toLocaleString() || 0} /{' '}
                      {user?.maxExperience?.toLocaleString() || 1000} XP
                    </span>
                  </div>
                  <div className="relative">
                    <Progress value={progressToNext} className="h-4 bg-secondary/50" />
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${progressToNext}%` }}
                      transition={{ duration: 1.5, delay: 0.5 }}
                      className="absolute top-0 left-0 h-full bg-gradient-to-r from-primary to-gold rounded-full"
                    />
                  </div>
                  <div className="text-center text-lg text-muted-foreground">
                    다음 레벨까지 {progressToNext.toFixed(1)}%
                  </div>
                </div>

                {/* 🎯 보유 골드 (크게 표시) */}
                <div className="bg-gold/10 border-2 border-gold/30 rounded-2xl p-6 max-w-sm mx-auto">
                  <div className="text-center">
                    <div className="text-sm text-muted-foreground mb-2">현재 보유 골드</div>
                    <div className="text-4xl font-black text-gradient-gold mb-2">
                      {balance?.cyber_token_balance?.toLocaleString() || 0}
                    </div>
                    <div className="text-lg text-gold font-bold">GOLD</div>
                  </div>
                </div>
              </div>
            </Card>
          </motion.div>

          {/* 두 번째 카드: 게임 기록 (기존 유지) */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
          >
            <Card className="glass-effect p-8 border border-success/20 card-hover-float">
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-full bg-gradient-to-br from-success to-primary p-2">
                  <Trophy className="w-full h-full text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-foreground">게임 기록</h3>
                  <p className="text-sm text-muted-foreground">플레이한 게임들</p>
                </div>
              </div>

              {/* 게임별 간단한 기록 */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* 게임 플레이 기록 */}
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-4 rounded-lg bg-primary/5 border border-primary/10">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">🎰</span>
                      <div>
                        <div className="font-medium">네온 슬롯</div>
                        <div className="text-xs text-muted-foreground">슬롯 게임</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold text-primary">
                        {stats?.total_games_played || 0}회
                      </div>
                      <div className="text-xs text-gold">
                        최고: {user?.gameStats?.slot?.biggestWin?.toLocaleString() || 0}G
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-4 rounded-lg bg-success/5 border border-success/10">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">✂️</span>
                      <div>
                        <div className="font-medium">가위바위보</div>
                        <div className="text-xs text-muted-foreground">대전 게임</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold text-success">
                        {user?.gameStats?.rps?.matches || 0}회
                      </div>
                      <div className="text-xs text-primary">
                        연승: {user?.gameStats?.rps?.winStreak || 0}회
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-4 rounded-lg bg-error/5 border border-error/10">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">🚀</span>
                      <div>
                        <div className="font-medium">네온 크래시</div>
                        <div className="text-xs text-muted-foreground">크래시 게임</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold text-error">
                        {user?.gameStats?.crash?.games || 0}회
                      </div>
                      <div className="text-xs text-gold">
                        최고: {user?.gameStats?.crash?.biggestWin?.toLocaleString() || 0}G
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center justify-between p-4 rounded-lg bg-warning/5 border border-warning/10">
                    <div className="flex items-center gap-3">
                      <span className="text-2xl">🎁</span>
                      <div>
                        <div className="font-medium">가챠 뽑기</div>
                        <div className="text-xs text-muted-foreground">뽑기 게임</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="text-lg font-bold text-warning">
                        {user?.gameStats?.gacha?.pulls || 0}회
                      </div>
                      <div className="text-xs text-error">
                        전설: {user?.gameStats?.gacha?.legendaryCount || 0}개
                      </div>
                    </div>
                  </div>
                </div>

                {/* 전체 요약 (단순화) */}
                <div className="space-y-4">
                  <h4 className="font-bold text-foreground flex items-center gap-2">
                    <Target className="w-4 h-4 text-primary" />
                    전체 요약
                  </h4>

                  <div className="grid grid-cols-1 gap-3">
                    <div className="text-center p-4 rounded-lg bg-primary/5 border border-primary/10">
                      <div className="text-2xl font-bold text-primary">
                        {stats?.total_games_played || 0}
                      </div>
                      <div className="text-sm text-muted-foreground">총 게임 수</div>
                    </div>

                    <div className="text-center p-4 rounded-lg bg-gold/5 border border-gold/10">
                      <div className="text-2xl font-bold text-gradient-gold">
                        {stats?.total_wins || 0} 승
                      </div>
                      <div className="text-sm text-muted-foreground">총 수익</div>
                    </div>

                    <div className="text-center p-4 rounded-lg bg-success/5 border border-success/10">
                      <div className="text-2xl font-bold text-success">
                        {user?.inventory?.length || 0}
                      </div>
                      <div className="text-sm text-muted-foreground">보유 아이템</div>
                    </div>
                  </div>

                  {/* 업적 미리보기 (단순화) */}
                  <div className="mt-6">
                    <h4 className="font-bold text-foreground mb-3 flex items-center gap-2">
                      <Award className="w-4 h-4 text-gold" />
                      업적
                    </h4>

                    <div className="space-y-2">
                      <div className="flex items-center gap-3 p-3 rounded-lg bg-gold/5 border border-gold/10">
                        <span className="text-2xl">👋</span>
                        <div className="flex-1">
                          <div className="font-medium text-sm">첫 게임</div>
                          <div className="text-xs text-muted-foreground">게임을 시작했습니다</div>
                        </div>
                        <Badge className="bg-gold/20 text-gold border-gold/30 text-xs">완료</Badge>
                      </div>

                      <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/5 border border-muted/10">
                        <span className="text-2xl">🌱</span>
                        <div className="flex-1">
                          <div className="font-medium text-sm">성장</div>
                          <div className="text-xs text-muted-foreground">레벨 10 달성하기</div>
                        </div>
                        <Badge className="bg-muted/20 text-muted-foreground border-muted/30 text-xs">
                          {user?.level || 0}/10
                        </Badge>
                      </div>

                      <div className="flex items-center gap-3 p-3 rounded-lg bg-muted/5 border border-muted/10">
                        <span className="text-2xl">💰</span>
                        <div className="flex-1">
                          <div className="font-medium text-sm">부자</div>
                          <div className="text-xs text-muted-foreground">100,000G 모으기</div>
                        </div>
                        <Badge className="bg-muted/20 text-muted-foreground border-muted/30 text-xs">
                          {Math.min(100, Math.floor((balance?.cyber_token_balance || 0) / 1000))}%
                        </Badge>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </Card>
          </motion.div>
        </div>
      </div>
    </div>
  );
}