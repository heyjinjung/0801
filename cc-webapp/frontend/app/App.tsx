'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { LoadingScreen } from '../components/LoadingScreen';
import { LoginScreen } from '../components/LoginScreen';
import { SignupScreen } from '../components/SignupScreen';
import { AdminLoginScreen } from '../components/AdminLoginScreen';
import { HomeDashboard } from '../components/HomeDashboard';

import { SettingsScreen } from '../components/SettingsScreen';
import { ShopScreen } from '../components/ShopScreen';
import { InventoryScreen } from '../components/InventoryScreen';
import { ProfileScreen } from '../components/ProfileScreen';
import { SideMenu } from '../components/SideMenu';
import { AdminPanel } from '../components/AdminPanel';
import { EventMissionPanel } from '../components/EventMissionPanel';
import { BottomNavigation } from '../components/BottomNavigation';
import { NeonSlotGame } from '../components/games/NeonSlotGame';
import { RockPaperScissorsGame } from '../components/games/RockPaperScissorsGame';
import { GachaSystem } from '../components/games/GachaSystem';
import { NeonCrashGame } from '../components/games/NeonCrashGame';
import { StreamingScreen } from '../components/StreamingScreen';
import { useNotificationSystem } from '../components/NotificationSystem';
import { useUserManager } from '../hooks/useUserManager';
import { useAppNavigation } from '../hooks/useAppNavigation';
// NOTE: Deprecated useAuthHandlers (local simulation) removed – now using real backend auth via useAuth
import { useAuth } from '../hooks/useAuth';
import { GlobalStoreProvider } from '@/store/globalStore';
import { EnsureHydrated, RealtimeSyncProvider } from '../lib/sync';
import { ensureTokenBundleMigrated } from '../utils/tokenStorage';
import DailyRewardClaimedDialog from '../components/rewards/DailyRewardClaimedDialog';
import {
  APP_CONFIG,
  SCREENS_WITH_BOTTOM_NAV,
  NOTIFICATION_MESSAGES,
} from '../constants/appConstants';
import { NOTIFICATION_STYLES } from '../constants/notificationConstants';

type NotificationItem = { id: string | number; message: React.ReactNode };

