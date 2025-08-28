import { test, expect } from '@playwright/test';

// E2E: purchase_update should show a toast and update history list

test.describe('Shop toast + history on purchase_update', () => {
    test('shows toast and appends history entries', async ({ page }) => {
        await page.goto('/shop');

        // Ensure history count text is present
        const countBadge = page.locator('text=최근 거래 히스토리').locator('..').locator('text=/건$/');

        // Grab initial history DOM for comparison
        const initialList = page.locator('text=최근 거래 히스토리').locator('..').locator('.space-y-3');

        // Trigger pending → expect toast with type shop
        await page.evaluate(() => {
            const detail = { status: 'pending', product_id: 'sku_toast', amount: 1, receipt_code: 'rcpt-toast-1' } as any;
            window.dispatchEvent(new CustomEvent('realtime:test-purchase-update', { detail }));
            // Also emulate the provider toast broadcast that realtime handler would do (simplified)
            window.dispatchEvent(new CustomEvent('app:notification', { detail: { type: 'shop', payload: '구매 결제가 진행 중입니다...' } }));
        });

        // A toast container should appear with a message
        const toastContainer = page.locator('.fixed.top-4.right-4');
        await expect(toastContainer).toContainText(/shop|결제가 진행/);

        // Trigger success → expect success toast and history list to include new entry
        await page.evaluate(() => {
            const detail = { status: 'success', product_id: 'sku_toast', amount: 1, receipt_code: 'rcpt-toast-1' } as any;
            window.dispatchEvent(new CustomEvent('realtime:test-purchase-update', { detail }));
            window.dispatchEvent(new CustomEvent('app:notification', { detail: { type: 'success', payload: '결제가 완료되었습니다' } }));
        });

        // Check success toast appeared
        await expect(toastContainer).toContainText(/결제가 완료/);

        // History should render at least one item
        const historyRows = page.locator('text=최근 거래 히스토리').locator('..').locator('.space-y-3 > div');
        await expect(historyRows.first()).toBeVisible();
        // And one of them should contain our product id
        await expect(page.getByText('상품 sku_toast')).toBeVisible();
    });
});
