import { test, expect, request } from '@playwright/test';

const API = process.env.API_BASE_URL || 'http://localhost:8000';

async function apiSignup(ctx: any) {
  const nickname = `admin_gold_${Date.now().toString(36)}`;
  const invite = process.env.E2E_INVITE_CODE || '5858';
  const res = await ctx.post(`${API}/api/auth/register`, { data: { invite_code: invite, nickname } });
  expect(res.ok()).toBeTruthy();
  const json = await res.json();
  return json?.access_token as string;
}

async function getBalance(ctx: any, token: string) {
  const resp = await ctx.get(`${API}/api/users/balance`, { headers: { Authorization: `Bearer ${token}` } });
  expect(resp.ok()).toBeTruthy();
  const j = await resp.json();
  return Number(j?.gold ?? j?.gold_balance ?? j?.cyber_token_balance ?? j?.balance ?? 0);
}

test.describe('Admin gold grant realtime reflect', () => {
  test('client reflects profile_update or reconcile after grant', async ({ page }) => {
    const ctx = await request.newContext();
    const token = await apiSignup(ctx);

    await page.goto('/');
    await page.waitForLoadState('domcontentloaded');

    // inject token and reload to login
    await page.evaluate((tok) => {
      localStorage.setItem('cc_auth_tokens', JSON.stringify({ access_token: tok, refresh_token: null }));
    }, token);
    await page.reload();

    // baseline gold
    await page.waitForSelector('[data-testid="gold-balance"]', { timeout: 10000 });
    const beforeText = await page.locator('[data-testid="gold-balance"]').textContent();
    const before = Number((beforeText || '').replace(/[^0-9]/g, '')) || 0;

    // simulate admin grant via test event (server would broadcast profile_update; here we mimic)
    await page.evaluate(() => {
      const detail = { gold: 12345 } as any;
      window.dispatchEvent(new CustomEvent('realtime:test-profile-update', { detail }));
    });

    const afterText = await page.locator('[data-testid="gold-balance"]').textContent();
    const after = Number((afterText || '').replace(/[^0-9]/g, '')) || 0;
    expect(after).not.toBe(before);
  });
});
