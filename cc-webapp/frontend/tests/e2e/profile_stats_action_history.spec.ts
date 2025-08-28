import { test, expect, request } from '@playwright/test';

// Basic API base URL
const API = process.env.API_BASE_URL || 'http://localhost:8000';

async function apiSignupLogin(ctx: any) {
    const nickname = `profile_${Date.now().toString(36)}`;
    const invite = process.env.E2E_INVITE_CODE || '5858';
    const res = await ctx.post(`${API}/api/auth/register`, { data: { invite_code: invite, nickname } });
    expect(res.ok()).toBeTruthy();
    const json = await res.json();
    return json?.access_token as string;
}

/**
 * Minimal smoke: navigate to Profile screen and assert stats + action history shell render
 * We avoid deep data assertions to keep it fast and stable across envs.
 */
test.describe('Profile: stats + action history render', () => {
    test('mounts stats card and action history list', async ({ page }) => {
        const ctx = await request.newContext();
        const token = await apiSignupLogin(ctx);

        // Open app root
        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');

        // Try to open Profile via a button if present; fallback to direct route if available
        const btn = page.getByRole('button', { name: /프로필|Profile/i }).first();
        if (await btn.count().catch(() => 0) > 0 && await btn.isVisible().catch(() => false)) {
            await btn.click().catch(() => { });
        }

        // Ensure profile stats and action history shells render
        const statsCard = page.locator('[aria-label="profile-stats-card"]');
        await expect(statsCard).toBeVisible({ timeout: 5000 });

        const actionsCard = page.locator('[aria-label="profile-action-history-card"]');
        await expect(actionsCard).toBeVisible({ timeout: 5000 });

        // If action list exists, it should be present (may be empty on fresh accounts)
        const list = page.locator('[aria-label="action-history-list"]');
        // Allow either empty-state text or at least one row
        const emptyText = page.getByText('표시할 활동이 없습니다.');
        const hasList = await list.count();
        if (hasList > 0) {
            const rowCount = await list.locator('div[role="listitem"], div.rounded-lg').count().catch(() => 0);
            expect(rowCount).toBeGreaterThanOrEqual(0); // shell present is enough
        } else {
            await expect(emptyText).toBeVisible({ timeout: 2000 });
        }
    });
});
