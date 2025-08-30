'use client';

import React, { useState, type ChangeEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Users,
  Plus,
  Gift,
  Shield,
  ShoppingCart,
  BarChart3,
  Percent,
  AlertTriangle,
  Eye,
  UserPlus,
  Wifi,
  Settings,
  Database,
  Server,
  Video,
  MessageSquare,
  ChevronRight,
  Activity,
  DollarSign,
  RefreshCw,
  Home,
  Terminal,
  Package,
} from 'lucide-react';
import { User } from '../types';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Card, CardContent } from './ui/card';
import { Alert, AlertDescription } from './ui/alert';
import { api as unifiedApi, apiCall } from '@/lib/unifiedApi';
import { useGlobalStore, reconcileBalance as reconcileAuthoritative } from '@/store/globalStore';

interface AdminPanelProps {
  user: User;
  onBack: () => void;
  onUpdateUser: (user: User) => void;
  onAddNotification: (message: string) => void;
  coreStats?: {
    total_users: number;
    active_users: number;
    online_users: number;
    total_revenue: number;
    today_revenue: number;
    critical_alerts: number;
    pending_actions: number;
  };
  loadingStats?: boolean;
  statsError?: string | null;
}

// 간단 읽기 전용 인벤토리 리스트 (글로벌 스토어 우선)
function InventoryListFallback({ user }: { user: User }) {
  // 지연 import (순환 방지)
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { useGlobalStore } = require('@/store/globalStore');
  const { state } = useGlobalStore();
  const list = (
    state?.inventory && state.inventory.length ? state.inventory : (user as any)?.inventory || []
  ) as Array<any>;

  if (!list.length) {
    return <div className="text-muted-foreground text-sm">표시할 아이템이 없습니다.</div>;
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
      {list.slice(0, 30).map((it: any) => (
        <div key={it.id} className="glass-effect rounded-lg p-3 flex items-center justify-between">
          <div className="min-w-0">
            <div className="text-sm text-foreground truncate">{it.name}</div>
            <div className="text-xs text-muted-foreground truncate">{it.description}</div>
          </div>
          <Badge variant="secondary" className="ml-3 text-xs">
            x{it.quantity || 1}
          </Badge>
        </div>
      ))}
    </div>
  );
}

// 💼 빠른 작업 메뉴 인터페이스
interface QuickAction {
  id: string;
  title: string;
  description: string;
  icon: React.ComponentType<any>;
  bgClass: string;
  shortcut?: string;
  category: 'user' | 'shop' | 'security' | 'system' | 'broadcast';
  onClick: () => void;
}

