import type { Metadata } from "next";
import Script from 'next/script';
import { Inter } from 'next/font/google';
import '../styles/globals.css';
import { Providers } from './providers';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Casino-Club F2P',
  description: 'Welcome to Casino-Club F2P!',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body className={inter.className}>
        {/* E2E event bridge: buffer test events fired before providers mount, then flush */}
        <Script id="e2e-event-bridge" strategy="beforeInteractive">{`
          (function(){
            if (typeof window === 'undefined') return;
            try {
              var types = [
                'realtime:test-catalog-update',
                'realtime:test-purchase-update',
                'realtime:test-user-action',
                'realtime:test-profile-update',
                'app:notification'
              ];
              // readiness flag and queue
              window.__e2eListenersReady = false;
              window.__e2eQueue = [];
              function capture(type){
                return function(ev){
                  try {
                    if (window.__e2eListenersReady) return;
                    var detail = ev && ev.detail;
                    window.__e2eQueue.push({ type: type, detail: detail });
                    if (ev && typeof ev.stopImmediatePropagation === 'function') ev.stopImmediatePropagation();
                    if (ev && typeof ev.stopPropagation === 'function') ev.stopPropagation();
                    if (ev && typeof ev.preventDefault === 'function') ev.preventDefault();
                  } catch(e) { /* ignore */ }
                };
              }
              types.forEach(function(t){
                try { window.addEventListener(t, capture(t), { capture: true }); } catch(e) {}
              });
              window.__flushE2EEvents = function(){
                try {
                  var q = Array.isArray(window.__e2eQueue) ? window.__e2eQueue.slice() : [];
                  window.__e2eQueue.length = 0;
                  setTimeout(function(){
                    q.forEach(function(it){
                      try { window.dispatchEvent(new CustomEvent(it.type, { detail: it.detail })); } catch(e) {}
                    });
                  }, 0);
                } catch(e) { /* ignore */ }
              };
            } catch(e) { /* noop */ }
          })();
        `}</Script>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
