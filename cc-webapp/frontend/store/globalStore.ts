/*
 * Global Store (Context + Reducer)
 * - 서버 권위 프로필/밸런스 상태 보관
 * - 최소 스키마만 우선 도입(추후 확장)
 */
"use client";

import React, { createContext, useContext, useMemo, useReducer } from "react";
import { api } from "@/lib/unifiedApi";

export type GlobalUserProfile = {
    id: string | number;
    nickname: string;
    goldBalance: number;
    gemsBalance?: number;
    level?: number;
    xp?: number;
    updatedAt?: string;
    [k: string]: unknown;
};

// 인벤토리 아이템(느슨한 스키마; 서버 권위와 실시간 동기화 전제)
export type InventoryItem = {
    id: string;
    name: string;
    type?: string;
    rarity?: string;
    quantity?: number;
    value?: number;
    icon?: string;
    [k: string]: unknown;
};

type BalanceSnapshot = { gold: number; gems?: number };
type StreakState = Record<string, { current: number; lastUpdated?: string }>;
type EventState = Record<string | number, { progress: Record<string, any>; completed?: boolean; lastUpdated?: string }>;
type NotificationItem = { id: string; type: string; message: string; at: string };

type GlobalState = {
    profile: GlobalUserProfile | null;
    hydrated: boolean;
    lastHydratedAt?: number;
    lastError?: string | null;
    // 게임별 통계(키: 게임 식별자)
    gameStats?: Record<string, any>;
    // 인벤토리(가벼운 캐시; 서버와 불일치 시 서버값 우선)
    inventory?: InventoryItem[];
    // 밸런스 스냅샷(권위 재동기화 용도)
    balances?: BalanceSnapshot;
    // streak/events/notifications 경량 상태
    streak?: StreakState;
    events?: EventState;
    notifications?: NotificationItem[];
};

type Actions =
    | { type: "SET_PROFILE"; profile: GlobalUserProfile | null }
    | { type: "SET_HYDRATED"; value: boolean }
    | { type: "SET_ERROR"; error: string | null }
    | { type: "PATCH_BALANCES"; delta: { gold?: number; gems?: number } }
    | { type: "MERGE_PROFILE"; patch: Partial<GlobalUserProfile> & Record<string, unknown> }
    | { type: "MERGE_GAME_STATS"; game: string; delta: Record<string, any> }
    | { type: "APPLY_PURCHASE"; items: InventoryItem[]; replace?: boolean }
    | { type: "APPLY_REWARD"; amount: number; currency?: 'gold' | 'gems' }
    | { type: "SET_STREAK"; key: string; current: number }
    | { type: "SET_EVENT"; id: string | number; progress: Record<string, any>; completed?: boolean }
    | { type: "PUSH_NOTIFICATION"; item: NotificationItem };

const initialState: GlobalState = {
    profile: null,
    hydrated: false,
    lastHydratedAt: undefined,
    lastError: null,
    gameStats: {},
    inventory: [],
    balances: { gold: 0, gems: 0 },
    streak: {},
    events: {},
    notifications: [],
};

