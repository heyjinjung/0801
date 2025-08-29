/*
 * Unified API Client
 * - 단일 BASE ORIGIN (NEXT_PUBLIC_API_ORIGIN)
 * - 모든 경로 인자는 '/api/' prefix 없이(ex: 'auth/login', 'events/123/claim')
 * - 자동 /api 접두사 부착
 * - 토큰 번들(storage: cc_auth_tokens via utils/tokenStorage.js)
 * - 401 -> refresh 1회 재시도, 실패 시 토큰 제거
 * - 재시도: 네트워크/일부 5xx/429 지수백오프 (기본 2회) 옵션화
 * - 개발 환경 로깅(console.groupCollapsed)
 */

import { getTokens, setTokens, clearTokens } from '../utils/tokenStorage';

// 간단 토큰 유무 확인 유틸
export function hasAccessToken(): boolean {
  try { return !!getTokens()?.access_token; } catch { return false; }
}

// Node 타입 미설치 환경 대비 간단 선언
// eslint-disable-next-line @typescript-eslint/no-unused-vars
declare const process: any;

export interface UnifiedRequestOptions<T=any> {
  method?: string;
  body?: any;
  auth?: boolean;            // 기본 true (false면 Authorization 미부착)
  retry?: number;            // 재시도 횟수 (기본 2)
  backoffBaseMs?: number;    // 초기 backoff (기본 300)
  headers?: Record<string,string>;
  signal?: AbortSignal;
  parseJson?: boolean;       // false면 text 그대로 반환
  transform?: (data:any)=>T; // 결과 후처리
  idem?: boolean;            // 쓰기 계열 요청시 멱등키 자동 주입 (기본 true)
}

const DEFAULT_RETRY_STATUS = new Set([408, 409, 429, 500, 502, 503, 504]);

