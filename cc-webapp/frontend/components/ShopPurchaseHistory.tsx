"use client";

import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { CheckCircle2, XCircle, Clock, RefreshCw } from 'lucide-react';
import { useRealtimePurchases } from '@/hooks/useRealtimeData';
import { api } from '@/lib/unifiedApi';
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

type ServerTxn = { id?: string; receipt?: string; status: string; product_id?: string; amount?: number; timestamp?: string };

export default function ShopPurchaseHistory() {
  const { recentPurchases, hasHistory } = useRealtimePurchases();
  const [serverTxns, setServerTxns] = useState([] as ServerTxn[]);
  const [cursor, setCursor] = useState(undefined as string | undefined);
  const [loading, setLoading] = useState(false);

  const mergeByKey = (a: ServerTxn[], b: ServerTxn[]): ServerTxn[] => {
    const byKey: Record<string, ServerTxn> = {};
    const keyOf = (x: ServerTxn) => (x.receipt || x.id || `${x.product_id}-${x.timestamp}` || Math.random().toString(36));
    for (const it of [...a, ...b]) {
      const k = keyOf(it);
      // 최신 상태를 덮어쓰되, timestamp가 더 최신인 쪽 우선
      const prev = byKey[k];
      if (!prev) { byKey[k] = it; continue; }
      const t1 = new Date(prev.timestamp || 0).getTime();
      const t2 = new Date(it.timestamp || 0).getTime();
      byKey[k] = t2 >= t1 ? it : prev;
    }
    return Object.values(byKey).sort((x,y)=>new Date(y.timestamp||0).getTime()-new Date(x.timestamp||0).getTime());
  };

  const merged = useMemo(() => mergeByKey(serverTxns, recentPurchases as any), [serverTxns, recentPurchases]);

  const fetchPage = async (nextCursor?: string) => {
    setLoading(true);
    try {
      const res: any = await api.get('shop/transactions', { headers: nextCursor ? { 'X-Cursor': nextCursor } : undefined });
      const items: ServerTxn[] = Array.isArray(res?.items) ? res.items : (Array.isArray(res) ? res : []);
  setServerTxns((prev: ServerTxn[])=>mergeByKey(prev, items));
      if (res?.next_cursor) setCursor(res.next_cursor);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // 최초 1페이지 로드
    fetchPage().then(()=>{});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
            {merged.length}건
          </Badge>
        </div>

        {!hasHistory && merged.length===0 ? (
          <div className="text-center text-muted-foreground py-8">
            최근 거래 내역이 없습니다.
          </div>
        ) : (
          <div className="space-y-3 max-h-80 overflow-auto pr-1">
            {merged.map((p:any) => (
              <div key={`${p.receipt||p.id||p.timestamp}-${p.status}`} className="flex items-center justify-between rounded-lg border border-border/30 p-3 glass-metal-hover">
                <div className="flex items-center gap-3">
                  <StatusIcon status={p.status} />
                  <div>
                    <div className="text-sm font-semibold">
                      {p.product_id ? `상품 ${p.product_id}` : '구매'}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {p.timestamp ? new Date(p.timestamp).toLocaleString() : ''}
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
            {cursor && (
              <div className="pt-2">
                <button disabled={loading} onClick={()=>fetchPage(cursor)} className="text-xs text-primary hover:underline disabled:opacity-50">
                  {loading ? '로딩 중…' : '더 보기'}
                </button>
              </div>
            )}
          </div>
        )}
      </Card>
    </motion.div>
  );
}
