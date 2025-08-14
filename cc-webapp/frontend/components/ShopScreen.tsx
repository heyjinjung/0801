'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
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
import { toast } from 'sonner';
import { buyProduct } from '../utils/actions';
import { User, GameItem } from '../types';

interface ShopScreenProps {
  user: User;
  onBack: () => void;
  onNavigateToInventory: () => void;
  onNavigateToProfile: () => void;
  onUpdateUser: (user: User) => void;
  onAddNotification: (message: string) => void;
}

// 🏪 상점 아이템 데이터
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
    popular: false
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
    popular: true
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
    popular: false
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
    popular: false
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
    popular: true
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
    popular: false
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
    popular: true
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
    popular: false
  }
];

export function ShopScreen({
  user,
  onBack,
  onNavigateToInventory,
  onNavigateToProfile,
  onUpdateUser,
  onAddNotification
}: ShopScreenProps) {
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null as import('../types').GameItem | null);
  const [isPurchasing, setIsPurchasing] = useState(false);
  const [purchaseError, setPurchaseError] = useState(null as string | null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [qty, setQty] = useState(1);

  // 🎨 등급별 스타일링 (글래스메탈 버전)
  const getRarityStyles = (rarity: string) => {
    switch (rarity) {
      case 'common':
        return {
          textColor: 'text-muted-foreground',
          borderColor: 'border-muted-foreground/30',
          bgColor: 'bg-secondary/20',
          glowColor: 'hover:shadow-lg'
        };
      case 'rare':
        return {
          textColor: 'text-info',
          borderColor: 'border-info/30',
          bgColor: 'bg-info/10',
          glowColor: 'hover:shadow-info/20 hover:shadow-lg'
        };
      case 'epic':
        return {
          textColor: 'text-primary',
          borderColor: 'border-primary/30',
          bgColor: 'bg-primary/10',
          glowColor: 'hover:shadow-primary/20 hover:shadow-lg'
        };
      case 'legendary':
        return {
          textColor: 'text-gold',
          borderColor: 'border-gold/30',
          bgColor: 'bg-gold/10',
          glowColor: 'hover:shadow-gold/20 hover:shadow-lg'
        };
      default:
        return {
          textColor: 'text-muted-foreground',
          borderColor: 'border-muted-foreground/30',
          bgColor: 'bg-secondary/20',
          glowColor: 'hover:shadow-lg'
        };
    }
  };

  // 💰 아이템 구매 처리 (로컬 상태 업데이트 유틸)
  const applyLocalPurchase = (item: any, q: number) => {
    const unitPrice = Math.floor(item.price * (1 - item.discount / 100));
    const finalPrice = unitPrice * Math.max(1, q);
    
    if (user.goldBalance < finalPrice) {
      onAddNotification('❌ 골드가 부족합니다!');
      return;
    }

    const newItem: GameItem = {
      id: `${item.id}_${Date.now()}`,
      name: item.name,
      type: item.type,
      rarity: item.rarity,
      quantity: item.type === 'currency' ? item.value * Math.max(1, q) : 1,
      description: item.description,
      icon: item.icon,
      value: item.value
    };

    let updatedUser = { ...user };

    // 골드 타입 아이템은 즉시 골드로 변환
    if (item.type === 'currency') {
      updatedUser = {
        ...updatedUser,
        goldBalance: user.goldBalance - finalPrice + (item.value * Math.max(1, q))
      };
      onAddNotification(`💰 ${(item.value * Math.max(1, q)).toLocaleString()}G를 획득했습니다!`);
    } else {
      // 일반 아이템은 인벤토리에 추가
      updatedUser = {
        ...updatedUser,
        goldBalance: user.goldBalance - finalPrice,
        inventory: [...user.inventory, newItem]
      };
      onAddNotification(`✅ ${item.name}을(를) 구매했습니다!`);
    }

    onUpdateUser(updatedUser);
  };

  // 🔗 서버 연동: /api/shop/buy 호출 + 로딩/에러/재시도 처리
  const confirmPurchase = async () => {
    if (!selectedItem || isPurchasing) return;
    setPurchaseError(null);
    setIsPurchasing(true);

    const unitPrice = Math.floor(selectedItem.price * (1 - selectedItem.discount / 100));
    const q = Math.max(1, qty);
    const finalPrice = unitPrice * q;
    // 서버는 가격을 재계산할 수 있으나, 현재 클라이언트 금액도 전달 (서버 우선)
    const payload = {
      user_id: Number(user.id),
  product_id: selectedItem.id,
  amount: finalPrice,
  quantity: q,
      metadata: { source: 'frontend-shop', rarity: selectedItem.rarity }
    } as const;

    try {
      await buyProduct(payload);
      // 성공 시: 로컬 상태 반영 + 토스트
  applyLocalPurchase(selectedItem, q);
      toast.success(`구매 완료: ${selectedItem.name}`);
      setShowPurchaseModal(false);
    } catch (e: any) {
      const msg = e?.message || '구매 요청 중 오류가 발생했습니다.';
      setPurchaseError(msg);
    } finally {
      setIsPurchasing(false);
    }
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
              y: Math.random() * (typeof window !== 'undefined' ? window.innerHeight : 1000)
            }}
            animate={{ 
              opacity: [0, 0.4, 0],
              scale: [0, 2, 0],
              rotate: 360
            }}
            transition={{
              duration: 10,
              repeat: Infinity,
              delay: i * 0.3,
              ease: "easeInOut"
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

          <div className="glass-metal rounded-xl p-4 border-metal metal-pulse">
            <div className="text-right">
              <div className="text-sm text-muted-foreground">보유 골드</div>
              <div className="text-xl font-black text-gradient-gold">
                {user.goldBalance.toLocaleString()}G
              </div>
            </div>
          </div>
          <div>
            <Link href="/shop/history" className="text-sm underline opacity-80 hover:opacity-100">구매 히스토리</Link>
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
              <Package className="w-5 h-5 mr-2" />
              내 아이템 보기
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
                    <div className="text-xs font-bold text-muted-foreground mb-2">
                      더보기
                    </div>
                    <div className="text-xs text-primary">
                      +{user.inventory.length - 16}개
                    </div>
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
            <h2 className="text-2xl font-bold text-gradient-primary mb-2">🛍️ 프리미엄 아이템 상점</h2>
            <p className="text-muted-foreground">특별한 아이템으로 게임을 더욱 즐겁게!</p>
          </div>
        </motion.div>

        {/* 🛍️ 상점 아이템 그리드 (글래스메탈) */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-8">
          {SHOP_ITEMS.map((item, index) => {
            const styles = getRarityStyles(item.rarity);
            const finalPrice = Math.floor(item.price * (1 - item.discount / 100));
            const canAfford = user.goldBalance >= finalPrice;
            
            return (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 + index * 0.1 }}
                className="relative"
              >
                <Card className={`glass-metal p-8 border-2 ${styles.borderColor} glass-metal-hover ${styles.glowColor} relative overflow-hidden metal-shine`}>
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
                  <div className={`glass-metal ${styles.bgColor} rounded-2xl w-20 h-20 mx-auto mb-6 flex items-center justify-center text-4xl border ${styles.borderColor} metal-shine`}>
                    {item.icon}
                  </div>

                  {/* 📝 아이템 정보 */}
                  <div className="text-center mb-6">
                    <h3 className={`text-lg font-bold ${styles.textColor} mb-3`}>
                      {item.name}
                    </h3>
                    <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
                      {item.description}
                    </p>
                    
                    <Badge className={`glass-metal text-white border ${styles.borderColor} bg-transparent px-3 py-1`}>
                      {item.rarity === 'common' ? '일반' :
                       item.rarity === 'rare' ? '레어' :
                       item.rarity === 'epic' ? '에픽' : '전설'}
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

                    <div className="grid grid-cols-2 gap-2">
                      <Button
                        variant="outline"
                        onClick={() => {
                          setSelectedItem(item as any);
                          setShowDetailModal(true);
                        }}
                        className="w-full glass-metal-hover"
                      >
                        자세히
                      </Button>
                      <Button
                      onClick={() => {
                        setSelectedItem(item as any);
                        setQty(1);
                        setPurchaseError(null);
                        setShowPurchaseModal(true);
                      }}
                      disabled={!canAfford}
                      className={`w-full glass-metal-hover ${
                        item.rarity === 'legendary' ? 'bg-gradient-to-r from-gold to-gold-light' :
                        item.rarity === 'epic' ? 'bg-gradient-to-r from-primary to-primary-light' :
                        item.rarity === 'rare' ? 'bg-gradient-to-r from-info to-primary' :
                        'bg-gradient-metal'
                      } hover:opacity-90 text-white font-bold py-3 disabled:opacity-50 disabled:cursor-not-allowed metal-shine`}
                      >
                        <ShoppingCart className="w-5 h-5 mr-2" />
                        {canAfford ? '구매하기' : '골드 부족'}
                      </Button>
                    </div>
                  </div>
                </Card>
              </motion.div>
            );
          })}
        </div>
      </div>

      {/* � 상품 상세 모달 (최소 침범, 기존 스타일 유지) */}
      <AnimatePresence>
        {showDetailModal && selectedItem && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => setShowDetailModal(false)}
          >
            <motion.div
              initial={{ y: 40, opacity: 0, scale: 0.98 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 20, opacity: 0, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 260, damping: 22 }}
              className="glass-metal w-full max-w-md rounded-2xl border border-metal shadow-2xl"
              onClick={(e: any) => e.stopPropagation()}
            >
              <div className="p-6">
                {/* 미세 효과: 상단 얇은 네온 라인 */}
                <div className="h-1 w-full mb-3 bg-gradient-to-r from-primary/40 via-gold/40 to-primary/40 rounded-full opacity-60" />
                <div className="flex items-center gap-3 mb-4">
                  <div className="text-3xl">{selectedItem.icon}</div>
                  <div>
                    <div className="text-lg font-bold">{selectedItem.name}</div>
                    <div className="text-muted-foreground text-sm">상세 정보</div>
                  </div>
                </div>
                <div className="bg-muted/10 rounded-xl p-4 mb-4 border border-border/40 text-sm leading-relaxed">
                  <div className="mb-2">{selectedItem.description}</div>
                  <div className="flex items-center justify-between">
                    <span className="text-muted-foreground">등급</span>
                    <span className="font-medium">{selectedItem.rarity}</span>
                  </div>
                </div>
                <div className="flex gap-3">
                  <Button variant="outline" className="flex-1" onClick={() => setShowDetailModal(false)}>닫기</Button>
                  <Button
                    className="flex-1 bg-gradient-to-r from-primary to-primary-light text-white"
                    onClick={() => {
                      setShowDetailModal(false);
                      setQty(1);
                      setPurchaseError(null);
                      setShowPurchaseModal(true);
                    }}
                  >구매하기</Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* �🔮 구매 확인 오버레이 (커스텀 프레이머 모달 복원) */}
      <AnimatePresence>
        {showPurchaseModal && selectedItem && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
            onClick={() => !isPurchasing && setShowPurchaseModal(false)}
          >
            <motion.div
              initial={{ y: 40, opacity: 0, scale: 0.98 }}
              animate={{ y: 0, opacity: 1, scale: 1 }}
              exit={{ y: 20, opacity: 0, scale: 0.98 }}
              transition={{ type: 'spring', stiffness: 260, damping: 22 }}
              className="glass-metal w-full max-w-md rounded-2xl border border-metal shadow-2xl" 
              onClick={(e: any) => e.stopPropagation()}
            >
              <div className="p-6">
                {/* 미세 효과: 상단 얇은 네온 라인 */}
                <div className="h-1 w-full mb-3 bg-gradient-to-r from-primary/40 via-gold/40 to-primary/40 rounded-full opacity-60" />
                <div className="flex items-center gap-3 mb-4">
                  <div className="text-2xl">{selectedItem.icon}</div>
                  <div>
                    <div className="text-lg font-bold">구매 확인</div>
                    <div className="text-muted-foreground text-sm">포인트가 차감됩니다. 진행하시겠습니까?</div>
                  </div>
                </div>

                <div className="bg-muted/10 rounded-xl p-4 mb-4 border border-border/40">
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm text-muted-foreground">상품</div>
                    <div className="font-medium">{selectedItem.name}</div>
                  </div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm text-muted-foreground">수량</div>
                    {selectedItem.type === 'currency' ? (
                      <div className="flex items-center gap-2">
                        <Button variant="outline" onClick={() => setQty((v: number) => Math.max(1, v - 1))} disabled={isPurchasing}>-</Button>
                        <input
                          className="w-16 text-center rounded border bg-background"
                          type="number"
                          min={1}
                          value={qty}
                          onChange={(e: any) => setQty(Math.max(1, parseInt(e.target.value || '1', 10)))}
                          disabled={isPurchasing}
                        />
                        <Button variant="outline" onClick={() => setQty((v: number) => Math.min(99, v + 1))} disabled={isPurchasing}>+</Button>
                      </div>
                    ) : (
                      <div className="opacity-70">1</div>
                    )}
                  </div>
                  <div className="flex items-center justify-between mb-2">
                    <div className="text-sm text-muted-foreground">가격</div>
                    <div className="font-bold text-gold">
                      {(
                        Math.floor(selectedItem.price * (1 - selectedItem.discount / 100)) * Math.max(1, qty)
                      ).toLocaleString()}G
                    </div>
                  </div>
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-muted-foreground">구매 후 잔액</div>
                    <div className="font-medium">
                      {(
                        user.goldBalance - (Math.floor(selectedItem.price * (1 - selectedItem.discount / 100)) * Math.max(1, qty))
                      ).toLocaleString()}G
                    </div>
                  </div>
                </div>

                {purchaseError && (
                  <div className="bg-destructive/10 text-destructive border border-destructive/30 rounded-md p-3 text-sm mb-4">
                    {purchaseError}
                  </div>
                )}

                <div className="flex gap-3">
                  <Button
                    variant="outline"
                    disabled={isPurchasing}
                    onClick={() => setShowPurchaseModal(false)}
                    className="flex-1"
                  >
                    취소
                  </Button>
                  <Button
                    onClick={confirmPurchase}
                    disabled={isPurchasing}
                    className="flex-1 bg-gradient-to-r from-primary to-primary-light text-white"
                  >
                    {isPurchasing ? '처리 중…' : '확인'}
                  </Button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}