function resolveOrigin(): string {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const penv: any = (typeof process !== 'undefined' ? (process as any).env : undefined);
  const envOrigin = penv?.NEXT_PUBLIC_API_ORIGIN;
  const envInternal = penv?.NEXT_PUBLIC_API_URL_INTERNAL;
  const isServer = typeof window === 'undefined';

  if (isServer) {
    if (envInternal && /^https?:\/\//.test(envInternal)) return envInternal.replace(/\/$/, '');
    if (envOrigin && /^https?:\/\//.test(envOrigin)) return envOrigin.replace(/\/$/, '');
    return 'http://backend:8000';
  }

  // Client-side: prefer internal URL when not on localhost (e.g., Docker/Playwright network)
  try {
    const host = window?.location?.hostname;
    const isLocal = host === 'localhost' || host === '127.0.0.1';
    if (!isLocal && envInternal && /^https?:\/\//.test(envInternal)) {
      return envInternal.replace(/\/$/, '');
    }
  } catch { /* noop */ }

  if (envOrigin && /^https?:\/\//.test(envOrigin)) return envOrigin.replace(/\/$/, '');
  const fallback = (window.location.port === '3000' || window.location.port === '3001') ? 'http://localhost:8000' : `${window.location.origin}`;
  if (!envOrigin) console.warn('[unifiedApi] NEXT_PUBLIC_API_ORIGIN 미설정 → fallback:', fallback);
  return fallback.replace(/\/$/, '');
}

const ORIGIN = resolveOrigin();
// 다른 모듈에서 재사용할 수 있도록 공개
export const API_ORIGIN = ORIGIN;

// 초기화 로그(실행 컨텍스트/빌드 ID 포함)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const __env: any = (typeof process !== 'undefined' ? (process as any).env : undefined) || {};
const __build = __env.NEXT_PUBLIC_BUILD_ID || 'dev';
const __ctx = (typeof window === 'undefined') ? 'SSR' : 'CSR';
console.log(`[unifiedApi] 초기화 - ctx=${__ctx} build=${__build} origin=${ORIGIN}`);

// 간단 UUIDv4 (라이브러리 무의존) - 멱등키 자동 주입용
function __uuidv4() {
  // eslint-disable-next-line no-bitwise
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

async function refreshOnce(): Promise<boolean> {
  try {
    const tokens = getTokens();
    if (!tokens?.refresh_token) return false;
    const res = await fetch(`${ORIGIN}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: tokens.refresh_token })
    });
    if (!res.ok) return false;
    const data = await res.json().catch(()=>null);
    if (data?.access_token) {
      setTokens({ access_token: data.access_token, refresh_token: data.refresh_token || tokens.refresh_token });
      return true;
    }
    return false;
  } catch (e) {
    return false;
  }
}

export async function apiCall<T=any>(path: string, opts: UnifiedRequestOptions<T> = {}): Promise<T> {
  const {
    method = 'GET',
    body,
    auth = true,
    retry = 2,
    backoffBaseMs = 300,
    headers = {},
    signal,
    parseJson = true,
  transform,
  idem = true,
  } = opts;

  if (path.startsWith('/')) path = path.slice(1); // normalize
  // Use same-origin relative path in the browser (Next.js rewrites to backend),
  // and absolute origin on the server (SSR, API routes, etc.)
  const isBrowser = typeof window !== 'undefined';
  const url = isBrowser ? `/api/${path}` : `${ORIGIN}/api/${path}`;

  let attempt = 0;
  let didRefresh = false;

  while (true) {
    const tokens = getTokens();
    const finalHeaders: Record<string,string> = {
      'Accept': 'application/json',
      ...headers,
    };
    if (auth && tokens?.access_token) {
      finalHeaders['Authorization'] = `Bearer ${tokens.access_token}`;
    }
    if (body && !(body instanceof FormData)) {
      finalHeaders['Content-Type'] = finalHeaders['Content-Type'] || 'application/json';
    }

    // 멱등키 자동 주입: 쓰기 계열(POST/PUT/PATCH/DELETE)이고, 헤더에 없으면 생성
    const m = method.toUpperCase();
  if (idem !== false && m !== 'GET' && !finalHeaders['X-Idempotency-Key']) {
      finalHeaders['X-Idempotency-Key'] = __uuidv4();
    }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const devLog = (typeof process !== 'undefined' ? (process as any).env?.NODE_ENV : 'development') !== 'production';
    if (devLog && attempt === 0) {
      console.groupCollapsed(`[unifiedApi] ${method} ${url}`);
      console.log('opts', { method, body, auth, retry });
      console.log('headers', finalHeaders);
      console.groupEnd();
    }

    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers: finalHeaders,
        body: body ? (body instanceof FormData ? body : JSON.stringify(body)) : undefined,
        signal,
        credentials: 'include',
      });
    } catch (networkErr:any) {
      if (attempt < retry) {
        const delay = backoffBaseMs * Math.pow(2, attempt);
        await new Promise(r=>setTimeout(r, delay));
        attempt++; continue;
      }
      throw networkErr;
    }

    if (response.status === 401 && auth && !didRefresh) {
      const refreshed = await refreshOnce();
      didRefresh = true;
      if (refreshed) { attempt++; continue; }
      clearTokens();
    }

    if (!response.ok) {
      if (attempt < retry && DEFAULT_RETRY_STATUS.has(response.status)) {
        const delay = backoffBaseMs * Math.pow(2, attempt);
        await new Promise(r=>setTimeout(r, delay));
        attempt++; continue;
      }
      const errText = await response.text().catch(()=>`HTTP ${response.status}`);
      console.error(`[unifiedApi] API 오류 - ${response.status} ${response.statusText}:`, errText);
      throw new Error(`[unifiedApi] ${response.status} ${errText}`);
    }

    if (!parseJson) {
      // @ts-ignore
      return (await response.text()) as T;
    }
    const json = await response.json().catch(()=>null);
    // @ts-ignore
    return transform ? transform(json) : json;
  }
}

// 편의 메서드
export const api = {
  get: <T=any>(p:string, o:UnifiedRequestOptions<T>={}) => apiCall<T>(p, { ...o, method: 'GET' }),
  post:<T=any>(p:string, body?:any, o:UnifiedRequestOptions<T>={}) => apiCall<T>(p, { ...o, method:'POST', body }),
  put: <T=any>(p:string, body?:any, o:UnifiedRequestOptions<T>={}) => apiCall<T>(p, { ...o, method:'PUT', body }),
  del: <T=any>(p:string, o:UnifiedRequestOptions<T>={}) => apiCall<T>(p, { ...o, method:'DELETE' }),
};

// 대시보드 전용 shorthand (미사용이면 제거 가능)
export const dashboardApi = {
  fetch: () => api.get('dashboard'),
};