function reducer(state: GlobalState, action: Actions): GlobalState {
    switch (action.type) {
        case "SET_PROFILE":
            return { ...state, profile: action.profile, hydrated: true, lastHydratedAt: Date.now() };
        case "SET_HYDRATED":
            return { ...state, hydrated: action.value, lastHydratedAt: action.value ? Date.now() : state.lastHydratedAt };
        case "SET_ERROR":
            return { ...state, lastError: action.error };
        case "PATCH_BALANCES": {
            if (!state.profile) return state;
            const gold = state.profile.goldBalance ?? 0;
            const gems = (state.profile as any).gemsBalance ?? 0;
            return {
                ...state,
                profile: {
                    ...state.profile,
                    goldBalance: gold + (action.delta.gold ?? 0),
                    gemsBalance: gems + (action.delta.gems ?? 0),
                } as GlobalUserProfile,
                balances: { gold: (gold + (action.delta.gold ?? 0)), gems: (gems + (action.delta.gems ?? 0)) },
            };
        }
        case "MERGE_PROFILE": {
            if (!state.profile) {
                // If profile isn't set yet, create one from patch minimally
                return { ...state, profile: { goldBalance: 0, nickname: "", id: "unknown", ...(action.patch as any) } };
            }
            return { ...state, profile: { ...state.profile, ...(action.patch as any) } as GlobalUserProfile };
        }
        case "MERGE_GAME_STATS": {
            const current = state.gameStats || {};
            const prev = (current[action.game] as any) || {};

            const deepMergeNumericAdd = (a: any, b: any): any => {
                if (Array.isArray(a) && Array.isArray(b)) return [...a, ...b];
                if (typeof a === "number" && typeof b === "number") return a + b;
                if (a === undefined) return b;
                if (b === undefined) return a;
                if (typeof a === "object" && typeof b === "object") {
                    const out: Record<string, any> = { ...a };
                    for (const k of Object.keys(b)) {
                        out[k] = deepMergeNumericAdd((a as any)[k], (b as any)[k]);
                    }
                    return out;
                }
                return b; // 다른 타입은 최근 delta로 덮기
            };

            const mergedForGame = deepMergeNumericAdd(prev, action.delta);
            return { ...state, gameStats: { ...current, [action.game]: mergedForGame } };
        }
        case "APPLY_PURCHASE": {
            const current = state.inventory || [];
            if (action.replace) {
                return { ...state, inventory: [...action.items] };
            }
            // 동일 id는 수량 합산(없으면 append)
            const byId: Record<string, InventoryItem> = {};
            for (const it of current) byId[it.id] = { ...it };
            for (const it of action.items) {
                const prev = byId[it.id];
                if (prev) {
                    byId[it.id] = {
                        ...prev,
                        ...it,
                        quantity: (prev.quantity ?? 0) + (it.quantity ?? 0),
                    };
                } else {
                    byId[it.id] = { ...it } as InventoryItem;
                }
            }
            return { ...state, inventory: Object.values(byId) };
        }
        case "APPLY_REWARD": {
            if (!state.profile) return state;
            const gold = state.profile.goldBalance ?? 0;
            const gems = (state.profile as any).gemsBalance ?? 0;
            const deltaGold = action.currency === 'gems' ? 0 : (action.amount || 0);
            const deltaGems = action.currency === 'gems' ? (action.amount || 0) : 0;
            return {
                ...state,
                profile: { ...state.profile, goldBalance: gold + deltaGold, gemsBalance: gems + deltaGems } as GlobalUserProfile,
                balances: { gold: gold + deltaGold, gems: gems + deltaGems },
            };
        }
        case "SET_STREAK": {
            const key = action.key;
            const cur = state.streak || {};
            return { ...state, streak: { ...cur, [key]: { current: action.current, lastUpdated: new Date().toISOString() } } };
        }
        case "SET_EVENT": {
            const cur = state.events || {};
            return { ...state, events: { ...cur, [action.id]: { progress: action.progress, completed: action.completed, lastUpdated: new Date().toISOString() } } };
        }
        case "PUSH_NOTIFICATION": {
            const list = state.notifications || [];
            return { ...state, notifications: [action.item, ...list].slice(0, 20) };
        }
        default:
            return state;
    }
}

type DispatchFn = (action: Actions) => void;
const StoreContext = createContext(null as unknown as { state: GlobalState; dispatch: DispatchFn } | null);

export function GlobalStoreProvider(props: { children?: React.ReactNode }) {
    const [state, dispatch] = useReducer(reducer, initialState);
    const value = useMemo(() => ({ state, dispatch }), [state]);
    return React.createElement((StoreContext as any).Provider, { value }, props.children as any);
}

