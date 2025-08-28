import { test, expect } from '@playwright/test';

// This spec validates that ShopBadge reacts to realtime purchase_update events
// using a test-only custom event hook exposed by RealtimeSyncProvider.

test.describe('ShopBadge realtime pending_count badge', () => {
    test('badge appears on pending and hides on success', async ({ page }) => {
        // Go to shop page where the badge is visible in header or nav
        await page.goto('/shop');

        // Initially, the badge bubble should not be present (pending_count = 0)
        const badgeBubble = page.locator('[aria-label^="pending purchases:"]');
        await expect(badgeBubble).toHaveCount(0);

        // Dispatch a test-only CustomEvent to simulate a pending purchase
        await page.evaluate(() => {
            const detail = { status: 'pending', product_id: 'sku_test', amount: 1, receipt_code: 'rcpt-smoke-1' } as any;
            window.dispatchEvent(new CustomEvent('realtime:test-purchase-update', { detail }));
        });

        // Badge should appear with count 1
        await expect(page.locator('[aria-label="pending purchases: 1"]')).toHaveCount(1);

        // Now simulate final success for the same receipt, which should decrement pending
        await page.evaluate(() => {
            const detail = { status: 'success', product_id: 'sku_test', amount: 1, receipt_code: 'rcpt-smoke-1' } as any;
            window.dispatchEvent(new CustomEvent('realtime:test-purchase-update', { detail }));
        });

        // Badge should hide (back to 0)
        await expect(badgeBubble).toHaveCount(0);
    });
});
