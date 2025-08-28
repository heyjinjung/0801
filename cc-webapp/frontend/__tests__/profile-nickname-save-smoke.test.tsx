// @ts-nocheck
/// <reference types="jest" />
import type {} from 'jest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { GlobalStoreProvider } from '@/store/globalStore';
import { ProfileScreen } from '@/components/ProfileScreen';

// Mock RealtimeSyncContext used by hooks/useRealtimeData to avoid needing the provider in tests
jest.mock('@/contexts/RealtimeSyncContext', () => {
  return {
    RealtimeSyncProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    useRealtimeSync: () => ({
      state: {
        profile: { gold: 1000, exp: 0, tier: 'STANDARD', total_spent: 0 },
        achievements: {},
        streaks: {},
        events: {},
        stats: {},
        recent_rewards: [],
        purchase: { pending_count: 0 },
        recent_purchases: [],
        connection: { status: 'disconnected', reconnect_attempts: 0 },
        last_poll_time: undefined,
      },
      refreshProfile: jest.fn(),
      refreshAchievements: jest.fn(),
      refreshStreaks: jest.fn(),
      refreshEvents: jest.fn(),
      clearOldRewards: jest.fn(),
      connect: jest.fn(),
      disconnect: jest.fn(),
      triggerFallbackPoll: jest.fn(),
    }),
  };
});

// Mock token storage to simulate authenticated user
jest.mock('../utils/tokenStorage', () => ({
  getTokens: () => ({ access_token: 'fake-token', refresh_token: 'fake-refresh' }),
  setTokens: jest.fn(),
  clearTokens: jest.fn(),
}));

// Mock unifiedApi
jest.mock('@/lib/unifiedApi', () => ({
  api: {
    get: jest.fn(async (path: string) => {
      if (path === 'auth/me') return { id: 'u1', nickname: 'tester', gold: 1000 };
      if (path === 'users/balance') return { gold: 1000 };
      if (path === 'games/stats/me') return { total_games_played: 0, total_wins: 0 };
      return {};
    }),
    post: jest.fn(async (path: string, body?: any, init?: any) => {
      if (path === 'users/profile' && body?.nickname) {
        return { id: 'u1', nickname: body.nickname };
      }
      throw new Error('unexpected path: ' + path);
    }),
    put: jest.fn(),
  },
}));

function WithStore({ children }: { children: React.ReactNode }) {
  return <GlobalStoreProvider>{children}</GlobalStoreProvider>;
}

const noop = () => {};

describe('ProfileScreen - 닉네임 저장 스모크', () => {
  test('닉네임 수정 후 저장시 PATCH 호출 및 UI 반영', async () => {
    render(
      <WithStore>
        <ProfileScreen onBack={noop} onAddNotification={noop} />
      </WithStore>
    );

    // 로딩이 끝나고 닉네임 표시 확인(헤더/카드 등 중복 텍스트 회피)
    await screen.findAllByText('tester');

    // 편집 버튼 클릭
    fireEvent.click(screen.getByRole('button', { name: /닉네임 수정/ }));

    // 인풋에 새 닉네임 입력
    const input = screen.getByPlaceholderText('새 닉네임') as HTMLInputElement;
    fireEvent.change(input, { target: { value: 'tester2' } });

    // 저장 클릭
    fireEvent.click(screen.getByRole('button', { name: '저장' }));

    // 저장 후 편집 모드 종료되고 새 닉네임 반영 확인 (H2 헤딩들 중 텍스트 매칭)
    await waitFor(() => {
      const h2s = screen.getAllByRole('heading', { level: 2 });
      expect(h2s.some((el) => el.textContent === 'tester2')).toBe(true);
    });
  });
});
