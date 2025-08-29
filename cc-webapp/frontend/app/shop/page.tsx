'use client';

import React, { useEffect, useMemo, useState, useCallback } from 'react';
import { ShopScreen } from '@/components/ShopScreen';
import { useUserManager } from '@/hooks/useUserManager';
import { useNotificationSystem } from '@/components/NotificationSystem';

export default function ShopPage() {
  // Reuse existing managers so state is consistent with app conventions
  const { user, updateUser, restoreSavedUser, createUserData } = useUserManager();
  const { addNotification } = useNotificationSystem();

  // Lightweight bootstrap: ensure we have a user for the ShopScreen
  useEffect(() => {
    try {
      // If already have a saved user, restore it once
      const saved = restoreSavedUser();
      if (!user && saved) {
        updateUser(saved);
        return;
      }
      // Otherwise create a minimal test user so E2E can mount the shop reliably
      if (!user && !saved) {
        const u = createUserData('e2e-shop', '', true);
        updateUser(u);
      }
    } catch {
      // ignore – shop will still render fallback UI
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Stable no-op navigations for standalone shop page
  const noop = useCallback(() => {}, []);

  // Until user hydrates, render nothing (ShopScreen expects a user)
  if (!user) return null;

  return (
    <ShopScreen
      user={user}
      onBack={noop}
      onNavigateToInventory={noop}
      onNavigateToProfile={noop}
      onUpdateUser={updateUser}
      onAddNotification={addNotification}
    />
  );
}
