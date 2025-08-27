'use client';

import React, { MouseEventHandler, useMemo, useState } from 'react';
import { ShoppingCart } from 'lucide-react';
import { useGlobalStore } from '@/store/globalStore';

export default function ShopBadge() {
  const { state } = useGlobalStore();
  const [open, setOpen] = useState(false);
  type PurchaseNote = { id: string; type: string; status?: string; message?: string; product?: string; at?: string | number | Date };
  const { pendingCount, recent } = useMemo(() => {
    const list = (state.notifications || []) as PurchaseNote[];
    const purchase = list.filter((n: PurchaseNote) => n.type === 'purchase');
    const pending = purchase.filter((n: PurchaseNote) => n.status === 'pending').length;
    const recent = purchase.slice(0, 5);
    return { pendingCount: pending, recent };
  }, [state.notifications]);

  const display = pendingCount > 9 ? '9+' : String(pendingCount);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v: boolean) => !v)}
        className="relative inline-flex items-center justify-center w-10 h-10 rounded-full bg-card border border-border hover:bg-accent transition-colors"
        aria-label="구매 상태"
      >
        <ShoppingCart className="w-5 h-5" />
        {pendingCount > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-error text-[10px] text-white flex items-center justify-center">
            {display}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute right-0 mt-2 w-72 rounded-xl border border-border bg-popover shadow-lg z-20">
          <div className="p-3 border-b border-border text-sm font-semibold">최근 구매 알림</div>
          <ul className="max-h-72 overflow-auto">
            {recent.length === 0 ? (
              <li className="p-4 text-sm text-muted-foreground">알림이 없습니다.</li>
            ) : (
              recent.map((n: PurchaseNote) => (
                <li key={n.id} className="p-3 text-sm border-b border-border last:border-0">
                  <div className="flex items-center justify-between">
                    <span>{n.message}</span>
                    <span className={`text-xs ${n.status === 'failed' ? 'text-error' : n.status === 'pending' ? 'text-warning' : 'text-success'}`}>{n.status}</span>
                  </div>
                  {n.product && <div className="text-xs text-muted-foreground mt-1">상품: {n.product}</div>}
                  <div className="text-[10px] text-muted-foreground mt-1">{n.at ? new Date(n.at).toLocaleString() : ''}</div>
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
