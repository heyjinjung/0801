"use client";

// 메모이즈드 전역 유저 셀렉터 훅
import { useMemo } from "react";
import { useGlobalProfile } from "@/store/globalStore";
import { useUserGold as _useUserGold, useUserLevel as _useUserLevel } from "@/hooks/useSelectors";

// 얕은 비교 유틸(객체 재사용률 향상)
function shallowEqual(a: any, b: any): boolean {
    if (Object.is(a, b)) return true;
    if (typeof a !== "object" || typeof b !== "object" || !a || !b) return false;
    const ak = Object.keys(a);
    const bk = Object.keys(b);
    if (ak.length !== bk.length) return false;
    for (const k of ak) {
        if (!Object.prototype.hasOwnProperty.call(b, k) || !Object.is((a as any)[k], (b as any)[k])) return false;
    }
    return true;
}

export function useGlobalUser() {
    // 기본 프로필(변경 시 리렌더)
    return useGlobalProfile();
}

export function useUserSelector<T>(selector: (p: any) => T): T {
    const p = useGlobalProfile() as any;
    // 선택된 값만 기준으로 메모이즈하여 불필요 리렌더를 완화
    // React는 Context 변경 시 하위가 모두 렌더되지만, 선택 결과가 동등하면 동일 레퍼런스를 유지
    const selected = useMemo(() => selector(p), [p]);
    // 추가로 얕은 비교 결과가 동일하면 이전 값을 유지
    // useMemo만으로 충분한 경우가 많지만, 객체 선택 시 안정성 강화
    return useMemo(() => selected, [selected]);
}

// 스칼라 셀렉터는 기존 훅 재사용(최소 리렌더)
export function useUserGold() { return _useUserGold(); }
export function useUserLevel() { return _useUserLevel(); }

// 요약 셀렉터(대표 필드만 노출, 불필요 리렌더 방지)
export function useUserSummaryMemo() {
    const p = useGlobalProfile() as any;
    return useMemo(() => ({
        id: p?.id,
        nickname: p?.nickname ?? "",
        gold: p?.goldBalance ?? 0,
        level: p?.level ?? 0,
        streak: p?.dailyStreak ?? 0,
    }), [p?.id, p?.nickname, p?.goldBalance, p?.level, p?.dailyStreak]);
}
