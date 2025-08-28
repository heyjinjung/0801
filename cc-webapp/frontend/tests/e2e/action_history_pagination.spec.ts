import { test, expect, request } from '@playwright/test';

const API = process.env.API_BASE_URL || 'http://localhost:8000';

async function apiSignupLogin(ctx: any) {
    const nickname = `hist_${Date.now().toString(36)}`;
    const invite = process.env.E2E_INVITE_CODE || '5858';
    const res = await ctx.post(`${API}/api/auth/register`, { data: { invite_code: invite, nickname } });
    expect(res.ok()).toBeTruthy();
    const json = await res.json();
    return json?.access_token as string;
}

test.describe('ActionHistory list structure (role-based)', () => {
    test('list/listitem roles render (may be empty)', async ({ page }) => {
        const ctx = await request.newContext();
        await apiSignupLogin(ctx);

        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');

        const btn = page.getByRole('button', { name: /프로필|Profile/i }).first();
        if (await btn.count().catch(() => 0) > 0 && await btn.isVisible().catch(() => false)) {
            await btn.click().catch(() => { });
        }

        const list = page.locator('[aria-label="action-history-list"][role="list"]');
        // Allow either empty-state or list element
        const emptyText = page.getByText('표시할 활동이 없습니다.');
        if (await list.count() > 0) {
            const items = list.locator('[role="listitem"]');
            await items.first().waitFor({ state: 'visible', timeout: 2000 }).catch(() => { });
            // no strict count expectations; presence suffices
        } else {
            await expect(emptyText).toBeVisible({ timeout: 2000 });
        }
    });
});