export function AdminPanel({
  user,
  onBack,
  onUpdateUser,
  onAddNotification,
  coreStats,
  loadingStats,
  statsError,
}: AdminPanelProps) {
  const [activeView, setActiveView] = useState(
    'menu' as 'menu' | 'dashboard' | 'users' | 'shop' | 'security' | 'system'
  );
  const [searchQuery, setSearchQuery] = useState('');
  const [adjustUserId, setAdjustUserId] = useState('');
  const [amount, setAmount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [inventoryUser, setInventoryUser] = useState(null as User | null);
  const [inventoryItems, setInventoryItems] = useState([] as any[]);
  const { state, dispatch } = useGlobalStore();
  const [shopItems, setShopItems] = useState([] as Array<{
    id: number;
    sku: string;
    name: string;
    price_cents: number;
    gold: number;
    discount_percent?: number;
    discount_ends_at?: string | null;
    min_rank?: string | null;
  }>);
  const [shopBusy, setShopBusy] = useState(false);
  const [shopError, setShopError] = useState(null as string | null);

  const loadShopItems = async () => {
    try {
      setShopError(null);
      const data = await unifiedApi.get('admin/shop/items');
      setShopItems(Array.isArray(data) ? data : []);
    } catch (e: any) {
      setShopError(e?.message || 'failed to load shop items');
    }
  };

  // 지급/차감 성공 시 현재 세션이면 권위 잔액으로 재조정
  const reconcileIfCurrent = (targetUserId: string | number) => {
    try {
      const pid = state?.profile?.id;
      if (pid == null) return;
      if (String(pid) !== String(targetUserId)) return;
      const gold = Number(state?.profile?.goldBalance ?? 0);
      const gems = Number((state?.profile as any)?.gemsBalance ?? 0);
  // 서버가 profile_update 브로드캐스트를 보낼 것이나, 현재 세션이면 즉시 서버 권위 잔액으로 재조정
  reconcileAuthoritative(dispatch, { gold, gems }).catch(() => {});
    } catch {
      /* noop */
    }
  };

  // 📊 핵심 통계: 전달된 props 기반 가공
  const statsView = {
    totalUsers: coreStats?.total_users ?? 0,
    activeUsers: coreStats?.active_users ?? 0,
    onlineUsers: coreStats?.online_users ?? 0,
    totalRevenue: coreStats?.total_revenue ?? 0,
    todayRevenue: coreStats?.today_revenue ?? 0,
    criticalAlerts: coreStats?.critical_alerts ?? 0,
    pendingActions: coreStats?.pending_actions ?? 0,
  };

  // 💼 빠른 작업 메뉴 정의 (globals.css 클래스 사용)
  const quickActions: QuickAction[] = [
    // 👥 사용자 관리
    {
      id: 'inventory',
      title: '인벤토리 보기',
      description: '유저 보유 아이템 조회',
      icon: Package,
      bgClass: 'bg-gradient-to-r from-primary to-success',
      category: 'user',
  onClick: () => setActiveView('inventory'),
    },
    {
      id: 'add-user',
      title: '사용자 추가',
      description: '새 사용자 계정 생성',
      icon: UserPlus,
      bgClass: 'bg-gradient-to-r from-success to-info',
      shortcut: 'Ctrl+U',
      category: 'user',
      onClick: () => setActiveView('users'),
    },
    {
      id: 'manage-users',
      title: '사용자 관리',
      description: '계정 상태 변경, 정보 수정',
      icon: Users,
      bgClass: 'bg-gradient-to-r from-primary to-primary-light',
      category: 'user',
      onClick: () => setActiveView('users'),
    },
    {
      id: 'ban-management',
      title: '제재 관리',
      description: '차단/정지 사용자 관리',
      icon: Shield,
      bgClass: 'bg-gradient-to-r from-error to-warning',
      category: 'user',
      onClick: () => setActiveView('security'),
    },
    {
      id: 'bulk-rewards',
      title: '일괄 보상 지급',
      description: '여러 사용자에게 보상 지급',
      icon: Gift,
      bgClass: 'bg-gradient-gold',
      category: 'user',
      onClick: () => onAddNotification('🎁 일괄 보상 지급 기능을 준비중입니다.'),
    },

    // 🛍️ 상점 관리
    {
      id: 'add-item',
      title: '상품 추가',
      description: '새 상점 아이템 등록',
      icon: Plus,
      bgClass: 'bg-gradient-to-r from-warning to-gold',
      category: 'shop',
      onClick: () => setActiveView('shop'),
    },
    {
      id: 'manage-shop',
      title: '상점 관리',
      description: '가격 조정, 재고 관리',
      icon: ShoppingCart,
      bgClass: 'bg-gradient-to-r from-info to-primary',
      category: 'shop',
      onClick: () => setActiveView('shop'),
    },
    {
      id: 'sales-analytics',
      title: '판매 분석',
      description: '매출 통계 및 인기 상품',
      icon: BarChart3,
      bgClass: 'bg-gradient-to-r from-success to-warning',
      category: 'shop',
      onClick: () => onAddNotification('📊 판매 분석 리포트를 생성중입니다.'),
    },
    {
      id: 'promotions',
      title: '프로모션 설정',
      description: '할인 이벤트 및 특가 설정',
      icon: Percent,
      bgClass: 'bg-gradient-to-r from-error to-primary',
      category: 'shop',
      onClick: () => onAddNotification('🏷️ 프로모션 설정 기능을 준비중입니다.'),
    },

    // 🛡️ 보안 관리
    {
      id: 'security-alerts',
      title: '보안 알림',
      description: '의심스러운 활동 모니터링',
      icon: AlertTriangle,
      bgClass: 'bg-gradient-to-r from-error to-error-soft',
      category: 'security',
      onClick: () => setActiveView('security'),
    },
    {
      id: 'fraud-detection',
      title: '부정행위 탐지',
      description: '자동 부정행위 감지 설정',
      icon: Eye,
      bgClass: 'bg-gradient-to-r from-warning to-error',
      category: 'security',
      onClick: () => setActiveView('security'),
    },
    {
      id: 'ip-management',
      title: 'IP 관리',
      description: 'IP 차단/허용 목록 관리',
      icon: Wifi,
      bgClass: 'bg-gradient-to-r from-info to-success',
      category: 'security',
      onClick: () => onAddNotification('🌐 IP 관리 패널을 준비중입니다.'),
    },

    // ⚙️ 시스템 관리
    {
      id: 'system-settings',
      title: '시스템 설정',
      description: '게임 설정 및 서버 관리',
      icon: Settings,
      bgClass: 'bg-gradient-metal',
      category: 'system',
      onClick: () => setActiveView('system'),
    },
    {
      id: 'backup-restore',
      title: '백업/복원',
      description: '데이터 백업 및 복원',
      icon: Database,
      bgClass: 'bg-gradient-to-r from-info to-primary',
      category: 'system',
      onClick: () => onAddNotification('💾 백업 시스템을 점검중입니다.'),
    },
    {
      id: 'server-status',
      title: '서버 상태',
      description: '서버 모니터링 및 성능',
      icon: Server,
      bgClass: 'bg-gradient-to-r from-success to-info',
      category: 'system',
      onClick: () => onAddNotification('🖥️ 서버 상태가 정상입니다.'),
    },

    // 📺 방송 관리
    {
      id: 'stream-control',
      title: '방송 제어',
      description: 'Luna Star 방송 설정',
      icon: Video,
      bgClass: 'bg-gradient-to-r from-primary to-error',
      category: 'broadcast',
      onClick: () => onAddNotification('📺 방송 제어 패널을 준비중입니다.'),
    },
    {
      id: 'chat-moderation',
      title: '채팅 관리',
      description: '채팅 모더레이션 및 필터',
      icon: MessageSquare,
      bgClass: 'bg-gradient-to-r from-warning to-primary',
      category: 'broadcast',
      onClick: () => onAddNotification('💬 채팅 관리 기능을 준비중입니다.'),
    },
  ];

  // 카테고리별 아이콘
  const categoryIcons = {
    user: Users,
    shop: ShoppingCart,
    security: Shield,
    system: Settings,
    broadcast: Video,
  };

  // 카테고리별 그룹화
  const actionsByCategory = quickActions.reduce((acc, action) => {
    if (!acc[action.category]) acc[action.category] = [];
    acc[action.category].push(action);
    return acc;
  }, {} as Record<string, QuickAction[]>);

  const categoryNames = {
    user: '👥 사용자 관리',
    shop: '🛍️ 상점 관리',
    security: '🛡️ 보안 관리',
    system: '⚙️ 시스템 관리',
    broadcast: '📺 방송 관리',
  };

  const categoryBgClasses = {
    user: 'bg-gradient-to-r from-success to-info',
    shop: 'bg-gradient-to-r from-warning to-gold',
    security: 'bg-gradient-to-r from-error to-warning',
    system: 'bg-gradient-metal',
    broadcast: 'bg-gradient-to-r from-primary to-error',
  };

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {loadingStats && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 w-full max-w-md px-4 z-50">
          <div className="animate-pulse rounded-md bg-gradient-to-r from-neutral-800/70 via-neutral-700/40 to-neutral-800/70 h-14 border border-neutral-700 shadow-lg" />
        </div>
      )}
      {statsError && !loadingStats && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 w-full max-w-lg px-4 z-50">
          <Alert variant="destructive" className="glass-metal border-error/50">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>실시간 통계 로딩 실패: {statsError} (기본값 표시중)</AlertDescription>
          </Alert>
        </div>
      )}
      {/* 🎯 상단 헤더 */}
      <motion.div
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 p-4 lg:p-6 border-b border-border-secondary glass-effect"
      >
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-4">
            <Button variant="outline" onClick={onBack} className="glass-metal btn-hover-lift">
              <ArrowLeft className="w-4 h-4 mr-2" />
              뒤로가기
            </Button>

            <div>
              <h1 className="text-xl lg:text-2xl text-gradient-primary">🔐 관리자 패널 v3.0</h1>
              <p className="text-sm text-muted-foreground">업무 효율성 최적화 버전</p>
            </div>
          </div>

          {/* 🎯 상단 빠른 통계 */}
          <div className="hidden md:flex items-center gap-6">
            <div className="text-center">
              <div className="text-lg text-primary">
                {loadingStats ? '…' : statsView.onlineUsers}
              </div>
              <div className="text-xs text-muted-foreground">온라인</div>
            </div>
            <div className="text-center">
              <div className="text-lg text-gradient-gold">
                {loadingStats ? '…' : `${(statsView.todayRevenue / 1000).toFixed(0)}K`}
              </div>
              <div className="text-xs text-muted-foreground">오늘 수익</div>
            </div>
            <div className="text-center">
              <div className="text-lg text-error">
                {loadingStats ? '…' : statsView.criticalAlerts}
              </div>
              <div className="text-xs text-muted-foreground">긴급 알림</div>
            </div>

            <div className="text-right">
              <div className="text-sm text-error">관리자: {user.nickname}</div>
              <div className="text-xs text-muted-foreground">최고 권한</div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* 🎯 메인 콘텐츠 */}
      <div className="relative z-10 max-w-7xl mx-auto p-4 lg:p-6">
        {/* 💼 빠른 네비게이션 바 */}
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="mb-6">
          <div className="flex items-center gap-2 mb-4">
            <Button
              variant={activeView === 'menu' ? 'default' : 'outline'}
              onClick={() => setActiveView('menu')}
              className={`btn-hover-lift ${
                activeView === 'menu' ? 'bg-gradient-game' : 'glass-metal'
              }`}
            >
              <Home className="w-4 h-4 mr-2" />
              기능 메뉴
            </Button>
            <Button
              variant={activeView === 'dashboard' ? 'default' : 'outline'}
              onClick={() => setActiveView('dashboard')}
              className={`btn-hover-lift ${
                activeView === 'dashboard' ? 'bg-gradient-game' : 'glass-metal'
              }`}
            >
              <BarChart3 className="w-4 h-4 mr-2" />
              대시보드
            </Button>
            <Button
              variant="outline"
              onClick={() => onAddNotification('📊 데이터를 새로고침했습니다.')}
              className="ml-auto btn-hover-lift glass-metal btn-hover-glow"
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              새로고침
            </Button>
          </div>
        </motion.div>

        {/* 🎯 메인 화면 전환 */}
        <AnimatePresence mode="wait">
          {activeView === 'menu' && (
            <motion.div
              key="menu"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="space-y-8"
            >
              {/* 🚨 긴급 알림 */}
              {statsView.criticalAlerts > 0 && (
                <Alert className="border-error bg-error-soft glass-metal">
                  <AlertTriangle className="h-4 w-4" />
                  <AlertDescription className="text-foreground">
                    <span className="text-gradient-primary">
                      {statsView.criticalAlerts}개의 긴급 알림
                    </span>
                    이 있습니다.
                    <Button
                      variant="link"
                      className="p-0 h-auto ml-2 text-error btn-hover-glow"
                      onClick={() => setActiveView('security')}
                    >
                      지금 확인하기 →
                    </Button>
                  </AlertDescription>
                </Alert>
              )}

              {/* 💼 카테고리별 빠른 작업 메뉴 */}
              {Object.entries(actionsByCategory).map(([category, actions]) => {
                const CategoryIcon = categoryIcons[category as keyof typeof categoryIcons];
                const categoryBgClass =
                  categoryBgClasses[category as keyof typeof categoryBgClasses];

                return (
                  <motion.div
                    key={category}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 }}
                  >
                    <div className="flex items-center gap-3 mb-4">
                      <div
                        className={`w-8 h-8 ${categoryBgClass} rounded-lg flex items-center justify-center metal-shine`}
                      >
                        <CategoryIcon className="w-5 h-5 text-white" />
                      </div>
                      <h2 className="text-lg text-foreground">
                        {categoryNames[category as keyof typeof categoryNames]}
                      </h2>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                      {actions.map((action) => {
                        const ActionIcon = action.icon;

                        return (
                          <motion.div
                            key={action.id}
                            whileHover={{ scale: 1.02 }}
                            whileTap={{ scale: 0.98 }}
                          >
                            <Card
                              className="glass-metal cursor-pointer card-hover-float"
                              onClick={action.onClick}
                            >
                              <CardContent className="p-4">
                                <div className="flex items-start gap-3">
                                  <div
                                    className={`w-12 h-12 ${action.bgClass} rounded-xl flex items-center justify-center metal-shine`}
                                  >
                                    <ActionIcon className="w-6 h-6 text-white" />
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <h3 className="text-foreground mb-1 truncate">
                                      {action.title}
                                    </h3>
                                    <p className="text-sm text-muted-foreground line-clamp-2">
                                      {action.description}
                                    </p>
                                    {action.shortcut && (
                                      <div className="mt-2">
                                        <Badge variant="outline" className="text-xs glass-metal">
                                          {action.shortcut}
                                        </Badge>
                                      </div>
                                    )}
                                  </div>
                                  <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                                </div>
                              </CardContent>
                            </Card>
                          </motion.div>
                        );
                      })}
                    </div>
                  </motion.div>
                );
              })}

              {/* 📊 빠른 상태 체크 */}
              <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
              >
                <h2 className="text-lg text-foreground mb-4 flex items-center gap-2">
                  <Activity className="w-5 h-5 text-success" />
                  📊 시스템 현황
                </h2>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <Card className="glass-metal">
                    <CardContent className="p-4 text-center">
                      <div className="text-2xl text-success mb-1">
                        {statsView.activeUsers.toLocaleString()}
                      </div>
                      <div className="text-sm text-muted-foreground">활성 사용자</div>
                    </CardContent>
                  </Card>

                  <Card className="glass-metal">
                    <CardContent className="p-4 text-center">
                      <div className="text-2xl text-gradient-gold mb-1">
                        ${(statsView.totalRevenue / 1000000).toFixed(1)}M
                      </div>
                      <div className="text-sm text-muted-foreground">총 수익</div>
                    </CardContent>
                  </Card>

                  <Card className="glass-metal">
                    <CardContent className="p-4 text-center">
                      <div className="text-2xl text-primary mb-1">{statsView.pendingActions}</div>
                      <div className="text-sm text-muted-foreground">대기 작업</div>
                    </CardContent>
                  </Card>

                  <Card className="glass-metal">
                    <CardContent className="p-4 text-center">
                      <div className="text-2xl text-success mb-1">99.9%</div>
                      <div className="text-sm text-muted-foreground">서버 가동률</div>
                    </CardContent>
                  </Card>
                </div>
              </motion.div>
            </motion.div>
          )}

          {activeView === 'inventory' && (
            <motion.div
              key="inventory"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
              <div className="flex items-center justify-between">
                <h2 className="text-lg text-foreground flex items-center gap-2">
                  인벤토리
                  <Badge variant="outline" className="ml-2">
                    읽기 전용
                  </Badge>
                </h2>
                <Button
                  variant="outline"
                  className="glass-metal"
                  onClick={() => setActiveView('menu')}
                >
                  돌아가기
                </Button>
              </div>
              <Card className="glass-metal">
                <CardContent className="p-4">
                  <div className="text-sm text-muted-foreground mb-3">
                    현재 세션 사용자 보유 아이템
                  </div>
                  {/* 전역 스토어 우선, 없으면 props.user */}
                  <InventoryListFallback user={user} />
                </CardContent>
              </Card>
            </motion.div>
          )}

          {activeView === 'dashboard' && (
            <motion.div
              key="dashboard"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="space-y-6"
            >
              <h2 className="text-xl text-gradient-primary">📊 핵심 대시보드</h2>

              {/* 기본 통계만 표시 */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <Card className="glass-metal">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-primary-soft rounded-lg flex items-center justify-center">
                        <Users className="w-6 h-6 text-primary" />
                      </div>
                      <div>
                        <div className="text-2xl text-foreground">
                          {statsView.totalUsers.toLocaleString()}
                        </div>
                        <div className="text-sm text-muted-foreground">총 사용자</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="glass-metal">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-success-soft rounded-lg flex items-center justify-center">
                        <Activity className="w-6 h-6 text-success" />
                      </div>
                      <div>
                        <div className="text-2xl text-foreground">
                          {statsView.activeUsers.toLocaleString()}
                        </div>
                        <div className="text-sm text-muted-foreground">활성 사용자</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="glass-metal">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-gold-soft rounded-lg flex items-center justify-center">
                        <DollarSign className="w-6 h-6 text-gold" />
                      </div>
                      <div>
                        <div className="text-2xl text-foreground">
                          ${(statsView.totalRevenue / 1000).toFixed(0)}K
                        </div>
                        <div className="text-sm text-muted-foreground">총 수익</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="glass-metal">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 bg-error-soft rounded-lg flex items-center justify-center">
                        <AlertTriangle className="w-6 h-6 text-error" />
                      </div>
                      <div>
                        <div className="text-2xl text-foreground">{statsView.criticalAlerts}</div>
                        <div className="text-sm text-muted-foreground">긴급 알림</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="text-center">
                <Button
                  onClick={() => setActiveView('menu')}
                  className="bg-gradient-game btn-hover-lift"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" />
                  기능 메뉴로 돌아가기
                </Button>
              </div>
            </motion.div>
          )}

          {/* 사용자 관리 */}
          {activeView === 'users' && (
            <motion.div
              key="users"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="space-y-6"
            >
              <h2 className="text-xl text-gradient-primary flex items-center gap-2">
                <Users className="w-5 h-5" />
                👥 사용자 관리
              </h2>
              <div className="glass-metal rounded-2xl p-6 space-y-3">
                <div className="text-sm text-neutral-300">골드 지급/차감</div>
                <div className="flex flex-col md:flex-row gap-2 items-start md:items-center">
                  <input
                    value={adjustUserId}
                    onChange={(e: any) => setAdjustUserId(e.target.value)}
                    placeholder="user_id"
                    className="px-3 py-2 bg-black/40 border rounded w-full md:w-48"
                  />
                  <input
                    type="number"
                    value={amount}
                    onChange={(e: any) => {
                      const v = e.target.value;
                      const n = Number.parseInt(v || '0', 10);
                      setAmount(Number.isFinite(n) ? n : 0);
                    }}
                    placeholder="amount"
                    className="px-3 py-2 bg-black/40 border rounded w-full md:w-40"
                  />
                  <div className="flex gap-2">
                    <Button
                      disabled={busy || !adjustUserId || amount <= 0}
                      onClick={async () => {
                        if (!adjustUserId || amount <= 0) return;
                        setBusy(true);
                        try {
                          await unifiedApi.post(`admin/users/${adjustUserId}/tokens/add`, {
                            amount,
                          });
                          onAddNotification('✅ 지급 완료: profile_update가 전파됩니다.');
                          // 동일 세션이면 즉시 정합화
                          reconcileIfCurrent(adjustUserId);
                        } catch (e: any) {
                          onAddNotification(`❌ 지급 실패: ${e?.message || 'error'}`);
                        } finally {
                          setBusy(false);
                        }
                      }}
                      className="bg-emerald-600 hover:bg-emerald-500 btn-hover-glow"
                    >
                      지급
                    </Button>
                    <Button
                      disabled={busy || !adjustUserId || amount <= 0}
                      onClick={async () => {
                        if (!adjustUserId || amount <= 0) return;
                        setBusy(true);
                        try {
                          await unifiedApi.post(`admin/users/${adjustUserId}/tokens/deduct`, {
                            amount,
                          });
                          onAddNotification('✅ 차감 완료: profile_update가 전파됩니다.');
                          // 동일 세션이면 즉시 정합화
                          reconcileIfCurrent(adjustUserId);
                        } catch (e: any) {
                          onAddNotification(`❌ 차감 실패: ${e?.message || 'error'}`);
                        } finally {
                          setBusy(false);
                        }
                      }}
                      className="bg-rose-600 hover:bg-rose-500 btn-hover-glow"
                    >
                      차감
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-neutral-400">
                  처리 성공 시 해당 유저 세션에 profile_update가 브로드캐스트되며, 현재 세션이면
                  잔액 정합화를 수행합니다.
                </p>
              </div>

              {/* 골드 지급 (서버 권위, 멱등키 지원) */}
              <GoldGrantPanel
                onAddNotification={onAddNotification}
                reconcileIfCurrent={reconcileIfCurrent}
              />

              {/* 차단/해제 간단 패널 */}
              <BanUnbanPanel onAddNotification={onAddNotification} />
              <div className="text-center">
                <Button
                  onClick={() => setActiveView('menu')}
                  className="bg-gradient-game btn-hover-lift"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" /> 기능 메뉴로 돌아가기
                </Button>
              </div>
            </motion.div>
          )}

          {/* 상점 관리 */}
          {activeView === 'shop' && (
            <motion.div
              key="shop"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="space-y-6"
            >
              <h2 className="text-xl text-gradient-primary flex items-center gap-2">
                <ShoppingCart className="w-5 h-5" /> 🛍️ 상점/패키지 관리
              </h2>
              <div className="glass-metal rounded-2xl p-6 space-y-3">
                <div className="text-sm text-neutral-300">카탈로그 무효화 및 재조회</div>
                <div className="flex gap-2">
                  <Button
                    onClick={() => {
                      window.dispatchEvent(new CustomEvent('catalog:invalidate'));
                      onAddNotification('🔄 카탈로그 재조회 트리거 전송');
                    }}
                    className="bg-indigo-600 hover:bg-indigo-500 btn-hover-glow"
                  >
                    재조회 트리거
                  </Button>
                  <Button
                    variant="outline"
                    onClick={loadShopItems}
                    className="btn-hover-lift glass-metal"
                  >
                    목록 불러오기
                  </Button>
                </div>
                <p className="text-xs text-neutral-400">
                  관리자 변경 후 클라이언트는 이 트리거로 목록을 갱신합니다.
                </p>
                {shopError && (
                  <div className="text-xs text-error">불러오기 오류: {shopError}</div>
                )}
              </div>

              {/* 간단 CRUD/할인/랭크 패널 (OpenAPI: AdminCatalogItemIn/Out, AdminDiscountPatch, AdminRankPatch) */}
              <ShopCrudPanel
                items={shopItems}
                busy={shopBusy}
                onReload={async () => {
                  await loadShopItems();
                }}
                setBusy={setShopBusy}
                onAddNotification={onAddNotification}
              />

              <div className="text-center">
                <Button
                  onClick={() => setActiveView('menu')}
                  className="bg-gradient-game btn-hover-lift"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" /> 기능 메뉴로 돌아가기
                </Button>
              </div>
            </motion.div>
          )}

          {/* 보안/시스템은 플레이스홀더 유지 */}
          {(activeView === 'security' || activeView === 'system') && (
            <motion.div
              key={activeView}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              transition={{ duration: 0.2 }}
              className="text-center py-12"
            >
              <div className="glass-metal rounded-2xl p-8 max-w-md mx-auto">
                <Terminal className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
                <h2 className="text-xl text-foreground mb-2">
                  {activeView === 'security' && '🛡️ 보안 관리'}
                  {activeView === 'system' && '⚙️ 시스템 관리'}
                </h2>
                <p className="text-muted-foreground mb-6">해당 기능은 현재 개발 중입니다.</p>
                <Button
                  onClick={() => setActiveView('menu')}
                  className="bg-gradient-game btn-hover-lift"
                >
                  <ArrowLeft className="w-4 h-4 mr-2" /> 기능 메뉴로 돌아가기
                </Button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

// --- Subcomponents ---
function ShopCrudPanel({
  items,
  busy,
  setBusy,
  onReload,
  onAddNotification,
}: {
  items: Array<{
    id: number; sku: string; name: string; price_cents: number; gold: number;
    discount_percent?: number; discount_ends_at?: string | null; min_rank?: string | null;
  }>;
  busy: boolean;
  setBusy: (b: boolean) => void;
  onReload: () => Promise<void> | void;
  onAddNotification: (msg: string) => void;
}) {
  const [createForm, setCreateForm] = useState({
    id: '', sku: '', name: '', price_cents: '', gold: '',
  });
  const [editId, setEditId] = useState('');
  const [editForm, setEditForm] = useState({ sku: '', name: '', price_cents: '', gold: '' });
  const [discountForm, setDiscountForm] = useState({ item_id: '', discount_percent: '', discount_ends_at: '' });
  const [rankForm, setRankForm] = useState({ item_id: '', min_rank: '' });
  const [lastResult, setLastResult] = useState(null as null | { action:string; item_id?: number; changed?: string[]; at:number; });

  const dispatchInvalidate = () => {
    try {
      window.dispatchEvent(new CustomEvent('catalog:invalidate'));
    } catch {}
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="glass-metal rounded-2xl p-6 space-y-3">
        <div className="text-sm text-neutral-300">신규 아이템 생성 (POST admin/shop/items)</div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <input
            className="px-3 py-2 bg-black/40 border rounded"
            placeholder="id (integer)"
            value={createForm.id}
            onChange={(e: any) => setCreateForm({ ...createForm, id: e.target.value })}
          />
          <input
            className="px-3 py-2 bg-black/40 border rounded"
            placeholder="sku"
            value={createForm.sku}
            onChange={(e: any) => setCreateForm({ ...createForm, sku: e.target.value })}
          />
          <input
            className="px-3 py-2 bg-black/40 border rounded"
            placeholder="name"
            value={createForm.name}
            onChange={(e: any) => setCreateForm({ ...createForm, name: e.target.value })}
          />
          <input
            className="px-3 py-2 bg-black/40 border rounded"
            placeholder="price_cents"
            type="number"
            value={createForm.price_cents}
            onChange={(e: any) => setCreateForm({ ...createForm, price_cents: e.target.value })}
          />
          <input
            className="px-3 py-2 bg-black/40 border rounded"
            placeholder="gold"
            type="number"
            value={createForm.gold}
            onChange={(e: any) => setCreateForm({ ...createForm, gold: e.target.value })}
          />
        </div>
        <div className="flex gap-2">
          <Button
            disabled={busy}
            onClick={async () => {
              const id = parseInt(createForm.id || '');
              const price_cents = parseInt(createForm.price_cents || '');
              const gold = parseInt(createForm.gold || '');
              if (
                !Number.isFinite(id) ||
                !createForm.sku ||
                !createForm.name ||
                !Number.isFinite(price_cents) ||
                !Number.isFinite(gold)
              ) {
                onAddNotification('⚠️ 필수 필드 누락 또는 형식 오류');
                return;
              }
              setBusy(true);
              try {
                await unifiedApi.post('admin/shop/items', {
                  id,
                  sku: createForm.sku,
                  name: createForm.name,
                  price_cents,
                  gold,
                });
                onAddNotification('✅ 아이템 생성 완료');
                dispatchInvalidate();
                await onReload();
                setCreateForm({ id: '', sku: '', name: '', price_cents: '', gold: '' });
              } catch (e: any) {
                onAddNotification(`❌ 생성 실패: ${e?.message || 'error'}`);
              } finally {
                setBusy(false);
              }
            }}
            className="bg-gradient-game btn-hover-lift"
          >
            생성
          </Button>
        </div>
      </div>

      <div className="glass-metal rounded-2xl p-6 space-y-3">
        <div className="text-sm text-neutral-300">아이템 수정 (PUT admin/shop/items/{'{id}'})</div>
        <div className="flex gap-2 items-center mb-2">
          <select
            className="px-3 py-2 bg-black/40 border rounded flex-1"
            value={editId}
            onChange={(e: any) => {
              const v = e.target.value;
              setEditId(v);
              const found = items.find((it) => String(it.id) === String(v));
              setEditForm({
                sku: found?.sku || '',
                name: found?.name || '',
                price_cents: String(found?.price_cents || ''),
                gold: String(found?.gold || ''),
              });
            }}
            aria-label="수정할 아이템 선택"
          >
            <option value="">아이템 선택…</option>
            {items.map((it) => (
              <option key={it.id} value={String(it.id)}>
                {it.id} · {it.sku} · {it.name}
              </option>
            ))}
          </select>
          {editId && (
            <Button
              variant="outline"
              onClick={async () => {
                if (!editId) return;
                if (!confirm('정말 삭제하시겠습니까?')) return;
                setBusy(true);
                try {
                  await unifiedApi.del(`admin/shop/items/${editId}`);
                  onAddNotification('🗑️ 삭제 완료');
                  dispatchInvalidate();
                  await onReload();
                  setEditId('');
                } catch (e: any) {
                  onAddNotification(`❌ 삭제 실패: ${e?.message || 'error'}`);
                } finally {
                  setBusy(false);
                }
              }}
              className="border-error text-error"
            >
              삭제
            </Button>
          )}
        </div>
        {editId && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            <input
              className="px-3 py-2 bg-black/40 border rounded"
              placeholder="sku"
              value={editForm.sku}
              onChange={(e: any) => setEditForm({ ...editForm, sku: e.target.value })}
            />
            <input
              className="px-3 py-2 bg-black/40 border rounded"
              placeholder="name"
              value={editForm.name}
              onChange={(e: any) => setEditForm({ ...editForm, name: e.target.value })}
            />
            <input
              className="px-3 py-2 bg-black/40 border rounded"
              placeholder="price_cents"
              type="number"
              value={editForm.price_cents}
              onChange={(e: any) => setEditForm({ ...editForm, price_cents: e.target.value })}
            />
            <input
              className="px-3 py-2 bg-black/40 border rounded"
              placeholder="gold"
              type="number"
              value={editForm.gold}
              onChange={(e: any) => setEditForm({ ...editForm, gold: e.target.value })}
            />
          </div>
        )}
        <div className="flex gap-2">
          <Button
            disabled={busy || !editId}
            onClick={async () => {
              if (!editId) return;
              const price_cents = parseInt(editForm.price_cents || '');
              const gold = parseInt(editForm.gold || '');
              if (
                !editForm.sku ||
                !editForm.name ||
                !Number.isFinite(price_cents) ||
                !Number.isFinite(gold)
              ) {
                onAddNotification('⚠️ 필수 필드 누락 또는 형식 오류');
                return;
              }
              setBusy(true);
              try {
                await unifiedApi.put(`admin/shop/items/${editId}`, {
                  sku: editForm.sku,
                  name: editForm.name,
                  price_cents,
                  gold,
                  id: parseInt(editId, 10),
                });
                onAddNotification('✅ 수정 완료');
                dispatchInvalidate();
                await onReload();
              } catch (e: any) {
                onAddNotification(`❌ 수정 실패: ${e?.message || 'error'}`);
              } finally {
                setBusy(false);
              }
            }}
            className="bg-emerald-600 hover:bg-emerald-500 btn-hover-glow"
          >
            수정 저장
          </Button>
        </div>
      </div>

      <div className="glass-metal rounded-2xl p-6 space-y-3">
        <div className="text-sm text-neutral-300">
          할인 설정 (PATCH admin/shop/items/{'{id}'}/discount)
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-2">
          <input
            className="px-3 py-2 bg-black/40 border rounded"
            placeholder="item_id"
            value={discountForm.item_id}
            onChange={(e: any) => setDiscountForm({ ...discountForm, item_id: e.target.value })}
          />
          <input
            className="px-3 py-2 bg-black/40 border rounded"
            placeholder="discount_percent (0-100)"
            type="number"
            value={discountForm.discount_percent}
            onChange={(e: any) =>
              setDiscountForm({ ...discountForm, discount_percent: e.target.value })
            }
          />
          <input
            className="px-3 py-2 bg-black/40 border rounded"
            type="datetime-local"
            placeholder="discount_ends_at (optional)"
            value={discountForm.discount_ends_at}
            onChange={(e: any) =>
              setDiscountForm({ ...discountForm, discount_ends_at: e.target.value })
            }
          />
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const base = new Date();
                base.setDate(base.getDate() + 1);
                const v = new Date(base.getTime() - base.getTimezoneOffset() * 60000)
                  .toISOString()
                  .slice(0, 16);
                setDiscountForm(
                  (d: { item_id: string; discount_percent: string; discount_ends_at: string }) => ({
                    ...d,
                    discount_ends_at: v,
                  })
                );
              }}
            >
              +1d
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const base = new Date();
                base.setDate(base.getDate() + 3);
                const v = new Date(base.getTime() - base.getTimezoneOffset() * 60000)
                  .toISOString()
                  .slice(0, 16);
                setDiscountForm(
                  (d: { item_id: string; discount_percent: string; discount_ends_at: string }) => ({
                    ...d,
                    discount_ends_at: v,
                  })
                );
              }}
            >
              +3d
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                const base = new Date();
                base.setDate(base.getDate() + 7);
                const v = new Date(base.getTime() - base.getTimezoneOffset() * 60000)
                  .toISOString()
                  .slice(0, 16);
                setDiscountForm(
                  (d: { item_id: string; discount_percent: string; discount_ends_at: string }) => ({
                    ...d,
                    discount_ends_at: v,
                  })
                );
              }}
            >
              +7d
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setDiscountForm(
                  (d: { item_id: string; discount_percent: string; discount_ends_at: string }) => ({
                    ...d,
                    discount_ends_at: '',
                  })
                );
              }}
            >
              기간해제
            </Button>
          </div>
        </div>
        <div className="flex gap-2">
          <Button
            disabled={busy}
            onClick={async () => {
              const id = parseInt(discountForm.item_id || '');
              const dp = parseInt(discountForm.discount_percent || '');
              if (!Number.isFinite(id) || !Number.isFinite(dp)) {
                onAddNotification('⚠️ 형식 오류');
                return;
              }
              // 미래 시각 유효성(선택 시)
              if (discountForm.discount_ends_at) {
                const local = new Date(discountForm.discount_ends_at);
                if (Number.isNaN(local.getTime()) || local.getTime() <= Date.now()) {
                  onAddNotification('⚠️ discount_ends_at은 미래 시각이어야 합니다.');
                  return;
                }
              }
              setBusy(true);
              try {
                const body: any = { discount_percent: dp };
                if (discountForm.discount_ends_at) {
                  const iso = new Date(discountForm.discount_ends_at);
                  body.discount_ends_at = iso.toISOString();
                }
                const res = await apiCall(`admin/shop/items/${id}/discount`, {
                  method: 'PATCH',
                  body,
                });
                onAddNotification('✅ 할인 설정 완료');
                dispatchInvalidate();
                await onReload();
                setLastResult({
                  action: 'discount',
                  item_id: id,
                  changed: ['discount_percent', 'discount_ends_at'],
                  at: Date.now(),
                });
              } catch (e: any) {
                onAddNotification(`❌ 할인 설정 실패: ${e?.message || 'error'}`);
              } finally {
                setBusy(false);
              }
            }}
            className="bg-primary btn-hover-lift"
          >
            적용
          </Button>
        </div>
      </div>

      <div className="glass-metal rounded-2xl p-6 space-y-3">
        <div className="text-sm text-neutral-300">
          노출 등급 설정 (PATCH admin/shop/items/{'{id}'}/rank)
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <input
            className="px-3 py-2 bg-black/40 border rounded"
            placeholder="item_id"
            value={rankForm.item_id}
            onChange={(e: any) => setRankForm({ ...rankForm, item_id: e.target.value })}
          />
          <input
            className="px-3 py-2 bg-black/40 border rounded"
            placeholder="min_rank (예: VIP1 | 비우면 해제)"
            value={rankForm.min_rank}
            onChange={(e: any) => setRankForm({ ...rankForm, min_rank: e.target.value })}
          />
        </div>
        <div className="flex gap-2">
          <Button
            disabled={busy}
            onClick={async () => {
              const id = parseInt(rankForm.item_id || '');
              if (!Number.isFinite(id)) {
                onAddNotification('⚠️ 형식 오류');
                return;
              }
              setBusy(true);
              try {
                const body: any = {};
                if (rankForm.min_rank && rankForm.min_rank.trim().length > 0)
                  body.min_rank = rankForm.min_rank.trim();
                else body.min_rank = null;
                const res = await apiCall(`admin/shop/items/${id}/rank`, { method: 'PATCH', body });
                onAddNotification('✅ 등급 설정 완료');
                dispatchInvalidate();
                await onReload();
                setLastResult({
                  action: 'rank',
                  item_id: id,
                  changed: ['min_rank'],
                  at: Date.now(),
                });
              } catch (e: any) {
                onAddNotification(`❌ 등급 설정 실패: ${e?.message || 'error'}`);
              } finally {
                setBusy(false);
              }
            }}
            className="bg-info btn-hover-lift"
          >
            적용
          </Button>
        </div>
      </div>

      {/* 간단 목록 */}
      <div className="glass-metal rounded-2xl p-6 space-y-3 lg:col-span-2">
        <div className="text-sm text-neutral-300">현재 아이템 목록 (GET admin/shop/items)</div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-muted-foreground">
              <tr>
                <th className="text-left p-2">id</th>
                <th className="text-left p-2">sku</th>
                <th className="text-left p-2">name</th>
                <th className="text-left p-2">price_cents</th>
                <th className="text-left p-2">gold</th>
                <th className="text-left p-2">discount%</th>
                <th className="text-left p-2">min_rank</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr
                  key={it.id}
                  className={`border-t border-border-secondary ${
                    lastResult?.item_id === it.id ? 'animate-pulse' : ''
                  }`}
                >
                  <td className="p-2">{it.id}</td>
                  <td className="p-2">{it.sku}</td>
                  <td className="p-2">{it.name}</td>
                  <td className="p-2">{it.price_cents}</td>
                  <td className="p-2">{it.gold}</td>
                  <td className="p-2">{it.discount_percent ?? 0}</td>
                  <td className="p-2">{it.min_rank ?? '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {lastResult && (
          <div className="mt-3 text-xs text-muted-foreground">
            마지막 작업: <span className="text-foreground">{lastResult.action}</span> · 대상 아이템:{' '}
            {lastResult.item_id} · 변경: {lastResult.changed?.join(', ') || '-'} ·{' '}
            {new Date(lastResult.at).toLocaleString()}
          </div>
        )}
      </div>
    </div>
  );
}

