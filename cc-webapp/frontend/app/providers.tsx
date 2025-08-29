'use client';

import React from 'react';
import { FeedbackProvider } from '../contexts/FeedbackContext';
import { GlobalStoreProvider } from '@/store/globalStore';
import { EnsureHydrated, RealtimeSyncProvider as RealtimeHydrateProvider } from '@/lib/sync';
import { RealtimeSyncProvider as RealtimeContextProvider } from '@/contexts/RealtimeSyncContext';
import { ToastProvider } from '@/components/NotificationToast';

// App-wide providers so every route (including /admin/*) has access to the global store and realtime sync
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <GlobalStoreProvider>
      <EnsureHydrated>
        <RealtimeHydrateProvider>
          <RealtimeContextProvider>
            <ToastProvider>
              <FeedbackProvider>
                {children}
                {/* Mark E2E listeners ready and flush queued events once all providers have mounted */}
                <script
                  dangerouslySetInnerHTML={{
                    __html: `try { window.__e2eListenersReady = true; if (typeof window.__flushE2EEvents === 'function') window.__flushE2EEvents(); } catch (e) { /* ignore */ }`,
                  }}
                />
              </FeedbackProvider>
            </ToastProvider>
          </RealtimeContextProvider>
        </RealtimeHydrateProvider>
      </EnsureHydrated>
    </GlobalStoreProvider>
  );
}
