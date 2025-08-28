'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  ArrowLeft,
  Package,
  Star,
  Crown,
  Gem,
  Gift,
  Sparkles,
  ShoppingCart,
  Coins,
  Zap,
  Trophy,
  Shield,
  Tag,
  Timer,
  Flame
} from 'lucide-react';
import { Button } from './ui/button';
import { Card } from './ui/card';
import { Badge } from './ui/badge';
import { User, GameItem } from '../types';
import useBalanceSync from '@/hooks/useBalanceSync';
import { api } from '@/lib/unifiedApi';
import { useWithReconcile } from '@/lib/sync';
import { useUserGold } from '@/hooks/useSelectors';
import { useGlobalStore, mergeProfile, applyPurchase, mergeGameStats } from '@/store/globalStore';
import ShopBadge from './ShopBadge';
import ShopPurchaseHistory from './ShopPurchaseHistory';

interface ShopScreenProps {
  user: User;
  onBack: () => void;
  onNavigateToInventory: () => void;
  onNavigateToProfile: () => void;
  onUpdateUser: (user: User) => void;
  onAddNotification: (message: string) => void;
}

// 🏪 상점 아이템 데이터 (서버 장애/초기 구동 시 폴백)
const SHOP_ITEMS = [
  {
    id: 'gold_pack_small',
    name: '골드 팩 (소)',
    type: 'currency' as const,
    rarity: 'common' as const,
    price: 1000,
    description: '5,000G를 즉시 획득하세요',
    value: 5000,
    icon: '💰',
    category: 'currency',
    isLimited: false,
    discount: 0,
    popular: false,
  },
  {
    id: 'gold_pack_medium',
    name: '골드 팩 (중)',
    type: 'currency' as const,
    rarity: 'rare' as const,
    price: 2500,
    description: '15,000G를 즉시 획득하세요',
    value: 15000,
    icon: '💎',
    category: 'currency',
    isLimited: false,
    discount: 20,
    popular: true,
  },
  {
    id: 'gold_pack_large',
    name: '골드 팩 (대)',
    type: 'currency' as const,
    rarity: 'epic' as const,
    price: 5000,
    description: '35,000G를 즉시 획득하세요',
    value: 35000,
    icon: '💸',
    category: 'currency',
    isLimited: false,
    discount: 30,
    popular: false,
  },
  {
    id: 'vip_skin_neon',
    name: '네온 VIP 스킨',
    type: 'skin' as const,
    rarity: 'legendary' as const,
    price: 3000,
    description: '특별한 네온 효과가 적용된 VIP 전용 스킨',
    icon: '👑',
    category: 'cosmetic',
    isLimited: true,
    discount: 0,
    popular: false,
  },
  {
    id: 'lucky_charm',
    name: '행운의 부적',
    type: 'powerup' as const,
    rarity: 'epic' as const,
    price: 2000,
    description: '모든 게임에서 승률 +15% (24시간)',
    icon: '🍀',
    category: 'powerup',
    isLimited: false,
    discount: 0,
    popular: true,
  },
  {
    id: 'exp_booster',
    name: '경험치 부스터',
    type: 'powerup' as const,
    rarity: 'rare' as const,
    price: 1500,
    description: '획득 경험치 +100% (12시간)',
    icon: '⚡',
    category: 'powerup',
    isLimited: false,
    discount: 0,
    popular: false,
  },
  {
    id: 'premium_gacha_ticket',
    name: '프리미엄 가챠 티켓',
    type: 'collectible' as const,
    rarity: 'legendary' as const,
    price: 2500,
    description: '전설급 아이템 확률 +50%',
    icon: '🎫',
    category: 'special',
    isLimited: true,
    discount: 25,
    popular: true,
  },
  {
    id: 'slot_multiplier',
    name: '슬롯 멀티플라이어',
    type: 'powerup' as const,
    rarity: 'epic' as const,
    price: 3500,
    description: '슬롯 게임 당첨금 2배 (1시간)',
    icon: '🎰',
    category: 'powerup',
    isLimited: false,
    discount: 15,
    popular: false,
  },
];

