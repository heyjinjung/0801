// @ts-nocheck
import { renderHook, act } from '@testing-library/react';
import useRecentActions from '@/hooks/useRecentActions';

jest.mock('@/lib/unifiedApi', () => ({
  api: {
    get: jest.fn(async (path) => {
      // first page with cursor
      if (path.includes('mode=cursor') && !path.includes('cursor=')) {
        return {
          items: [
            { id: 3, user_id: 1, action_type: 'A', created_at: new Date().toISOString(), action_data: {} },
            { id: 2, user_id: 1, action_type: 'B', created_at: new Date().toISOString(), action_data: {} },
          ],
          next_cursor: 'abc',
        };
      }
      // second page
      if (path.includes('mode=cursor') && path.includes('cursor=abc')) {
        return {
          items: [
            { id: 1, user_id: 1, action_type: 'C', created_at: new Date().toISOString(), action_data: {} },
          ],
          next_cursor: null,
        };
      }
      return [];
    }),
  },
}));

jest.mock('@/store/globalStore', () => ({
  useGlobalProfile: () => ({ id: 1, nickname: 'tester' }),
}));

describe('useRecentActions - cursor mode', () => {
  it('loads pages and merges items with hasMore false at end', async () => {
    const { result } = renderHook(() => useRecentActions(1, 2, true));
    // wait for first load
    await act(async () => {
      await result.current.reload();
    });

    expect(result.current.actions?.length).toBe(2);
    expect(result.current.hasMore).toBe(true);

    await act(async () => {
      await result.current.loadMore();
    });

    expect(result.current.actions?.length).toBe(3);
    expect(result.current.hasMore).toBe(false);
  });
});
