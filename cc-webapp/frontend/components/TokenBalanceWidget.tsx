'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { TrendingUp, TrendingDown, Coins, AlertTriangle, History } from 'lucide-react';
import useBalanceSync from '@/hooks/useBalanceSync';
import { useUserGold } from '@/hooks/useSelectors';
import { useRealtimeRewards, useRealtimePurchases } from '@/hooks/useRealtimeData';

interface TokenBalanceProps {
  amount: number;
  status?: 'normal' | 'warning' | 'critical';
  change?: 'none' | 'increase' | 'decrease';
  className?: string;
  // 선택: 공용 상태와 동기화하고 싶을 때 전달
  sharedUser?: { goldBalance?: number } | null;
  onUpdateUser?: (next: any) => void;
  onAddNotification?: (msg: string) => void;
}

export function TokenBalanceWidget({ 
  amount, 
  status = 'normal', 
  change = 'none',
  className = '',
  sharedUser,
  onUpdateUser,
  onAddNotification,
}: TokenBalanceProps) {
  const { reconcileBalance } = useBalanceSync({ sharedUser, onUpdateUser, onAddNotification });
  // 마운트 시 1회 권위 동기화(옵션: sharedUser 전달된 경우에만)
  useEffect(() => {
    if (sharedUser && onUpdateUser) {
      reconcileBalance().catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const formatAmount = (num: number) => {
    if (num >= 1000000) {
      return (num / 1000000).toFixed(1) + 'M';
    }
    if (num >= 1000) {
      return (num / 1000).toFixed(1) + 'K';
    }
    return num.toLocaleString();
  };

  const getStatusColor = () => {
    switch (status) {
      case 'warning':
        return {
          bg: 'bg-amber-500/10',
          border: 'border-amber-500/30',
          text: 'text-amber-400',
          glow: 'shadow-amber-500/20'
        };
      case 'critical':
        return {
          bg: 'bg-red-500/10',
          border: 'border-red-500/30',
          text: 'text-red-400',
          glow: 'shadow-red-500/20'
        };
      default:
        return {
          bg: 'bg-emerald-500/10',
          border: 'border-emerald-500/30',
          text: 'text-emerald-400',
          glow: 'shadow-emerald-500/20'
        };
    }
  };

  const getChangeIcon = () => {
    switch (change) {
      case 'increase':
        return <TrendingUp className="w-4 h-4 text-emerald-400" />;
      case 'decrease':
        return <TrendingDown className="w-4 h-4 text-red-400" />;
      default:
        return null;
    }
  };

  const getStatusIcon = () => {
    switch (status) {
      case 'warning':
      case 'critical':
        return <AlertTriangle className="w-5 h-5" />;
      default:
        return <Coins className="w-5 h-5" />;
    }
  };

  const colors = getStatusColor();
  const changeIcon = getChangeIcon();
  const statusIcon = getStatusIcon();

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className={`relative overflow-hidden ${className}`}
    >
      {/* Glassmorphism Background */}
      <div className={`
        relative backdrop-blur-xl bg-slate-900/80 
        border ${colors.border} rounded-2xl p-6
        shadow-xl ${colors.glow}
        before:absolute before:inset-0 before:rounded-2xl
        before:bg-gradient-to-br before:from-white/5 before:to-transparent
        before:pointer-events-none
      `}>
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <motion.div
              animate={{ rotate: change === 'increase' ? 360 : 0 }}
              transition={{ duration: 0.8, ease: "easeInOut" }}
              className={`p-2 rounded-lg ${colors.bg} ${colors.text}`}
            >
              {statusIcon}
            </motion.div>
            <div>
              <h3 className="text-slate-100 font-medium">Token Balance</h3>
              <p className="text-slate-400 text-sm">Available Tokens</p>
            </div>
          </div>
          
          {changeIcon && (
            <motion.div
              initial={{ scale: 0 }}
              animate={{ scale: 1 }}
              transition={{ delay: 0.3, type: "spring", stiffness: 200 }}
            >
              {changeIcon}
            </motion.div>
          )}
        </div>

        {/* Balance Amount */}
        <motion.div
          key={amount}
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.6, type: "spring", stiffness: 100 }}
          className="mb-4"
        >
          <div className={`text-4xl md:text-5xl font-bold ${colors.text} mb-1`}>
            {formatAmount(amount)}
          </div>
          <div className="text-slate-400 text-sm">
            {amount.toLocaleString()} tokens
          </div>
        </motion.div>

        {/* Status Bar */}
        <div className="relative h-2 bg-slate-800 rounded-full overflow-hidden">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${status === 'critical' ? 20 : status === 'warning' ? 60 : 100}%` }}
            transition={{ duration: 1, delay: 0.5 }}
            className={`h-full rounded-full ${
              status === 'critical' ? 'bg-red-500' :
              status === 'warning' ? 'bg-amber-500' : 
              'bg-emerald-500'
            }`}
          />
        </div>

        {/* Status Message */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1 }}
          className="mt-4 text-sm text-slate-400"
        >
          {status === 'critical' && 'Critical: Token balance is very low'}
          {status === 'warning' && 'Warning: Token balance is running low'}
          {status === 'normal' && 'Balance is healthy'}
        </motion.div>

        {/* Animated Background Elements */}
        <div className="absolute -top-4 -right-4 w-24 h-24 bg-gradient-to-br from-blue-500/10 to-purple-500/10 rounded-full blur-xl" />
        <div className="absolute -bottom-4 -left-4 w-32 h-32 bg-gradient-to-tr from-emerald-500/10 to-cyan-500/10 rounded-full blur-xl" />
      </div>
    </motion.div>
  );
}

// ------------------------------------------------------------
// Quick variant: 전역 store 잔액 표시 + 클릭 시 최근 변경 이력 모달
// ------------------------------------------------------------
// (상단으로 이동된 import 들)

export function TokenBalanceQuick() {
  const gold = useUserGold();
  const { recentRewards } = useRealtimeRewards();
  const { recentPurchases } = useRealtimePurchases();
  const [open, setOpen] = useState(false);

  type ChangeItem = { id: string; type: 'reward' | 'purchase'; amount: number; at: string; label: string };
  const changes: ChangeItem[] = useMemo(() => {
    const rewardItems = (recentRewards || []).map((r: any) => {
      const data = r?.reward_data || {};
      const amount = (typeof data.awarded_gold === 'number' && data.awarded_gold)
        || (typeof data.gold === 'number' && data.gold)
        || (typeof data.amount === 'number' && data.amount)
        || 0;
      return {
        id: `reward:${r.id}`,
        type: 'reward' as const,
        amount,
        at: r.timestamp,
        label: r.reward_type || 'reward',
      };
    });

    const purchaseItems = (recentPurchases || []).map((p: any) => ({
      id: `purchase:${p.id}`,
      type: 'purchase' as const,
      amount: typeof p.amount === 'number' ? -Math.abs(p.amount) : 0,
      at: p.timestamp,
      label: `${p.product_id || 'product'} (${p.status})`,
    }));

    const merged = [...rewardItems, ...purchaseItems];
    merged.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
    return merged.slice(0, 15);
  }, [recentRewards, recentPurchases]);

  return (
    <div className="inline-flex items-center gap-2">
  {/* E2E helper: expose current gold text in DOM even when dropdown is closed */}
  <span data-testid="gold-balance-sr" className="sr-only">{gold.toLocaleString()}G</span>
      <button
        type="button"
        className="flex items-center gap-1 px-2 py-1 rounded bg-gradient-gold text-black text-xs font-bold shadow hover:opacity-90"
        onClick={() => setOpen(true)}
        aria-label="잔액 상세 보기"
      >
        <Coins className="w-4 h-4" />
  <span data-testid="gold-balance">{gold.toLocaleString()}G</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70"
          role="dialog"
          aria-modal="true"
        >
          <div className="w-[92vw] max-w-md rounded-lg bg-zinc-900 border border-zinc-700 shadow-xl">
            <div className="flex items-center justify-between p-3 border-b border-zinc-700">
              <div className="flex items-center gap-2 font-semibold text-sm text-white">
                <History className="w-4 h-4" />
                최근 변경 이력
              </div>
              <button
                className="text-zinc-300 hover:text-white text-sm"
                onClick={() => setOpen(false)}
                aria-label="닫기"
              >
                닫기
              </button>
            </div>
            <div className="max-h-[70vh] overflow-y-auto p-3">
              {changes.length === 0 && (
                <div className="text-zinc-400 text-sm">최근 변경 이력이 없습니다.</div>
              )}
              {changes.length > 0 && (
                <ul className="space-y-2">
                  {changes.map((c: ChangeItem) => (
                    <li
                      key={c.id}
                      className="flex items-center justify-between rounded bg-zinc-800 border border-zinc-700 px-3 py-2"
                    >
                      <div className="text-xs text-zinc-200">
                        <div className="font-medium">
                          {c.type === 'reward' ? '보상' : '구매'} • {c.label}
                        </div>
                        <div className="text-[11px] opacity-70">
                          {new Date(c.at).toLocaleString()}
                        </div>
                      </div>
                      <div
                        className={`text-sm font-bold ${
                          c.amount >= 0 ? 'text-emerald-400' : 'text-red-400'
                        }`}
                      >
                        {c.amount >= 0 ? `+${c.amount}` : `${c.amount}`}G
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}