export function ShopScreen({
  user,
  onBack,
  onNavigateToInventory,
  onNavigateToProfile,
  onUpdateUser,
  onAddNotification,
}: ShopScreenProps) {
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null as import('../types').GameItem | null);
  const [catalog, setCatalog] = useState(null as any[] | null);
  const { reconcileBalance } = useBalanceSync({
    sharedUser: user,
    onUpdateUser,
    onAddNotification,
  });
  const withReconcile = useWithReconcile();
  const gold = useUserGold();
  const { dispatch } = useGlobalStore();

  // 마운트 시 1회 권위 잔액으로 정합화
  useEffect(() => {
    reconcileBalance().catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 서버 카탈로그 로드 (fallback: SHOP_ITEMS)
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res1: any = await api.get('shop/catalog');
        if (!cancelled && Array.isArray(res1)) {
          setCatalog(res1);
          return;
        }
      } catch {}
      try {
        const res2: any = await api.get('shop/items');
        if (!cancelled && Array.isArray(res2)) {
          setCatalog(res2);
          return;
        }
      } catch {}
      if (!cancelled) setCatalog([]); // 빈 배열이면 아래에서 폴백 사용
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // 서버 → UI 매핑 (널 안전)
  const itemsToRender = useMemo(() => {
    const source = catalog && catalog.length > 0 ? catalog : SHOP_ITEMS;
    return source.map((it: any) => ({
      id: String(it.id ?? it.item_id ?? it.slug ?? it.code ?? Math.random().toString(36).slice(2)),
      name: String(it.name ?? '아이템'),
      type: String(it.type ?? 'item'),
      rarity: String(it.rarity ?? 'common'),
      price: Number(it.price ?? it.cost ?? 0),
      discount: Number(it.discount ?? it.sale_pct ?? 0),
      description: String(it.description ?? it.desc ?? ''),
      value: Number(it.value ?? it.amount ?? 0),
      icon: String(it.icon ?? '🎁'),
      isLimited: Boolean(it.isLimited ?? it.limited ?? false),
      popular: Boolean(it.popular ?? it.isPopular ?? false),
    }));
  }, [catalog]);

  // 🎨 등급별 스타일링 (글래스메탈 버전)
  const getRarityStyles = (rarity: string) => {
    switch (rarity) {
      case 'common':
        return {
          textColor: 'text-muted-foreground',
          borderColor: 'border-muted-foreground/30',
          bgColor: 'bg-secondary/20',
          glowColor: 'hover:shadow-lg',
        };
      case 'rare':
        return {
          textColor: 'text-info',
          borderColor: 'border-info/30',
          bgColor: 'bg-info/10',
          glowColor: 'hover:shadow-info/20 hover:shadow-lg',
        };
      case 'epic':
        return {
          textColor: 'text-primary',
          borderColor: 'border-primary/30',
          bgColor: 'bg-primary/10',
          glowColor: 'hover:shadow-primary/20 hover:shadow-lg',
        };
      case 'legendary':
        return {
          textColor: 'text-gold',
          borderColor: 'border-gold/30',
          bgColor: 'bg-gold/10',
          glowColor: 'hover:shadow-gold/20 hover:shadow-lg',
        };
      default:
        return {
          textColor: 'text-muted-foreground',
          borderColor: 'border-muted-foreground/30',
          bgColor: 'bg-secondary/20',
          glowColor: 'hover:shadow-lg',
        };
    }
  };

  // 💰 아이템 구매 처리
  const handlePurchase = async (item: any) => {
    const finalPrice = Math.floor(item.price * (1 - item.discount / 100));

    if (gold < finalPrice) {
      onAddNotification('❌ 골드가 부족합니다!');
      return;
    }

    const newItem: GameItem = {
      id: `${item.id}_${Date.now()}`,
      name: item.name,
      type: item.type,
      rarity: item.rarity,
      quantity: item.type === 'currency' ? item.value : 1,
      description: item.description,
      icon: item.icon,
      value: item.value,
    };

    try {
      const res: any = await withReconcile(async (idemKey: string) =>
        api.post(
          'shop/buy',
          { item_id: item.id, price: finalPrice },
          { headers: { 'X-Idempotency-Key': idemKey } }
        )
      );
      // 서버 응답에 new balance가 있으면 즉시 전역 프로필에 병합(시각적 지연 최소화)
      const newBal =
        res?.new_balance ??
        res?.balance ??
        res?.gold ??
        res?.gold_balance ??
        res?.cyber_token_balance;
      if (typeof newBal === 'number' && Number.isFinite(newBal)) {
        mergeProfile(dispatch, { goldBalance: Number(newBal) });
      }
      // 인벤토리 지급: 서버 응답에 items/awards 형태가 있으면 store 반영(가벼운 캐시)
      const awarded = res?.items ?? res?.awards ?? res?.granted_items ?? [];
      if (Array.isArray(awarded) && awarded.length > 0) {
        applyPurchase(
          dispatch,
          awarded.map((it: any) => ({
            id: String(it.id ?? `${item.id}_${Date.now()}`),
            name: String(it.name ?? item.name ?? '아이템'),
            type: String(it.type ?? item.type ?? 'item'),
            rarity: String(it.rarity ?? item.rarity ?? 'common'),
            quantity: Number(it.quantity ?? it.qty ?? 1),
            value: Number(it.value ?? 0),
            icon: String(it.icon ?? item.icon ?? ''),
          }))
        );
      }
      // 구매로 인한 통계 증가가 응답에 있으면 병합(선택)
      if (res?.stats_delta && typeof res.stats_delta === 'object') {
        mergeGameStats(dispatch, 'shop', res.stats_delta as any);
      }
      onAddNotification(
        item.type === 'currency'
          ? `💰 ${item.value.toLocaleString()}G를 획득했습니다!`
          : `✅ ${item.name}을(를) 구매했습니다!`
      );
    } catch (e: any) {
      // 실패 사유 매핑
      const code = e?.response?.data?.reason_code || e?.reason_code || e?.code || '';
      let msg = '구매 처리 중 오류가 발생했습니다. 잠시 후 다시 시도해주세요.';
      switch (code) {
        case 'INSUFFICIENT_FUNDS':
          msg = '❌ 골드가 부족합니다.';
          break;
        case 'DUPLICATE_REQUEST':
        case 'IDEMPOTENT_REUSE':
          msg = 'ℹ️ 이미 처리된 구매 요청입니다.';
          break;
        case 'ITEM_SOLD_OUT':
          msg = '⛔ 한정 상품이 매진되었습니다.';
          break;
        case 'LIMIT_REACHED':
          msg = '⛔ 구매 한도를 초과했습니다.';
          break;
        case 'FRAUD_BLOCKED':
          msg = '⛔ 보안 정책으로 차단되었습니다. 잠시 후 다시 시도해주세요.';
          break;
        default:
          break;
      }
      onAddNotification(msg);
    }
    // 구매 후 권위 잔액 재조회로 최종 정합 유지
    try {
      await reconcileBalance();
    } catch {}
    setShowPurchaseModal(false);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-black to-primary/5 relative overflow-hidden">
      {/* 🌟 고급 배경 효과 */}
      <div className="absolute inset-0">
        {[...Array(20)].map((_, i) => (
          <motion.div
            key={i}
            initial={{
              opacity: 0,
              x: Math.random() * (typeof window !== 'undefined' ? window.innerWidth : 1000),
              y: Math.random() * (typeof window !== 'undefined' ? window.innerHeight : 1000),
            }}
            animate={{
              opacity: [0, 0.4, 0],
              scale: [0, 2, 0],
              rotate: 360,
            }}
            transition={{
              duration: 10,
              repeat: Infinity,
              delay: i * 0.3,
              ease: 'easeInOut',
            }}
            className="absolute w-1.5 h-1.5 bg-gradient-to-r from-primary/40 to-gold/40 rounded-full"
          />
        ))}
      </div>

      {/* 🔮 글래스메탈 헤더 - 간소화 */}
      <motion.header
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative z-10 p-4 lg:p-6 border-b border-border-secondary/50 glass-metal"
      >
        <div className="flex items-center justify-between max-w-7xl mx-auto">
          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              onClick={onBack}
              className="glass-metal-hover hover:bg-primary/10 transition-all duration-300 border-metal"
            >
              <ArrowLeft className="w-4 h-4 mr-2" />
              뒤로가기
            </Button>

            <div>
              <h1 className="text-xl lg:text-2xl font-bold text-gradient-metal">
                💎 프리미엄 상점
              </h1>
              <p className="text-sm text-muted-foreground">특별한 아이템과 보너스를 만나보세요</p>
            </div>
          </div>

          <div className="glass-metal rounded-xl p-4 border-metal metal-pulse flex items-center gap-4">
            <ShopBadge />
            <div className="text-right">
              <div className="text-sm text-muted-foreground">보유 골드</div>
              <div className="text-xl font-black text-gradient-gold">{gold.toLocaleString()}G</div>
            </div>
          </div>
        </div>
      </motion.header>

      {/* 메인 콘텐츠 */}
      <div className="relative z-10 p-4 lg:p-6 max-w-7xl mx-auto">
        {/* 🎯 빠른 액션 버튼들 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="mb-6"
        >
          <div className="flex gap-4 justify-center">
            <Button
              onClick={onNavigateToInventory}
              className="glass-metal-hover bg-gradient-to-r from-success to-primary text-white border-0 px-8 py-3 metal-shine"
            >
              <Package className="w-5 h-5 mr-2" />내 아이템 보기
            </Button>
            <Button
              onClick={onNavigateToProfile}
              className="glass-metal-hover bg-gradient-to-r from-info to-primary text-white border-0 px-8 py-3 metal-shine"
            >
              <Trophy className="w-5 h-5 mr-2" />
              프로필 관리
            </Button>
          </div>
        </motion.div>

        {/* 🎯 보유 아이템 미리보기 (글래스메탈) */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="mb-8"
        >
          <Card className="glass-metal p-8 border-success/20 metal-shine">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-4">
                <div className="w-14 h-14 rounded-full bg-gradient-to-br from-success to-primary p-3 glass-metal">
                  <Package className="w-full h-full text-white" />
                </div>
                <div>
                  <h3 className="text-xl font-bold text-gradient-metal">✨ 보유 아이템 미리보기</h3>
                  <p className="text-muted-foreground">현재 소유하고 있는 프리미엄 아이템들</p>
                </div>
              </div>

              <Button
                variant="outline"
                onClick={onNavigateToInventory}
                className="glass-metal-hover border-success/30 text-success hover:bg-success/10 metal-shine"
              >
                <Package className="w-4 h-4 mr-2" />
                전체 보기
              </Button>
            </div>

            {user.inventory.length === 0 ? (
              <div className="text-center py-12">
                <div className="glass-metal rounded-full w-20 h-20 mx-auto mb-4 flex items-center justify-center">
                  <Package className="w-10 h-10 text-muted-foreground" />
                </div>
                <p className="text-lg text-muted-foreground mb-2">보유한 아이템이 없습니다</p>
                <p className="text-muted-foreground">아래에서 프리미엄 아이템을 구매해보세요!</p>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 xl:grid-cols-8 gap-4">
                {user.inventory.slice(0, 16).map((item, index) => {
                  const styles = getRarityStyles(item.rarity);
                  return (
                    <motion.div
                      key={item.id}
                      initial={{ opacity: 0, scale: 0.8 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: index * 0.05 }}
                      className={`glass-metal-hover ${styles.bgColor} rounded-xl p-4 border-2 ${styles.borderColor} text-center metal-shine`}
                    >
                      <div className="text-3xl mb-3">{item.icon}</div>
                      <div className={`text-xs font-bold ${styles.textColor} mb-2 truncate`}>
                        {item.name}
                      </div>
                      {item.quantity > 1 && (
                        <Badge variant="secondary" className="text-xs glass-metal text-white">
                          ×{item.quantity}
                        </Badge>
                      )}
                    </motion.div>
                  );
                })}

                {user.inventory.length > 16 && (
                  <motion.div
                    initial={{ opacity: 0, scale: 0.8 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ delay: 0.8 }}
                    onClick={onNavigateToInventory}
                    className="glass-metal-hover bg-muted/20 rounded-xl p-4 border-2 border-dashed border-muted cursor-pointer hover:border-primary transition-colors text-center metal-shine"
                  >
                    <div className="text-3xl mb-3">📦</div>
                    <div className="text-xs font-bold text-muted-foreground mb-2">더보기</div>
                    <div className="text-xs text-primary">+{user.inventory.length - 16}개</div>
                  </motion.div>
                )}
              </div>
            )}
          </Card>
        </motion.div>

        {/* 🛍️ 상점 아이템 섹션 헤더 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="mb-6"
        >
          <div className="text-center">
            <h2 className="text-2xl font-bold text-gradient-primary mb-2">
              🛍️ 프리미엄 아이템 상점
            </h2>
            <p className="text-muted-foreground">특별한 아이템으로 게임을 더욱 즐겁게!</p>
          </div>
        </motion.div>

        {/* 🛍️ 상점 아이템 그리드 (글래스메탈) */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
          {itemsToRender.map((item: any, index: number) => {
            const styles = getRarityStyles(item.rarity);
            const finalPrice = Math.floor(item.price * (1 - item.discount / 100));
            const canAfford = gold >= finalPrice;

            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 + index * 0.1 }}
                className="relative"
              >
                <Card
                  className={`glass-metal p-8 border-2 ${styles.borderColor} glass-metal-hover ${styles.glowColor} relative overflow-hidden metal-shine`}
                >
                  {/* 🏷️ 배지들 */}
                  <div className="absolute top-4 right-4 flex flex-col gap-2">
                    {item.discount > 0 && (
                      <Badge className="glass-metal bg-error text-white font-bold text-xs px-3 py-2 rounded-full">
                        -{item.discount}%
                      </Badge>
                    )}
                    {item.isLimited && (
                      <Badge className="glass-metal bg-gold text-white font-bold text-xs px-3 py-2 rounded-full">
                        <Timer className="w-3 h-3 mr-1" />
                        한정
                      </Badge>
                    )}
                  </div>

                  {item.popular && (
                    <div className="absolute top-4 left-4">
                      <Badge className="glass-metal bg-primary text-white font-bold text-xs px-3 py-2 rounded-full">
                        <Flame className="w-3 h-3 mr-1" />
                        인기
                      </Badge>
                    </div>
                  )}

                  {/* 🎨 아이템 아이콘 */}
                  <div
                    className={`glass-metal ${styles.bgColor} rounded-2xl w-20 h-20 mx-auto mb-6 flex items-center justify-center text-4xl border ${styles.borderColor} metal-shine`}
                  >
                    {item.icon}
                  </div>

                  {/* 📝 아이템 정보 */}
                  <div className="text-center mb-6">
                    <h3 className={`text-lg font-bold ${styles.textColor} mb-3`}>{item.name}</h3>
                    <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
                      {item.description}
                    </p>

                    <Badge
                      className={`glass-metal text-white border ${styles.borderColor} bg-transparent px-3 py-1`}
                    >
                      {item.rarity === 'common'
                        ? '일반'
                        : item.rarity === 'rare'
                        ? '레어'
                        : item.rarity === 'epic'
                        ? '에픽'
                        : '전설'}
                    </Badge>
                  </div>

                  {/* 💰 가격 및 구매 */}
                  <div className="space-y-4">
                    <div className="text-center">
                      {item.discount > 0 ? (
                        <div>
                          <div className="text-sm text-muted-foreground line-through mb-1">
                            {item.price.toLocaleString()}G
                          </div>
                          <div className="text-2xl font-bold text-error">
                            {finalPrice.toLocaleString()}G
                          </div>
                        </div>
                      ) : (
                        <div className="text-2xl font-bold text-gradient-gold">
                          {item.price.toLocaleString()}G
                        </div>
                      )}
                    </div>

                    <Button
                      onClick={() => {
                        setSelectedItem(item);
                        setShowPurchaseModal(true);
                      }}
                      disabled={!canAfford}
                      className={`w-full glass-metal-hover ${
                        item.rarity === 'legendary'
                          ? 'bg-gradient-to-r from-gold to-gold-light'
                          : item.rarity === 'epic'
                          ? 'bg-gradient-to-r from-primary to-primary-light'
                          : item.rarity === 'rare'
                          ? 'bg-gradient-to-r from-info to-primary'
                          : 'bg-gradient-metal'
                      } hover:opacity-90 text-white font-bold py-3 disabled:opacity-50 disabled:cursor-not-allowed metal-shine`}
                    >
                      <ShoppingCart className="w-5 h-5 mr-2" />
                      {canAfford ? '구매하기' : '골드 부족'}
                    </Button>
                  </div>
                </Card>
              </motion.div>
            );
          })}
        </div>

        {/* 🧾 최근 거래 히스토리 */}
        <ShopPurchaseHistory />
      </div>

      {/* 🔮 구매 확인 모달 (글래스메탈) */}
      <AnimatePresence>
        {showPurchaseModal && selectedItem && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4"
            onClick={() => setShowPurchaseModal(false)}
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              onClick={(e: any) => e.stopPropagation()}
              className="glass-metal rounded-3xl p-10 max-w-md w-full relative metal-shine"
            >
              <div className="text-center mb-8">
                {(() => {
                  const styles = getRarityStyles(selectedItem.rarity);
                  return (
                    <div
                      className={`glass-metal ${styles.bgColor} rounded-2xl w-24 h-24 mx-auto mb-6 flex items-center justify-center text-5xl border ${styles.borderColor} metal-shine`}
                    >
                      {selectedItem.icon}
                    </div>
                  );
                })()}

                <h3
                  className={`text-2xl font-bold ${
                    getRarityStyles(selectedItem.rarity).textColor
                  } mb-3`}
                >
                  {selectedItem.name}
                </h3>
                <p className="text-muted-foreground mb-6">정말로 구매하시겠습니까?</p>

                <div className="text-3xl font-bold text-gradient-gold mb-2">
                  {Math.floor(
                    selectedItem.price * (1 - selectedItem.discount / 100)
                  ).toLocaleString()}
                  G
                </div>
                {selectedItem.discount > 0 && (
                  <div className="text-sm text-muted-foreground line-through">
                    {selectedItem.price.toLocaleString()}G
                  </div>
                )}
              </div>

              <div className="flex gap-4">
                <Button
                  variant="outline"
                  onClick={() => setShowPurchaseModal(false)}
                  className="flex-1 glass-metal-hover border-metal py-3"
                >
                  취소
                </Button>
                <Button
                  onClick={() => handlePurchase(selectedItem)}
                  className="flex-1 bg-gradient-to-r from-primary to-primary-light glass-metal-hover py-3 metal-shine"
                >
                  구매
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}