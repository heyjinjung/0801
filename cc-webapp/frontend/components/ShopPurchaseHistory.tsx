"use client";

import React from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, XCircle, Clock, RefreshCw } from 'lucide-react';
import { useRealtimePurchases } from '@/hooks/useRealtimeData';
import { Card } from './ui/card';
import { Badge } from './ui/badge';

function StatusIcon({ status }: { status: 'pending'|'success'|'failed'|'idempotent_reuse' }) {
  const cls = 'w-4 h-4';
  if (status === 'success') return <CheckCircle2 className={`${cls} text-success`} />;
  if (status === 'failed') return <XCircle className={`${cls} text-error`} />;
  if (status === 'idempotent_reuse') return <RefreshCw className={`${cls} text-info`} />;
  return <Clock className={`${cls} text-warning`} />;
}

function StatusBadge({ status }: { status: 'pending'|'success'|'failed'|'idempotent_reuse' }) {
  const map: Record<string, { label: string; className: string }> = {
    pending: { label: '진행중', className: 'bg-warning text-black' },
    success: { label: '완료', className: 'bg-success text-white' },
    failed: { label: '실패', className: 'bg-error text-white' },
    idempotent_reuse: { label: '중복처리', className: 'bg-info text-white' },
  };
  const m = map[status];
  return <Badge className={`glass-metal ${m.className} px-2 py-0.5 text-xs`}>{m.label}</Badge>;
}

export default function ShopPurchaseHistory() {
  const { recentPurchases, hasHistory } = useRealtimePurchases();

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.2 }}
      className="mt-10"
    >
      <Card className="glass-metal p-6 border-primary/20">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-gradient-primary">최근 거래 히스토리</h3>
          <Badge variant="secondary" className="glass-metal">
            {recentPurchases.length}건
          </Badge>
        </div>

        {!hasHistory ? (
          <div className="text-center text-muted-foreground py-8">
            최근 거래 내역이 없습니다.
          </div>
        ) : (
          <div className="space-y-3 max-h-80 overflow-auto pr-1">
            {recentPurchases.map((p) => (
              <div key={`${p.id}-${p.status}`} className="flex items-center justify-between rounded-lg border border-border/30 p-3 glass-metal-hover">
                <div className="flex items-center gap-3">
                  <StatusIcon status={p.status} />
                  <div>
                    <div className="text-sm font-semibold">
                      {p.product_id ? `상품 ${p.product_id}` : '구매'}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {new Date(p.timestamp).toLocaleString()}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {typeof p.amount === 'number' && (
                    <div className="text-xs text-muted-foreground">{p.amount}원</div>
                  )}
                  <StatusBadge status={p.status} />
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>
    </motion.div>
  );
}
