// @ts-nocheck
/// <reference types="jest" />
import type {} from 'jest';
import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { RealtimeSyncProvider } from '@/contexts/RealtimeSyncContext';
import ActionHistory from '@/components/profile/ActionHistory';
import { GlobalStoreProvider } from '@/store/globalStore';

// mock unifiedApi used by useRecentActions
jest.mock('@/lib/unifiedApi', () => ({
  api: {
    get: jest.fn(async (path: string) => {
      if (path.startsWith('actions/recent/')) {
        return [
          {
            id: 1,
            user_id: 1,
            action_type: 'LOGIN',
            created_at: new Date().toISOString(),
            action_data: { ip: '127.0.0.1' },
          },
          {
            id: 2,
            user_id: 1,
            action_type: 'PLAY_SLOT',
            created_at: new Date().toISOString(),
            action_data: { bet: 10 },
          },
        ];
      }
      if (path === 'auth/me') return { id: 1, nickname: 'tester' };
      if (path === 'users/balance') return { gold: 1000 };
      return {};
    }),
  },
}));

// mock global store profile selector so userId resolves to 1
jest.mock('@/store/globalStore', () => ({
  GlobalStoreProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useGlobalProfile: () => ({ id: 1, nickname: 'tester' }),
}));

function WithStore({ children }: { children: React.ReactNode }) {
  return <GlobalStoreProvider>{children}</GlobalStoreProvider>;
}

describe('ActionHistory - UI 스모크', () => {
  it('최근 활동 리스트와 더 보기 버튼', async () => {
    render(
      <WithStore>
        <RealtimeSyncProvider>
          <ActionHistory />
        </RealtimeSyncProvider>
      </WithStore>
    );

    // 목록 표시(첫 항목 텍스트 기준)
    await waitFor(() => expect(screen.getByText('LOGIN')).toBeInTheDocument());

    // 더 보기 클릭(단순 증가, 에러 없어야 함)
    fireEvent.click(screen.getByLabelText('action-history-load-more'));
  });
});
