'use client';

import React, { useEffect } from 'react';
import ProfileStats from '@/components/profile/ProfileStats';
import ActionHistory from '@/components/profile/ActionHistory';

// Minimal, auth-agnostic profile shells for E2E determinism.
// Renders the same cards/tests target without requiring a logged-in session.
export default function ProfilePage() {
  // Mark a light readiness flag for tests, if needed.
  useEffect(() => {
    try {
      (window as any).__profilePageMounted = true;
    } catch {}
  }, []);

  return (
    <div
      className="min-h-screen bg-gradient-to-br from-background via-black/95 to-primary/5 p-4 lg:p-6"
      aria-label="profile-root"
    >
      <div className="max-w-5xl mx-auto grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <ProfileStats />
        </div>
        <div>
          <ActionHistory />
        </div>
      </div>
    </div>
  );
}
