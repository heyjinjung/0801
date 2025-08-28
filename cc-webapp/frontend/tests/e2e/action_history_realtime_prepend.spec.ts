import { test, expect, request } from '@playwright/test';

const API = process.env.API_BASE_URL || 'http://localhost:8000';

async function apiSignupLogin(ctx: any) {
  const nickname = `rt_${Date.now().toString(36)}`;
  const invite = process.env.E2E_INVITE_CODE || '5858';
  const res = await ctx.post(`${API}/api/auth/register`, { data: { invite_code: invite, nickname } });
  if (!res.ok()) throw new Error('signup failed');
  const json = await res.json();
  return json?.access_token as string;
}

test.describe('ActionHistory realtime prepend', () => {
  test('dispatch test-user-action shows on top', async ({ page }) => {
    const ctx = await request.newContext();
  const token = await apiSignupLogin(ctx);

    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    const btn = page.getByRole('button', { name: /프로필|Profile/i }).first();
    if (await btn.count().catch(() => 0) > 0 && await btn.isVisible().catch(() => false)) {
      await btn.click().catch(() => { /* ignore */ });
    }

    // ensure list container exists (may be empty initially)
    const list = page.locator('[aria-label="action-history-list"][role="list"]');
    await list.waitFor({ state: 'visible', timeout: 5000 }).catch(() => { /* allow empty */ });

  // Resolve current user id via API (separate from page session)
  const me = await ctx.get(`${API}/api/auth/me`, { headers: { Authorization: `Bearer ${token}` } });
  const meJson = await me.json();
  const userId = meJson?.id || 0;

  // Inject a test WS user_action event
  const actionType = `TEST_ACTION_${Date.now()}`;
  await page.evaluate(({ type, uid }) => {
      const detail = {
    user_id: uid,
    action_type: type,
        action_data: { via: 'e2e' },
        created_at: new Date().toISOString(),
      } as any;
      window.dispatchEvent(new CustomEvent('realtime:test-user-action', { detail }));
  }, { type: actionType, uid: userId });

    // Expect the item with our action_type to appear at the top
    // allow a small delay for React render
    const firstItem = list.locator('[role="listitem"]').first();
    await firstItem.waitFor({ state: 'visible', timeout: 2000 }).catch(() => { /* tolerate */ });
    const text = await firstItem.textContent().catch(() => '');
    expect(text || '').toContain(actionType);
  });
});
