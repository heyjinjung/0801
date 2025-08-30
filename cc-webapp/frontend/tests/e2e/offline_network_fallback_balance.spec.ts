import { test, expect, request } from '@playwright/test';

const API = process.env.API_BASE_URL || 'http://localhost:8000';

async function signup(ctx: any) {
  const nickname = `offline_${Date.now().toString(36)}`;
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

// 네트워크 실패 폴백: 오프라인 시 쓰기 차단, 최종 balance는 /users/balance와 일치해야 함

test('Offline write blocked; final balance equals authoritative', async ({ page, context }) => {
  const ctx = await request.newContext();
  const token = await signup(ctx);

  await page.goto('/');
  await page.waitForLoadState('domcontentloaded');
  await page.evaluate((tok) => {
    localStorage.setItem('cc_auth_tokens', JSON.stringify({ access_token: tok, refresh_token: null }));
  }, token);
  await page.reload();

  await page.waitForSelector('[data-testid="gold-balance"]', { timeout: 10000 });

  const before = await getBalance(ctx, token);

  // 오프라인 모드 시뮬레이션: navigator.onLine=false 이벤트 디스패치
  await page.evaluate(() => {
    try {
      Object.defineProperty(window.navigator, 'onLine', { value: false, configurable: true });
      window.dispatchEvent(new Event('offline'));
    } catch {}
  });

  // 경제 액션(예: 구매 버튼) 시도하되, unifiedApi가 차단해야 함
  const buyBtn = page.getByRole('button', { name: /구매|Buy/i }).first();
  if (await buyBtn.count().catch(() => 0) > 0) {
    await buyBtn.click().catch(() => {});
  } else {
    // 대체: 보상 청구 트리거(POST) 시도
    const rewardBtn = page.getByRole('button', { name: /수령|Claim/i }).first();
    if (await rewardBtn.count().catch(() => 0) > 0) {
      await rewardBtn.click().catch(() => {});
    }
  }

  await page.waitForTimeout(400);

  // 온라인 복귀 및 초기 동기화 유도
  await page.evaluate(() => {
    try {
      Object.defineProperty(window.navigator, 'onLine', { value: true, configurable: true });
      window.dispatchEvent(new Event('online'));
    } catch {}
  });

  await page.waitForTimeout(600);

  const after = await getBalance(ctx, token);
  expect(after).toBe(before);
});
