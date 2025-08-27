"use client";

import { useEffect, useMemo, useState } from "react";
import { useGlobalStore, setHydrated } from "@/store/globalStore";
import { api } from "@/lib/unifiedApi";

export function useEnsureHydrated() {
    const { state, dispatch } = useGlobalStore();
    const [ready, setReady] = useState(false);

    useEffect(() => {
        let cancelled = false;

        async function run() {
            try {
                // 이미 하이드레이티드면 스킵
                if (state.hydrated && state.profile) {
                    setReady(true);
                    return;
                }
                const [p, b] = await Promise.all([
                    api.get<any>('auth/me').catch(() => null),
                    api.get<any>('users/balance').catch(() => null),
                ]);
                // 최소 필수 필드 확인 후 하이드레이트 플래그 ON
                if (!cancelled) {
                    setHydrated(dispatch, true);
                    setReady(true);
                }
            } catch {
                if (!cancelled) {
                    setHydrated(dispatch, true);
                    setReady(true);
                }
            }
        }

        run();
        return () => { cancelled = true; };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    return useMemo(() => ({ ready }), [ready]);
}