export function useGlobalStore() {
    const ctx = useContext(StoreContext);
    if (!ctx) throw new Error("useGlobalStore must be used within GlobalStoreProvider");
    return ctx;
}

export function useGlobalProfile() {
    return useGlobalStore().state.profile;
}

export function useIsHydrated() {
    return useGlobalStore().state.hydrated;
}

// Action helpers
export function setProfile(dispatch: DispatchFn, profile: GlobalUserProfile | null) {
    dispatch({ type: "SET_PROFILE", profile });
}

export function setHydrated(dispatch: DispatchFn, value: boolean) {
    dispatch({ type: "SET_HYDRATED", value });
}

export function setError(dispatch: DispatchFn, error: string | null) {
    dispatch({ type: "SET_ERROR", error });
}

export function patchBalances(dispatch: DispatchFn, delta: { gold?: number; gems?: number }) {
    dispatch({ type: "PATCH_BALANCES", delta });
}

export function mergeProfile(dispatch: DispatchFn, patch: Partial<GlobalUserProfile> & Record<string, unknown>) {
    dispatch({ type: "MERGE_PROFILE", patch });
}

// 통계 병합(숫자는 누적, 배열은 concat, 객체는 재귀 병합)
export function mergeGameStats(dispatch: DispatchFn, game: string, delta: Record<string, any>) {
    dispatch({ type: "MERGE_GAME_STATS", game, delta });
}

// 인벤토리 적용(append 기본, replace=true 시 교체)
export function applyPurchase(dispatch: DispatchFn, items: InventoryItem[], options?: { replace?: boolean }) {
    dispatch({ type: "APPLY_PURCHASE", items, replace: options?.replace });
}

export function applyReward(dispatch: DispatchFn, amount: number, currency: 'gold' | 'gems' = 'gold') {
    dispatch({ type: "APPLY_REWARD", amount, currency });
}

// 서버 권위 재하이드레이트
export async function hydrateFromServer(dispatch: DispatchFn) {
    try {
        const [p, b] = await Promise.all([
            api.get<any>('auth/me'),
            api.get<any>('users/balance').catch(()=>null)
        ]);
        const gold = Number(b?.gold ?? b?.gold_balance ?? p?.gold ?? p?.gold_balance ?? 0);
        const gems = Number(b?.gems ?? b?.gems_balance ?? p?.gems ?? p?.gems_balance ?? 0);
        const mapped: GlobalUserProfile = {
            id: p?.id ?? p?.user_id ?? 'unknown',
            nickname: p?.nickname ?? '',
            goldBalance: Number.isFinite(gold) ? gold : 0,
            gemsBalance: Number.isFinite(gems) ? gems : 0,
            level: p?.level ?? p?.battlepass_level,
            xp: p?.xp,
            updatedAt: new Date().toISOString(),
            ...p,
        } as any;
        setProfile(dispatch, mapped);
        // balances snapshot
        dispatch({ type: 'PATCH_BALANCES', delta: { gold: 0, gems: 0 } });
        setError(dispatch, null);
    } catch (e:any) {
        setError(dispatch, e?.message || 'hydrate failed');
    } finally {
        setHydrated(dispatch, true);
    }
}

// 잔액 권위 재조정(GET /users/balance)
export async function reconcileBalance(dispatch: DispatchFn, current: { gold: number; gems?: number } ) {
    try {
        const b: any = await api.get('users/balance');
        const gold = Number(b?.gold ?? b?.gold_balance ?? b?.balance ?? 0);
        const gems = Number(b?.gems ?? b?.gems_balance ?? 0);
    const deltaGold = (gold - (current?.gold ?? 0));
    const deltaGems = (gems - (current?.gems ?? 0));
        if (deltaGold !== 0 || deltaGems !== 0) {
            patchBalances(dispatch, { gold: deltaGold, gems: deltaGems });
        }
        setError(dispatch, null);
    } catch (e:any) {
        setError(dispatch, e?.message || 'reconcile failed');
    }
}
