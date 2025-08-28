import React from 'react';
import { render, screen } from '@testing-library/react';
import ShopBadge from '@/components/ShopBadge';

// Mock RealtimeSync hook to control pending_count
jest.mock('@/contexts/RealtimeSyncContext', () => {
  let pending = 0;
  return {
    // Helper to mutate from tests
    __setPending(n: number) {
      pending = n;
    },
    useRealtimeSync() {
      return {
        state: {
          purchase: { pending_count: pending },
        },
      } as any;
    },
  };
});

// Type-safe import after mock definition
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { __setPending } = require('@/contexts/RealtimeSyncContext');

describe('ShopBadge', () => {
  it('renders icon without count when pending_count is 0', () => {
    __setPending(0);
    render(<ShopBadge />);

    // No aria-label bubble when 0
    expect(screen.queryByLabelText(/pending purchases/i)).toBeNull();
  });

  it('shows count bubble when pending_count > 0', () => {
    __setPending(3);
    render(<ShopBadge />);

    expect(screen.getByLabelText('pending purchases: 3')).toBeInTheDocument();
  });
});
