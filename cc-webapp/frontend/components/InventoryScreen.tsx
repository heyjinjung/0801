'use client';

import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  ArrowLeft,
  Package,
  Search,
  Filter,
  Star,
  Trophy,
  Gem,
  Crown,
  Gift,
  Sword,
  Shield,
  Sparkles,
  Eye,
  Info,
  X,
  Grid3X3,
  List,
  SortAsc,
  SortDesc,
  Lock
} from 'lucide-react';
import { User, GameItem } from '../types';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Badge } from './ui/badge';
import { useGlobalStore } from '@/store/globalStore';

interface InventoryScreenProps {
  user: User;
  onBack: () => void;
  onUpdateUser: (user: User) => void;
  onAddNotification: (message: string) => void;
}

export function InventoryScreen({ user, onBack, onUpdateUser, onAddNotification }: InventoryScreenProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState('grid' as 'grid' | 'list');
  const [selectedItem, setSelectedItem] = useState(null as GameItem | null);
  const [showItemModal, setShowItemModal] = useState(false);
  // 서버 권위 재조정된 글로벌 인벤토리 우선 사용
  const { state } = useGlobalStore();
  const inventory = (state?.inventory && state.inventory.length ? state.inventory : user.inventory) as any[];

  // 간단한 검색 필터링만 (글로벌 스토어 우선)
  const filteredItems = inventory
    .filter(item => {
      const matchesSearch = item.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                           item.description.toLowerCase().includes(searchQuery.toLowerCase());
      return matchesSearch;
    })
    .sort((a, b) => parseInt(b.id) - parseInt(a.id)); // 최신순 정렬

  const getRarityColor = (rarity: string) => {
    switch (rarity) {
      case 'common': return 'text-muted-foreground border-muted';
      case 'rare': return 'text-info border-info';
      case 'epic': return 'text-primary border-primary';
      case 'legendary': return 'text-gold border-gold';
      case 'mythic': return 'text-gradient-primary border-gradient-primary';
      default: return 'text-muted-foreground border-muted';
    }
  };

  const getRarityBg = (rarity: string) => {
    switch (rarity) {
      case 'common': return 'bg-muted-soft';
      case 'rare': return 'bg-info-soft';
      case 'epic': return 'bg-primary-soft';
      case 'legendary': return 'bg-gold-soft';
      case 'mythic': return 'bg-gradient-to-r from-primary-soft to-gold-soft';
      default: return 'bg-muted-soft';
    }
  };

  const getTypeIcon = (type: any) => {
  const t = String(type);
  if (t === 'skin') return <Crown className="w-4 h-4" />;
  if (t === 'powerup') return <Sparkles className="w-4 h-4" />;
  if (t === 'currency') return <Gem className="w-4 h-4" />;
  if (t === 'collectible') return <Trophy className="w-4 h-4" />;
  if (t === 'character') return <Star className="w-4 h-4" />;
  if (t === 'weapon') return <Sword className="w-4 h-4" />;
  if (t === 'premium') return <Crown className="w-4 h-4" />;
  if (t === 'special') return <Gift className="w-4 h-4" />;
  return <Package className="w-4 h-4" />;
  };

  const getItemVectorIcon = (item: GameItem) => {
    const color = getRarityColor(item.rarity).split(' ')[0].replace('text-', '');
    
  switch (String(item.type)) {
      case 'skin':
        return (
          <svg width="48" height="48" viewBox="0 0 48 48" className={`text-${color}`}>
            <path d="M24 4L32 16H40L32 24L36 40L24 32L12 40L16 24L8 16H16L24 4Z" 
                  fill="currentColor" opacity="0.8"/>
            <circle cx="24" cy="22" r="6" fill="rgba(255,255,255,0.3)"/>
          </svg>
        );
      case 'powerup':
        return (
          <svg width="48" height="48" viewBox="0 0 48 48" className={`text-${color}`}>
            <circle cx="24" cy="24" r="16" fill="currentColor" opacity="0.8"/>
            <path d="M16 24L24 16L32 24L24 32L16 24Z" fill="rgba(255,255,255,0.9)"/>
            <circle cx="24" cy="24" r="4" fill="rgba(0,0,0,0.3)"/>
          </svg>
        );
      case 'weapon':
        return (
          <svg width="48" height="48" viewBox="0 0 48 48" className={`text-${color}`}>
            <path d="M12 36L24 24L36 36L24 44L12 36Z" fill="currentColor" opacity="0.8"/>
            <path d="M24 4L32 12L24 20L16 12L24 4Z" fill="currentColor"/>
            <rect x="22" y="12" width="4" height="20" fill="rgba(255,255,255,0.3)"/>
          </svg>
        );
      default:
        return (
          <svg width="48" height="48" viewBox="0 0 48 48" className={`text-${color}`}>
            <rect x="8" y="12" width="32" height="28" rx="4" fill="currentColor" opacity="0.8"/>
            <rect x="12" y="8" width="24" height="8" rx="2" fill="currentColor"/>
            <circle cx="20" cy="24" r="2" fill="rgba(255,255,255,0.8)"/>
            <circle cx="28" cy="24" r="2" fill="rgba(255,255,255,0.8)"/>
          </svg>
        );
    }
  };

  // 🚫 아이템 삭제 기능 완전 제거
  // const handleDeleteItem = (itemId: string) => {
  //   // 구매한 아이템은 삭제할 수 없음
  // };

  const categoryStats = {
    all: inventory.length,
    skin: inventory.filter(item => item.type === 'skin').length,
    powerup: inventory.filter(item => item.type === 'powerup').length,
    currency: inventory.filter(item => item.type === 'currency').length,
    collectible: inventory.filter(item => item.type === 'collectible').length,
    character: inventory.filter(item => (item.type as string) === 'character').length,
    weapon: inventory.filter(item => (item.type as string) === 'weapon').length,
    premium: inventory.filter(item => (item.type as string) === 'premium').length,
    special: inventory.filter(item => (item.type as string) === 'special').length
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-black to-primary-soft relative overflow-hidden">
      {/* 배경 애니메이션 */}
      <div className="absolute inset-0">
        {[...Array(12)].map((_, i) => (
          <motion.div
            key={i}
            initial={{ 
              opacity: 0,
              x: Math.random() * (typeof window !== 'undefined' ? window.innerWidth : 1000),
              y: Math.random() * (typeof window !== 'undefined' ? window.innerHeight : 1000)
            }}
            animate={{ 
              opacity: [0, 0.2, 0],
              scale: [0, 1.2, 0],
              rotate: 360
            }}
            transition={{
              duration: 15,
              repeat: Infinity,
              delay: i * 0.8,
              ease: "easeInOut"
            }}
            className="absolute w-1 h-1 bg-primary rounded-full"
          />
        ))}
      </div>

      {/* 🎯 간소화된 헤더 */}
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
            
            <div>
              <h1 className="text-xl lg:text-2xl font-bold text-gradient-primary">
                보유 아이템
              </h1>
              <p className="text-sm text-muted-foreground">총 {inventory.length}개 아이템</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* 뷰 모드 전환 */}
            <div className="flex items-center border border-border-secondary rounded-lg p-1">
              <Button
                variant={viewMode === 'grid' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('grid')}
                className="px-3"
              >
                <Grid3X3 className="w-4 h-4" />
              </Button>
              <Button
                variant={viewMode === 'list' ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setViewMode('list')}
                className="px-3"
              >
                <List className="w-4 h-4" />
              </Button>
            </div>

            <div className="glass-effect rounded-xl p-3 border border-primary/20">
              <div className="text-right">
                <div className="text-sm text-muted-foreground">{user.nickname}</div>
                <div className="text-lg font-bold text-primary">레벨 {user.level}</div>
              </div>
            </div>
          </div>
        </div>
      </motion.header>

      {/* 메인 컨텐츠 */}
      <div className="relative z-10 max-w-7xl mx-auto p-4 lg:p-6">
        {/* 간단한 검색만 */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="glass-effect rounded-xl p-4 mb-6"
        >
          <div className="flex items-center justify-between">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <Input
                placeholder="아이템 검색..."
                value={searchQuery}
                onChange={(e: any) => setSearchQuery(e.target.value)}
                className="pl-10"
              />
            </div>
            
            <div className="text-sm text-muted-foreground ml-4">
              총 {filteredItems.length}개 아이템
            </div>
          </div>
        </motion.div>

        {/* 아이템 그리드/리스트 */}
        {filteredItems.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="text-center py-16"
          >
            <Package className="w-16 h-16 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-xl font-bold text-foreground mb-2">아이템이 없습니다</h3>
            <p className="text-muted-foreground">상점에서 아이템을 구매하거나 게임을 플레이해보세요!</p>
          </motion.div>
        ) : (
          <div className={`gap-6 ${
            viewMode === 'grid' 
              ? 'grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4' 
              : 'flex flex-col space-y-4'
          }`}>
            {filteredItems.map((item, index) => (
              <motion.div
                key={item.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.05 }}
                onClick={() => {
                  setSelectedItem(item);
                  setShowItemModal(true);
                }}
                className={`cursor-pointer card-hover-float ${
                  viewMode === 'grid'
                    ? 'glass-effect rounded-xl p-4'
                    : 'glass-effect rounded-lg p-4 flex items-center gap-4'
                }`}
              >
                {/* 아이템 아이콘 */}
                <div className={`${getRarityBg(item.rarity)} rounded-lg flex items-center justify-center ${
                  viewMode === 'grid' ? 'w-16 h-16 mb-3 mx-auto' : 'w-12 h-12'
                }`}>
                  {getItemVectorIcon(item)}
                </div>

                {/* 아이템 정보 */}
                <div className={viewMode === 'grid' ? 'text-center' : 'flex-1'}>
                  <div className="flex items-center gap-2 mb-1">
                    {getTypeIcon(item.type)}
                    <h3 className={`font-bold ${getRarityColor(item.rarity).split(' ')[0]} ${
                      viewMode === 'grid' ? 'text-sm' : 'text-base'
                    }`}>
                      {item.name}
                    </h3>
                  </div>
                  
                  <p className={`text-muted-foreground ${
                    viewMode === 'grid' ? 'text-xs mb-2' : 'text-sm mb-1'
                  }`}>
                    {item.description}
                  </p>

                  <div className="flex items-center gap-2 justify-center">
                    <Badge className={`${getRarityColor(item.rarity).split(' ')[0]} text-xs`}>
                      {item.rarity === 'common' ? '일반' :
                       item.rarity === 'rare' ? '레어' :
                       item.rarity === 'epic' ? '에픽' :
                       item.rarity === 'legendary' ? '전설' : '신화'}
                    </Badge>
                    
                    {item.quantity > 1 && (
                      <Badge variant="secondary" className="text-xs">
                        ×{item.quantity}
                      </Badge>
                    )}
                  </div>
                </div>

                {viewMode === 'list' && (
                  <div className="flex items-center gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={(e: any) => {
                        e.stopPropagation();
                        setSelectedItem(item);
                        setShowItemModal(true);
                      }}
                    >
                      <Eye className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </motion.div>
            ))}
          </div>
        )}
      </div>

      {/* 🎯 아이템 상세 모달 - 삭제 버튼 제거 */}
      <AnimatePresence>
        {showItemModal && selectedItem && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4"
            onClick={() => setShowItemModal(false)}
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.8, opacity: 0 }}
              onClick={(e: any) => e.stopPropagation()}
              className="glass-effect rounded-2xl p-8 max-w-md w-full relative"
            >
              <Button
                variant="ghost"
                size="icon"
                onClick={() => setShowItemModal(false)}
                className="absolute top-4 right-4"
              >
                <X className="w-4 h-4" />
              </Button>

              <div className="text-center mb-6">
                <div className={`${getRarityBg(selectedItem.rarity)} rounded-xl w-20 h-20 mx-auto mb-4 flex items-center justify-center`}>
                  {getItemVectorIcon(selectedItem)}
                </div>
                <h3 className={`text-xl font-bold ${getRarityColor(selectedItem.rarity).split(' ')[0]} mb-2`}>
                  {selectedItem.name}
                </h3>
                <p className="text-muted-foreground mb-4">
                  {selectedItem.description}
                </p>
              </div>

              <div className="space-y-4 mb-6">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">타입:</span>
                  <div className="flex items-center gap-2">
                    {getTypeIcon(selectedItem.type)}
                    <span className="text-foreground capitalize">{selectedItem.type}</span>
                  </div>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">등급:</span>
                  <Badge className={getRarityColor(selectedItem.rarity).split(' ')[0]}>
                    {selectedItem.rarity === 'common' ? '일반' :
                     selectedItem.rarity === 'rare' ? '레어' :
                     selectedItem.rarity === 'epic' ? '에픽' :
                     selectedItem.rarity === 'legendary' ? '전설' : '신화'}
                  </Badge>
                </div>

                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">수량:</span>
                  <span className="text-foreground font-bold">×{selectedItem.quantity}</span>
                </div>

                {selectedItem.value && (
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">가치:</span>
                    <span className="text-gold font-bold">{selectedItem.value.toLocaleString()}G</span>
                  </div>
                )}

                {/* 🔒 구매 후 영구 소유 안내 */}
                <div className="flex items-center gap-2 p-3 rounded-lg bg-success/10 border border-success/20">
                  <Lock className="w-4 h-4 text-success" />
                  <span className="text-success text-sm font-medium">영구 소유 아이템</span>
                </div>
              </div>

              <div className="flex gap-3">
                <Button
                  variant="outline"
                  onClick={() => setShowItemModal(false)}
                  className="flex-1"
                >
                  닫기
                </Button>
                {/* 🚫 삭제 버튼 완전 제거 */}
                <Button
                  variant="secondary"
                  onClick={() => setShowItemModal(false)}
                  className="flex-1"
                  disabled
                >
                  <Lock className="w-4 h-4 mr-2" />
                  영구 보관
                </Button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}