function GoldGrantPanel({
  onAddNotification,
  reconcileIfCurrent,
}: {
  onAddNotification: (msg: string) => void;
  reconcileIfCurrent: (userId: string | number) => void;
}) {
  const [userId, setUserId] = useState('');
  const [amount, setAmount] = useState(0);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  const genIdemKey = () => {
    try {
      // 브라우저 지원 시 native UUID 사용
      // @ts-ignore
      if (typeof crypto !== 'undefined' && crypto?.randomUUID) return crypto.randomUUID();
    } catch {}
    return 'ui_' + Date.now() + '_' + Math.random().toString(16).slice(2);
  };

  return (
    <div className="glass-metal rounded-2xl p-6 space-y-3">
      <div className="text-sm text-neutral-300">골드 지급 (서버 권위·멱등키)</div>
      <div className="flex flex-col lg:flex-row gap-2 items-start lg:items-center">
        <input
          value={userId}
          onChange={(e: any) => setUserId(e.target.value)}
          placeholder="user_id"
          className="px-3 py-2 bg-black/40 border rounded w-full lg:w-48"
        />
        <input
          type="number"
          value={amount}
          onChange={(e: any) => setAmount(parseInt(e.target.value || '0', 10) || 0)}
          placeholder="amount"
          className="px-3 py-2 bg-black/40 border rounded w-full lg:w-40"
        />
        <input
          value={reason}
          onChange={(e: any) => setReason(e.target.value)}
          placeholder="reason (optional)"
          className="px-3 py-2 bg-black/40 border rounded w-full lg:flex-1"
        />
        <Button
          disabled={busy || !userId || amount <= 0}
          onClick={async () => {
            if (!userId || amount <= 0) return;
            setBusy(true);
            try {
              const body = { amount, reason: reason || undefined, idempotency_key: genIdemKey() };
              await unifiedApi.post(`admin/users/${userId}/gold/grant`, body);
              onAddNotification('✅ 골드 지급 완료: profile_update가 전파됩니다.');
              reconcileIfCurrent(userId);
            } catch (e: any) {
              onAddNotification(`❌ 골드 지급 실패: ${e?.message || 'error'}`);
            } finally {
              setBusy(false);
            }
          }}
          className="bg-amber-600 hover:bg-amber-500 btn-hover-glow"
        >
          골드 지급
        </Button>
      </div>
      <p className="text-xs text-neutral-400">멱등키로 중복 요청 시 동일 영수증이 재사용됩니다.</p>
    </div>
  );
}

