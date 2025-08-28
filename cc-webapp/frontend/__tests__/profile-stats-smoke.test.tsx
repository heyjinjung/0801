// @ts-nocheck
/// <reference types="jest" />
import type {} from 'jest';
import React from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import ProfileStats from '@/components/profile/ProfileStats';

// mock unifiedApi get
jest.mock('@/lib/unifiedApi', () => ({
  api: {
    get: jest.fn(async (path: string) => {
      if (path === 'games/stats/me') {
        return { total_games_played: 3, total_wins: 1 };
      }
      return {};
    }),
  },
}));

// mock realtime context hook used by useRealtimeStats
jest.mock('@/hooks/useRealtimeData', () => ({
  useRealtimeStats: () => ({
    allStats: { slot: { game_type: 'slot', data: { total_games_played: 3, total_wins: 1 } } },
  }),
}));

describe('ProfileStats - UI 스모크', () => {
  it('총 플레이/승리 및 승률 표시', async () => {
    render(<ProfileStats />);
    expect(await screen.findByText('총 플레이')).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByText('3')).toBeInTheDocument();
      expect(screen.getByText('1')).toBeInTheDocument();
      expect(screen.getByText(/승률/i)).toBeInTheDocument();
    });
  });
});
