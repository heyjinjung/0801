import { User, GameItem } from '../../../types';
import { GachaItem, GachaBanner, HeartParticle } from '../../../types/gacha';
import { ANIMATION_DURATIONS, SEXY_EMOJIS, GACHA_ITEMS } from './constants';

// 파티클 인터페이스 정의
export interface Particle {
  id: string;
  size: number;
  x?: string;
  y?: string;
  left?: string;
  top?: string;
  color?: string;
  duration: number;
  rarity?: string;
  animationDuration?: string;
  animationDelay?: string;
}

/**
 * 고유 ID 생성 함수
 * @param prefix ID 앞에 붙일 접두사
 * @returns 랜덤 ID 문자열
 */
export function generateUniqueId(prefix: string = ''): string {
  return `${prefix}_${Math.random().toString(36).substring(2, 9)}_${Date.now()}`;
}

/**
 * 반짝이는 효과를 위한 랜덤 위치의 요소들 생성
 * @param count 생성할 반짝임 효과 개수
 * @returns 반짝임 효과 배열
 */
export function generateSparkles(count = 5) {
  return Array.from({ length: count }).map((_, index) => ({
    id: `sparkle-${index}`,
    size: Math.random() * 10 + 5, // 5-15px
    left: `${Math.random() * 100}%`,
    top: `${Math.random() * 100}%`,
    animationDelay: `${Math.random() * 2}s`,
    emoji: SEXY_EMOJIS[Math.floor(Math.random() * SEXY_EMOJIS.length)],
  }));
}

/**
 * 애니메이션 딜레이 계산 (순차적 애니메이션 효과용)
 * @param index 요소의 인덱스
 * @param baseDelay 기본 딜레이 값 (초)
 * @param stagger 요소 간 간격 (초)
 * @returns 계산된 딜레이 값
 */
export function getAnimationDelay(index: number, baseDelay = 0, stagger = 0.1) {
  return baseDelay + index * stagger;
}

/**
 * 가챠 결과에 따른 파티클 효과 생성
 * @param rarity 아이템 희귀도
 * @param count 생성할 파티클 개수
 * @returns 파티클 효과 배열
 */
export function generateParticles(rarity: string, count = 20): Particle[] {
  const colors = {
    common: '#a0a0a0',
    rare: '#4287f5',
    epic: '#9c27b0',
    legendary: '#ffd700',
    mythic: '#ff4081'
  };

  const rarityColor = colors[rarity as keyof typeof colors] || colors.common;

  return Array.from({ length: count }).map((_, index) => ({
    id: `particle-${index}`,
    size: Math.random() * 15 + 5,
    x: `${Math.random() * 100}%`,
    y: `${Math.random() * 5}%`, // 상단에서 시작
    left: `${Math.random() * 100}%`,
    top: `${Math.random() * 5}%`,
    color: rarityColor,
    duration: Math.random() * 3 + 2, // 2-5초 지속
    rarity,
    animationDuration: `${Math.random() * 2 + 1}s`,
    animationDelay: `${Math.random() * 0.5}s`,
  }));
}

// Generate floating heart particles
export const generateHeartParticles = (): HeartParticle[] => {
  return Array.from({ length: 3 }, (_, i) => ({
    id: generateUniqueId('heart'),
    x: Math.random() * 100,
    y: Math.random() * 100
  }));
};

// Get random item based on rates
export const getRandomItem = (banner: GachaBanner, user: User): GachaItem => {
  // Adjust rates for premium banners
  let adjustedItems = [...GACHA_ITEMS];
  
  if (banner.guaranteedRarity === 'epic') {
    // Remove common items, increase epic/legendary rates
    adjustedItems = adjustedItems.filter(item => item.rarity !== 'common');
    adjustedItems = adjustedItems.map(item => ({
      ...item,
      rate: item.rarity === 'epic' ? item.rate * 2 : item.rate
    }));
  } else if (banner.guaranteedRarity === 'legendary') {
    // Only legendary and mythic items
    adjustedItems = adjustedItems.filter(item => ['legendary', 'mythic'].includes(item.rarity));
    adjustedItems = adjustedItems.map(item => ({
      ...item,
      rate: item.rarity === 'legendary' ? item.rate * 3 : item.rate * 2
    }));
  }

  const totalRate = adjustedItems.reduce((sum, item) => sum + item.rate, 0);
  let random = Math.random() * totalRate;
  
  for (const item of adjustedItems) {
    random -= item.rate;
    if (random <= 0) {
      return { ...item, isNew: !user.inventory?.some(inv => inv.id === item.id) };
    }
  }
  
  return adjustedItems[0];
};

