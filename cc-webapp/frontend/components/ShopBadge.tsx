'use client';

import React from 'react';
import { ShoppingCart } from 'lucide-react';
import { useRealtimeSync } from '@/contexts/RealtimeSyncContext';

/**
 * ShopBadge
 * - RealtimeSyncContext의 purchase.pending_count를 표시하는 경량 배지
 * - count > 0 일 때만 숫자 뱃지를 표기, 0이면 아이콘만 표시
 */
export default function ShopBadge() {
  const { state } = useRealtimeSync();
  const count = state?.purchase?.pending_count ?? 0;

  return (
    <div className="relative inline-flex items-center">
      <ShoppingCart className="w-5 h-5 text-white" />
      {count > 0 && (
        <span
          aria-label={`pending purchases: ${count}`}
          className="absolute -top-2 -right-2 min-w-[18px] h-[18px] px-1 bg-error text-white text-[10px] font-bold rounded-full flex items-center justify-center shadow-md"
        >
          {count > 9 ? '9+' : count}
        </span>
      )}
    </div>
  );
}