export default function App() {
  // [Auth Bootstrap] 모듈 로드 시 즉시 레거시 토큰 → 번들 마이그레이션 보장
  // 테스트/초기 렌더 타이밍 이슈 방지를 위해 useEffect 이전에 수행
  try {
    if (typeof window !== 'undefined') {
      const bundle = ensureTokenBundleMigrated();
      // 번들 토큰을 쿠키에도 동기화하여 미들웨어가 Authorization 주입 가능하도록 함
      try {
        const at = bundle?.access_token;
        if (at) document.cookie = `cc_access_token=${encodeURIComponent(at)}; Path=/; SameSite=Lax`;
      } catch { /* noop */ }
      // 전역 fetch 패치: /api/* 요청에 Authorization 자동 부착(헤더 미존재 시)
      const w = window as unknown as Record<string, any>;
      if (!w.__authFetchPatched) {
        const origFetch = window.fetch.bind(window);
        w.__authFetchPatched = true;
        window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
          try {
            const url = typeof input === 'string' ? input : (input as Request).url;
            if (url && /\/api\//.test(url)) {
              const headers = new Headers(init?.headers || {});
              if (!headers.has('Authorization')) {
                // 토큰은 번들 → 쿠키(cc_at) 순으로 조회
                let token: string | undefined;
                try {
                  const raw = localStorage.getItem('cc_auth_tokens');
                  if (raw) token = (JSON.parse(raw) || {}).access_token;
                } catch { /* noop */ }
        if (!token && typeof document !== 'undefined') {
                  try {
          const m = document.cookie.match(/(?:^|; )cc_access_token=([^;]+)/);
                    token = m ? decodeURIComponent(m[1]) : undefined;
                  } catch { /* noop */ }
                }
                if (token) headers.set('Authorization', `Bearer ${token}`);
              }
              init = { ...(init || {}), headers };
            }
          } catch { /* noop */ }
          return origFetch(input as any, init);
        };
      }
    }
  } catch { /* noop */ }

  const [isLoading, setIsLoading] = useState(false);
  const [hasInitialized, setHasInitialized] = useState(false);

  // 부트스트랩: 가장 먼저 토큰 번들 마이그레이션을 보장해 초기 API/WS에 Authorization 누락이 없도록 함.
  useEffect(() => {
    // 보수적 중복 호출(안전): 초기 마운트 시 한 번 더 보장
    try { ensureTokenBundleMigrated(); } catch { /* noop */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 🎯 커스텀 훅으로 상태 관리 분리
  const {
    user,
    updateUser,
    isAdminAccount,
    createUserData,
    restoreSavedUser,
    processDailyBonus,
    logout,
  } = useUserManager();

  const {
    currentScreen,
    isSideMenuOpen,
    navigationHandlers,
    toggleSideMenu,
    closeSideMenu,
    handleBottomNavigation,
  } = useAppNavigation();

  // 📱 알림 시스템
  const { notifications, addNotification } = useNotificationSystem();

  // 🔐 실제 백엔드 인증 훅 (JWT 토큰 저장 & 프로필 fetch)
  const auth = useAuth();

  // ---------------------------------------------------------------------------
  // Backend 연동 어댑터 함수들
  // 기존 컴포넌트들은 nickname 기반 User (game-user) 객체를 기대하므로
  // 서버 인증 성공 후 기존 createUserData 로 UI용 사용자 상태를 구성 (임시)
  // 향후: 서버 프로필 스키마와 UI User 타입 통합 예정.
  // ---------------------------------------------------------------------------

  const handleLogin = React.useCallback(
    async (nickname: string, password: string): Promise<boolean> => {
      setIsLoading(true);
      try {
        // backend login 은 site_id 를 요구 – 현재 UI 입력 nickname 을 site_id 로 간주
        await auth.login(nickname, password); // 실패 시 throw
        const userData = createUserData(nickname, password, false);
        updateUser(userData);
        navigationHandlers.toHome();
        addNotification(
          NOTIFICATION_MESSAGES.LOGIN_SUCCESS(nickname, isAdminAccount(nickname, password))
        );
        return true;
      } catch (e) {
        console.error('[App] 로그인 실패:', e);
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [
      auth,
      setIsLoading,
      createUserData,
      updateUser,
      navigationHandlers,
      addNotification,
      isAdminAccount,
    ]
  );

  const handleSignup = React.useCallback(
    async (formData: any): Promise<boolean> => {
      setIsLoading(true);
      try {
        // formData: { userId, nickname, phoneNumber, password, confirmPassword, inviteCode }
        await auth.signup({
          site_id: formData.userId,
          nickname: formData.nickname,
          phone_number: formData.phoneNumber,
          password: formData.password,
          invite_code: formData.inviteCode || '',
        });
        const userData = createUserData(formData.nickname, '', true, formData.inviteCode);
        updateUser(userData);
        navigationHandlers.toHome();
        addNotification(NOTIFICATION_MESSAGES.SIGNUP_SUCCESS(userData.goldBalance));
        return true;
      } catch (e) {
        console.error('[App] 회원가입 실패:', e);
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [auth, setIsLoading, createUserData, updateUser, navigationHandlers, addNotification]
  );

  const handleAdminLogin = React.useCallback(
    async (adminId: string, password: string): Promise<boolean> => {
      setIsLoading(true);
      try {
        await auth.adminLogin(adminId, password);
        // 백엔드에서 관리자 검증을 처리하므로 프론트엔드 검증 불필요
        const adminUser = createUserData(adminId, password, false);
        updateUser(adminUser);
        addNotification(NOTIFICATION_MESSAGES.ADMIN_LOGIN_SUCCESS);
        navigationHandlers.toAdminPanel();
        return true;
      } catch (e) {
        console.error('[App] 관리자 로그인 실패:', e);
        return false;
      } finally {
        setIsLoading(false);
      }
    },
    [auth, setIsLoading, createUserData, updateUser, navigationHandlers, addNotification]
  );

  const handleLogout = React.useCallback(() => {
    try {
      auth.logout();
    } catch {
      /* ignore */
    }
    logout(); // UI user state
    closeSideMenu();
    navigationHandlers.toLogin();
    addNotification(NOTIFICATION_MESSAGES.LOGOUT_SUCCESS);
  }, [auth, logout, closeSideMenu, navigationHandlers, addNotification]);

  // 🔄 앱 초기화 - 한 번만 실행되도록 개선
  useEffect(() => {
    if (hasInitialized) return;

    const initializeApp = async () => {
      try {
        const savedUser = restoreSavedUser();
        if (savedUser) {
          updateUser(savedUser);
          navigationHandlers.toHome();

          // 🎁 일일 보너스 체크
          const lastLogin = new Date(savedUser.lastLogin);
          const today = new Date();
          const timeDiff = today.getTime() - lastLogin.getTime();
          const daysDiff = Math.floor(timeDiff / (1000 * 3600 * 24));

          if (daysDiff >= 1) {
            const { updatedUser, bonusGold } = processDailyBonus(savedUser);
            updateUser(updatedUser);
            addNotification(NOTIFICATION_MESSAGES.DAILY_BONUS(bonusGold, updatedUser.dailyStreak));
          }
        }

        setHasInitialized(true);
      } catch (error) {
        console.error('App initialization failed:', error);
        setHasInitialized(true);
      }
    };

    initializeApp();
  }, [
    hasInitialized,
    restoreSavedUser,
    updateUser,
    navigationHandlers,
    processDailyBonus,
    addNotification,
  ]);

  // 🏠 하단 네비게이션 표시 여부 결정 (메모이제이션)
  const showBottomNavigation = useMemo(() => {
    return SCREENS_WITH_BOTTOM_NAV.includes(currentScreen as any) && user;
  }, [currentScreen, user]);

  // ---------------------------------------------------------------------------
  // Daily Reward Claimed Dialog 상태 (이미 수령한 경우 노출)
  // 실제 트리거 지점은 Daily Reward 버튼 클릭 시 백엔드 응답이 'already claimed' 일 때 set true
  // ---------------------------------------------------------------------------
  const [isDailyRewardClaimedOpen, setDailyRewardClaimedOpen] = useState(false);
  const openDailyRewardClaimed = () => setDailyRewardClaimedOpen(true);
  const closeDailyRewardClaimed = () => setDailyRewardClaimedOpen(false);

  // 내일 알림 받기 (추후 서비스 워커/푸시 연동 예정) - 현재는 토스트로 스텁
  const handleScheduleDailyRewardReminder = () => {
    addNotification(
      <span className="text-amber-300">내일 00:00 리셋 알림이 예약(가상)되었습니다.</span>
    );
  };

  // 다른 게임 하기 버튼 -> 게임 대시보드 이동
  const handleNavigateToGamesFromDialog = () => {
    navigationHandlers.toGames();
  };

  return (
    <GlobalStoreProvider>
      <EnsureHydrated>
        <RealtimeSyncProvider>
          <div className="dark">
            {/* 📱 🎯 VIP 알림 시스템 */}
            <div className={NOTIFICATION_STYLES.CONTAINER}>
              <AnimatePresence>
                {notifications.map((notification: NotificationItem) => (
                  <motion.div
                    key={notification.id}
                    initial={NOTIFICATION_STYLES.ANIMATION.INITIAL}
                    animate={NOTIFICATION_STYLES.ANIMATION.ANIMATE}
                    exit={NOTIFICATION_STYLES.ANIMATION.EXIT}
                    className={NOTIFICATION_STYLES.ITEM}
                  >
                    {notification.message}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>

            {/* 🔧 사이드 메뉴 */}
            <SideMenu
              isOpen={isSideMenuOpen}
              onClose={closeSideMenu}
              onNavigateToAdminPanel={navigationHandlers.toAdminPanel}
              onNavigateToEventMissionPanel={navigationHandlers.toEventMissionPanel}
              onNavigateToSettings={navigationHandlers.toSettings}
              onLogout={handleLogout}
              onAddNotification={addNotification}
            />

            {/* 📱 메인 화면들 */}
            <AnimatePresence mode="wait">
              {currentScreen === 'loading' && (
                <React.Fragment key="loading">
                  <LoadingScreen
                    onComplete={navigationHandlers.toLogin}
                    gameTitle={APP_CONFIG.GAME_TITLE}
                  />
                </React.Fragment>
              )}

              {currentScreen === 'login' && (
                <React.Fragment key="login">
                  <LoginScreen
                    onLogin={handleLogin}
                    onSwitchToSignup={navigationHandlers.toSignup}
                    onAdminAccess={navigationHandlers.toAdminLogin}
                    isLoading={isLoading}
                  />
                </React.Fragment>
              )}

              {currentScreen === 'signup' && (
                <React.Fragment key="signup">
                  <SignupScreen
                    onSignup={handleSignup}
                    onBackToLogin={navigationHandlers.toLogin}
                    isLoading={isLoading}
                  />
                </React.Fragment>
              )}

              {currentScreen === 'admin-login' && (
                <React.Fragment key="admin-login">
                  <AdminLoginScreen
                    onAdminLogin={handleAdminLogin}
                    onBackToLogin={navigationHandlers.toLogin}
                    isLoading={isLoading}
                  />
                </React.Fragment>
              )}

              {currentScreen === 'home-dashboard' && user && (
                <React.Fragment key="home-dashboard">
                  <HomeDashboard
                    user={user}
                    onLogout={handleLogout}
                    onNavigateToGames={navigationHandlers.toGames}
                    onNavigateToShop={navigationHandlers.toShop}
                    onNavigateToSettings={navigationHandlers.toSettings}
                    onNavigateToStreaming={navigationHandlers.toStreaming}
                    onUpdateUser={updateUser}
                    onAddNotification={addNotification}
                    onToggleSideMenu={toggleSideMenu}
                  />
                </React.Fragment>
              )}

              {currentScreen === 'shop' && user && (
                <React.Fragment key="shop">
                  <ShopScreen
                    user={user}
                    onBack={navigationHandlers.backToHome}
                    onNavigateToInventory={navigationHandlers.toInventory}
                    onNavigateToProfile={navigationHandlers.toProfile}
                    onUpdateUser={updateUser}
                    onAddNotification={addNotification}
                  />
                </React.Fragment>
              )}

              {currentScreen === 'inventory' && user && (
                <React.Fragment key="inventory">
                  <InventoryScreen
                    user={user}
                    onBack={navigationHandlers.backToHome}
                    onUpdateUser={updateUser}
                    onAddNotification={addNotification}
                  />
                </React.Fragment>
              )}

              {currentScreen === 'profile' && (
                <React.Fragment key="profile">
                  <ProfileScreen
                    onBack={navigationHandlers.backToHome}
                    onAddNotification={addNotification}
                    sharedUser={user}
                    onUpdateUser={updateUser}
                  />
                </React.Fragment>
              )}

              {currentScreen === 'settings' && user && (
                <React.Fragment key="settings">
                  <SettingsScreen
                    user={user}
                    onBack={navigationHandlers.backToHome}
                    onUpdateUser={updateUser}
                    onAddNotification={addNotification}
                  />
                </React.Fragment>
              )}

              {currentScreen === 'admin-panel' && user && (
                <React.Fragment key="admin-panel">
                  <AdminPanel
                    user={user}
                    onBack={navigationHandlers.backToHome}
                    onUpdateUser={updateUser}
                    onAddNotification={addNotification}
                  />
                </React.Fragment>
              )}

              {currentScreen === 'event-mission-panel' && user && (
                <React.Fragment key="event-mission-panel">
                  <EventMissionPanel
                    user={user}
                    onBack={navigationHandlers.backToHome}
                    onUpdateUser={updateUser}
                    onAddNotification={addNotification}
                  />
                </React.Fragment>
              )}

              {/* 🎮 게임들 */}
              {currentScreen === 'neon-slot' && user && (
                <React.Fragment key="neon-slot">
                  <NeonSlotGame
                    user={user}
                    onBack={navigationHandlers.backToGames}
                    onUpdateUser={updateUser}
                    onAddNotification={addNotification}
                  />
                </React.Fragment>
              )}

              {currentScreen === 'rock-paper-scissors' && user && (
                <React.Fragment key="rock-paper-scissors">
                  <RockPaperScissorsGame
                    user={user}
                    onBack={navigationHandlers.backToGames}
                    onUpdateUser={updateUser}
                    onAddNotification={addNotification}
                  />
                </React.Fragment>
              )}

              {currentScreen === 'gacha-system' && user && (
                <React.Fragment key="gacha-system">
                  <GachaSystem
                    user={user}
                    onBack={navigationHandlers.backToGames}
                    onUpdateUser={updateUser}
                    onAddNotification={addNotification}
                  />
                </React.Fragment>
              )}

              {currentScreen === 'neon-crash' && user && (
                <React.Fragment key="neon-crash">
                  <NeonCrashGame
                    user={user}
                    onBack={navigationHandlers.backToGames}
                    onUpdateUser={updateUser}
                    onAddNotification={addNotification}
                  />
                </React.Fragment>
              )}

              {currentScreen === 'streaming' && user && (
                <React.Fragment key="streaming">
                  <StreamingScreen
                    user={user}
                    onBack={navigationHandlers.backToHome}
                    onUpdateUser={updateUser}
                    onAddNotification={addNotification}
                  />
                </React.Fragment>
              )}
            </AnimatePresence>

            {/* 📱 하단 네비게이션 */}
            {showBottomNavigation && (
              <BottomNavigation
                currentScreen={currentScreen}
                onNavigate={handleBottomNavigation}
              />
            )}

            {/* 일일 보상 이미 수령 다이얼로그 */}
            <DailyRewardClaimedDialog
              open={isDailyRewardClaimedOpen}
              onClose={closeDailyRewardClaimed}
              onNavigateGame={handleNavigateToGamesFromDialog}
              onScheduleReminder={handleScheduleDailyRewardReminder}
            />
          </div>
        </RealtimeSyncProvider>
      </EnsureHydrated>
    </GlobalStoreProvider>
  );
}