// Update user inventory with new item
export const updateUserInventory = (user: User, item: GachaItem): User => {
  const updatedInventory = [...(user.inventory || [])];
  const existingItemIndex = updatedInventory.findIndex(inv => inv.id === item.id);
  
  // 아이템 타입 변환 (GachaItem -> GameItem)
  const gameItem: GameItem = {
    id: item.id,
    name: item.name,
    type: item.type,
    rarity: item.rarity === 'mythic' ? 'legendary' : item.rarity, // mythic은 legendary로 처리
    quantity: item.quantity,
    description: item.description,
    icon: item.icon,
    value: item.value
  };

  if (existingItemIndex !== -1) {
    updatedInventory[existingItemIndex].quantity += gameItem.quantity;
  } else {
    updatedInventory.push(gameItem);
  }
  
  return {
    ...user,
    inventory: updatedInventory
  };
};

// Get rarity notification message
export const getRarityMessage = (item: GachaItem): string => {
  const rarityMessages: { [key: string]: string } = {
    common: `💋 카와이 아이템: ${item.name}`,
    rare: `💎 레어 아이템: ${item.name}!`,
    epic: `🔥 에픽 아이템: ${item.name}!!`,
    legendary: `👑 레전더리 아이템: ${item.name}!!!`,
    mythic: `🌟 미식 아이템: ${item.name}!!!!`
  };
  
  return rarityMessages[item.rarity] || rarityMessages['common'];
};

// Count rarities in items array
export const countRarities = (items: GachaItem[]): Record<string, number> => {
  return items.reduce((acc, item) => {
    acc[item.rarity] = (acc[item.rarity] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);
};

// Get ten pull notification message
export const getTenPullMessage = (items: GachaItem[]): string => {
  const rarityCounts = countRarities(items);
  const notificationParts = [];
  
  if (rarityCounts.mythic) notificationParts.push(`🌟미식 ${rarityCounts.mythic}개`);
  if (rarityCounts.legendary) notificationParts.push(`👑레전더리 ${rarityCounts.legendary}개`);
  if (rarityCounts.epic) notificationParts.push(`🔥에픽 ${rarityCounts.epic}개`);
  
  return `🎁 10연 뽑기 완료! ${notificationParts.length > 0 ? notificationParts.join(', ') : '새로운 아이템들을 획득했습니다!'}`;
};

// Get banner background style
export const getBannerStyle = (banner: GachaBanner, isSelected: boolean) => {
  const colorMaps: { [key: string]: string } = {
    'pink-400': '236, 72, 153, 0.3',
    'pink-500': '236, 72, 153, 0.4', 
    'pink-600': '219, 39, 119, 0.5',
    'purple-600': '147, 51, 234, 0.5',
    'red-500': '239, 68, 68, 0.4',
    'yellow-400': '250, 204, 21, 0.4'
  };

  const gradient = banner.bgGradient.replace(/from-|via-|to-/g, '').split(' ').map(color => {
    return colorMaps[color] || '255, 255, 255, 0.1';
  }).join(', ');

  return {
    background: `linear-gradient(135deg, ${gradient})`,
    border: isSelected ? '2px solid rgba(236, 72, 153, 1)' : '1px solid rgba(236, 72, 153, 0.3)'
  };
};

// Animation timing helpers
export const createAnimationSequence = async (steps: (() => Promise<void>)[]): Promise<void> => {
  for (const step of steps) {
    await step();
  }
};

// Sexiness level helpers
export const getSexinessLevel = (item: GachaItem): number => {
  return item.sexiness || 1;
};

export const getSexinessColor = (level: number): string => {
  const colors: { [key: number]: string } = {
    1: '#ec4899', // Pink
    2: '#8b5cf6', // Purple  
    3: '#f59e0b', // Orange
    4: '#ef4444', // Red
    5: '#22d3ee'  // Cyan
  };
  return colors[level] || colors[1];
};