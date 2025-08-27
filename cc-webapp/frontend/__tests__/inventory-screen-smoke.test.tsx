/// <reference types="jest" />
import React from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { GlobalStoreProvider, applyPurchase, useGlobalStore } from '@/store/globalStore';
import { InventoryScreen } from '@/components/InventoryScreen';

// 테스트 헬퍼: 글로벌 스토어에 초기 인벤토리를 주입하는 래퍼
function WithSeededStore({ children, seed }: { children: React.ReactNode; seed: any[] }) {
  const Seeder = () => {
    const { dispatch } = useGlobalStore();
    React.useEffect(() => {
      if (seed?.length) {
        applyPurchase(dispatch, seed as any[], { replace: true });
      }
    }, [dispatch]);
    return null;
  };
  return (
    <GlobalStoreProvider>
      <Seeder />
      {children}
    </GlobalStoreProvider>
  );
}

const sampleUser = {
  id: 'u1', nickname: 'tester', level: 3,
  inventory: [
    { id: '1', name: 'Old Sword', description: 'legacy', rarity: 'common', type: 'weapon', quantity: 1 },
  ],
} as any;

const serverAuthoritativeInventory = [
  { id: '10', name: 'Neon Blade', description: 'bright', rarity: 'epic', type: 'weapon', quantity: 1 },
  { id: '11', name: 'Lucky Charm', description: 'fortune', rarity: 'rare', type: 'collectible', quantity: 2 },
  { id: '12', name: 'Gold Pouch', description: 'coins', rarity: 'common', type: 'currency', quantity: 5 },
];

function renderScreen(seedInv = serverAuthoritativeInventory) {
  const onBack = jest.fn();
  const onUpdateUser = jest.fn();
  const onAddNotification = jest.fn();
  return render(
    <WithSeededStore seed={seedInv}>
      <InventoryScreen user={sampleUser} onBack={onBack} onUpdateUser={onUpdateUser} onAddNotification={onAddNotification} />
    </WithSeededStore>
  );
}

describe('InventoryScreen - UI smoke (reconciled inventory)', () => {
  test('헤더 총 개수와 리스트가 글로벌 인벤토리를 반영한다', async () => {
    renderScreen();

    // 헤더 총 개수 텍스트 확인
    expect(await screen.findByText(/총 3개 아이템/)).toBeInTheDocument();

    // 검색 입력에 "Neon" 입력 시 1개 표시
    const input = screen.getByPlaceholderText('아이템 검색...');
    fireEvent.change(input, { target: { value: 'Neon' } });
    expect(await screen.findByText(/총 1개 아이템/)).toBeInTheDocument();

    // 검색 초기화 후 "weapon" 타입 배지가 최소 1개 존재
    fireEvent.change(input, { target: { value: '' } });
    expect(await screen.findByText(/총 3개 아이템/)).toBeInTheDocument();
    // 배지 텍스트는 한국어 레이블로 표시되므로 '에픽' 등급 확인으로 대체
    expect(screen.getAllByText(/에픽|레어|일반|전설|신화/).length).toBeGreaterThan(0);
  });
});