function BanUnbanPanel({
  onAddNotification,
}: {
  onAddNotification: (msg: string) => void;
}) {
  const [userId, setUserId] = useState('');
  const [reason, setReason] = useState('policy_violation');
  const [duration, setDuration] = useState('');
  const [busy, setBusy] = useState(false);

  return (
    <div className="glass-metal rounded-2xl p-6 space-y-3">
      <div className="text-sm text-neutral-300">사용자 차단/해제</div>
      <div className="flex flex-col lg:flex-row gap-2 items-start lg:items-center">
        <input
          value={userId}
          onChange={(e: any) => setUserId(e.target.value)}
          placeholder="user_id"
          className="px-3 py-2 bg-black/40 border rounded w-full lg:w-48"
        />
        <input
          value={reason}
          onChange={(e: any) => setReason(e.target.value)}
          placeholder="reason"
          className="px-3 py-2 bg-black/40 border rounded w-full lg:flex-1"
        />
        <input
          type="number"
          value={duration as any}
          onChange={(e: any) => {
            const n = parseInt(e.target.value || '0', 10);
            setDuration(Number.isFinite(n) && n > 0 ? n : '');
          }}
          placeholder="duration_hours (optional)"
          className="px-3 py-2 bg-black/40 border rounded w-full lg:w-56"
        />
        <div className="flex gap-2">
          <Button
            disabled={busy || !userId}
            onClick={async () => {
              if (!userId) return;
              setBusy(true);
              try {
                const body: any = { reason: reason || 'policy_violation' };
                if (duration !== '' && Number.isFinite(duration as any)) body.duration_hours = Number(duration);
                await unifiedApi.post(`admin/users/${userId}/ban`, body);
                onAddNotification('⛔ 차단 완료');
              } catch (e: any) {
                onAddNotification(`❌ 차단 실패: ${e?.message || 'error'}`);
              } finally {
                setBusy(false);
              }
            }}
            className="bg-rose-700 hover:bg-rose-600 btn-hover-glow"
          >
            차단
          </Button>
          <Button
            disabled={busy || !userId}
            onClick={async () => {
              if (!userId) return;
              setBusy(true);
              try {
                await unifiedApi.post(`admin/users/${userId}/unban`, {});
                onAddNotification('✅ 차단 해제 완료');
              } catch (e: any) {
                onAddNotification(`❌ 해제 실패: ${e?.message || 'error'}`);
              } finally {
                setBusy(false);
              }
            }}
            className="bg-emerald-700 hover:bg-emerald-600 btn-hover-glow"
          >
            해제
          </Button>
        </div>
      </div>
      <p className="text-xs text-neutral-400">duration_hours를 생략하면 영구 차단으로 처리될 수 있습니다.</p>
    </div>
  );
}