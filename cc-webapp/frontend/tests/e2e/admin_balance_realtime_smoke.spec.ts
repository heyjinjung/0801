import { test, expect, request } from '@playwright/test';

const API = process.env.API_BASE_URL || 'http://localhost:8000';

async function apiSignupLogin(ctx: any) {
    const nickname = `admin_rt_${Date.now().toString(36)}`;
    const invite = process.env.E2E_INVITE_CODE || '5858';
    const res = await ctx.post(`${API}/api/auth/register`, { data: { invite_code: invite, nickname } });
    if (!res.ok()) throw new Error('signup failed');
    const json = await res.json();
    return json?.access_token as string;
}

// 단순 스모크: profile_update 테스트 이벤트로 프론트가 업데이트를 반영하는지 확인
// UI 토스트 텍스트 대신, 금액 표시가 바뀌는지 또는 전역 store 바인딩된 텍스트를 확인

test.describe('Admin balance realtime smoke', () => {
    test('profile_update test event updates UI gold', async ({ page }) => {
        const ctx = await request.newContext();
        const token = await apiSignupLogin(ctx);

        await page.goto('/');
        await page.waitForLoadState('domcontentloaded');

        // 로그인 토큰 주입 (앱이 로드된 상태에서 적용)
        await page.evaluate((tok) => {
            try {
                localStorage.setItem('cc_auth_tokens', JSON.stringify({ access_token: tok, refresh_token: null }));
            } catch { }
        }, token);
        // 토큰 반영 후 한번 새로고침하여 세션 반영
        await page.reload();
        await page.waitForLoadState('domcontentloaded');

        // 보텀 네비의 빠른 잔액 위젯이 렌더될 때까지 대기
        await page.waitForSelector('[data-testid="gold-balance"]', { timeout: 10000 });

        // 테스트용 profile_update 이벤트 전송 (골드 증가)
        await page.evaluate(() => {
            const detail = { user_id: 0, gold: 77777 } as any; // user_id는 클라이언트가 merge시 무시 가능
            window.dispatchEvent(new CustomEvent('realtime:test-profile-update', { detail }));
        });

        // 안정적인 셀렉터로 금액 변경 확인
        const bal = page.locator('[data-testid="gold-balance"]');
        await expect(bal).toHaveText(/77,777|77777/, { timeout: 5000 });
    });
});
