"use client";
import React, { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';

type Toast = {
  id: string;
  message: string;
  type?: string;
};

type ToastContextValue = {
  push: (message: string, type?: string) => void;
};

const ToastContext = createContext(null as unknown as ToastContextValue);

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within <ToastProvider>');
  return ctx;
}

type Settings = {
  toastEnabled: boolean;
  types: { [k: string]: boolean };
  sound: boolean;
  dnd: { enabled: boolean; start: string; end: string };
};

const DEFAULTS: Settings = {
  toastEnabled: true,
  types: { reward: true, event: true, system: true, shop: true },
  sound: false,
  dnd: { enabled: false, start: '22:00', end: '07:00' },
};

const LS_KEY = 'app.notification.settings.v1';

type ToastProviderProps = { children?: React.ReactNode };
export function ToastProvider(props: ToastProviderProps) {
  const { children } = props;
  const [toasts, setToasts] = useState([] as Toast[]);
  const lastKeyRef = useRef(null as string | null);
  const lastAtRef = useRef(0 as number);
  const settingsRef = useRef(DEFAULTS as Settings);
  // Settings are local-only for now; no server calls

  // 설정 로딩: 로컬 스토리지만 사용 (서버 /settings 제거 → 404 소음 방지)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (raw) {
        const parsed = { ...DEFAULTS, ...JSON.parse(raw) } as Settings;
        settingsRef.current = parsed;
      }
      // In E2E, force-enable toasts and disable DND to prevent accidental suppression
      if (typeof navigator !== 'undefined' && (navigator as any).webdriver) {
        settingsRef.current.toastEnabled = true;
        settingsRef.current.dnd = { enabled: false, start: '00:00', end: '00:00' };
        settingsRef.current.types = {
          ...settingsRef.current.types,
          success: true,
          error: true,
          shop: true,
          system: true,
        } as any;
      }
    } catch {
      // ignore
    }
  }, []);

  const isDndActive = (s: Settings, nowDate: Date) => {
    if (!s?.dnd?.enabled) return false;
    const [sh, sm] = (s.dnd.start || '22:00').split(':').map((x: string) => parseInt(x, 10) || 0);
    const [eh, em] = (s.dnd.end || '07:00').split(':').map((x: string) => parseInt(x, 10) || 0);
    const now = nowDate.getHours() * 60 + nowDate.getMinutes();
    const startMin = sh * 60 + sm;
    const endMin = eh * 60 + em;
    if (startMin <= endMin) {
      return now >= startMin && now < endMin;
    }
    // 자정 넘어가는 구간
    return now >= startMin || now < endMin;
  };

  const push = useCallback((message: string, type?: string) => {
    const s = settingsRef.current;
    if (!s.toastEnabled) return;
    const t = (type || 'info').toLowerCase();
    if (s.types && t in s.types && s.types[t] === false) return;
    if (isDndActive(s, new Date())) return;

    const key = `${type ?? 'info'}:${message}`;
    const now = Date.now();
    // 간단 중복/폭주 방지: 같은 키 1.5초 이내 무시
    if (lastKeyRef.current === key && now - lastAtRef.current < 1500) return;
    lastKeyRef.current = key;
    lastAtRef.current = now;
    const id = `${now}-${Math.random().toString(36).slice(2, 8)}`;
    setToasts((prev: Toast[]) => [{ id, message, type }, ...prev].slice(0, 4));
    setTimeout(() => setToasts((prev: Toast[]) => prev.filter((t: Toast) => t.id !== id)), 3500);
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<any>).detail ?? {};
      const type = typeof detail === 'object' && 'type' in detail ? (detail as any).type : 'info';
      const msg =
        typeof detail === 'object' && 'payload' in detail
          ? JSON.stringify((detail as any).payload)
          : String(detail ?? '');
      push(msg, type);
    };
    window.addEventListener('app:notification', handler as EventListener);
    return () => window.removeEventListener('app:notification', handler as EventListener);
  }, [push]);

  return (
    <ToastContext.Provider value={{ push }}>
      {children}
      {/* 컨테이너 */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2">
        {toasts.map((t: Toast) => (
          <div
            key={t.id}
            className={`min-w-[220px] max-w-[360px] rounded border px-3 py-2 text-sm shadow-md ${
              t.type === 'error'
                ? 'bg-red-900/70 border-red-500/50 text-white'
                : t.type === 'success'
                  ? 'bg-emerald-900/70 border-emerald-500/50 text-white'
                  : 'bg-zinc-900/70 border-zinc-600/50 text-white'
            }`}
          >
            <div className="font-medium capitalize opacity-80">{t.type ?? 'info'}</div>
            <div className="break-words text-xs opacity-90">{t.message}</div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export default ToastProvider;
