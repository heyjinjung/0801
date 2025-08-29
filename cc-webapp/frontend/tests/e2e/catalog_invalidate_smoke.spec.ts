import { test, expect } from '@playwright/test';

// 스모크: catalog_update 수신 시 프론트가 카탈로그 재조회 트리거
// 네트워크 스파이는 라우팅 환경에 따라 다를 수 있어, 화면 텍스트 변화로 간접 확인

function fireCatalogInvalidate(page: any) {
    return page.evaluate(() => {
        window.dispatchEvent(new CustomEvent('realtime:test-catalog-update'));
    });
}

test.describe('Catalog invalidate/refetch smoke', () => {
    test('fires invalidate -> UI reacts', async ({ page }) => {
        await page.goto('/shop');
    // Wait until hydration and shop are mounted
    await page.waitForFunction(() => (window as any).__appHydrated === true, undefined, { timeout: 10000 });
    await page.waitForFunction(() => (window as any).__shopMounted === true, undefined, { timeout: 10000 });

    // Capture start counter
    const before = await page.evaluate(() => (window as any).__shopRefetchCount || 0);
    await fireCatalogInvalidate(page);
    // Wait until counter increments
    await page.waitForFunction((b) => ((window as any).__shopRefetchCount || 0) > b, before, { timeout: 10000 });
    const after = await page.evaluate(() => (window as any).__shopRefetchCount || 0);
    expect(after).toBeGreaterThan(before);
    });
});
