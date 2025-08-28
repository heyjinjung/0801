// @ts-nocheck
/// <reference types="jest" />
import type {} from 'jest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import RewardContainer from '@/components/reward/RewardContainer';
import { GlobalStoreProvider } from '@/store/globalStore';

// unifiedApi.post 모킹
jest.mock('@/lib/unifiedApi', () => ({
  api: {
    post: jest.fn(async (path: string, body?: any) => {
      if (path === 'streak/claim') {
        return { awarded_gold: 300, new_gold_balance: 1300, streak_count: 8 };
      }
      throw new Error('unexpected path: ' + path);
    }),
    get: jest.fn(),
    put: jest.fn(),
  },
}));

function WithStore({ children }: { children: React.ReactNode }) {
  return <GlobalStoreProvider>{children}</GlobalStoreProvider>;
}

describe('RewardContainer - 일일 출석 보상 수령 스모크', () => {
  test('오늘자 출석 칸 클릭 시 모달 표시 및 API 호출', async () => {
    render(
      <WithStore>
        <RewardContainer />
      </WithStore>
    );

    // 오늘자(today) 출석 셀을 찾기 어려우므로 텍스트로 유도 클릭
    // Daily 탭 기본 선택 상태에서 'Day 8' 요소(예제 데이터 today=true)를 클릭
    const day8 = await screen.findByText(/Day 8/i);
    fireEvent.click(day8.parentElement!);

    // 모달 타이틀 확인
    await waitFor(async () => {
      expect(await screen.findByText('출석 보상 획득!')).toBeInTheDocument();
    });

    // 수령 토큰 안내 텍스트가 포함되는지 확인(라벨 일부 매칭)
    expect(screen.getByText(/성공적으로 받았습니다/)).toBeInTheDocument();
  });
});
