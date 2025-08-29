import { test, expect } from '@playwright/test';
import { getAdminHeaders } from './helpers/adminAuth';

// 환경에 따라 관리자 인증/백엔드가 준비되지 않았으면 skip
const shouldRun = !!process.env.API_BASE_URL;

test.describe('admin shop CRUD round-trip', () => {
  test.skip(!shouldRun, 'API_BASE_URL 미설정으로 스킵');
  const adminHeaders = getAdminHeaders();
  test.skip(!adminHeaders, 'E2E_ADMIN_BEARER(또는 ADMIN_BEARER/ADMIN_TOKEN) 미설정으로 스킵');

  test('create → update → discount → rank → delete', async ({ request }) => {
    const base = process.env.API_BASE_URL!.replace(/\/$/, '');
  const headers = adminHeaders!;

    const ts = Date.now();
    const id = Math.floor(ts % 2147483647);
    const sku = `test_${ts}`;

    // create
  let res = await request.post(`${base}/api/admin/shop/items`, { data: { id, sku, name: `Name ${ts}`, price_cents: 1234, gold: 10 }, headers });
    expect(res.ok()).toBeTruthy();

    // update
  res = await request.put(`${base}/api/admin/shop/items/${id}`, { data: { id, sku, name: `Name ${ts}*`, price_cents: 2345, gold: 20 }, headers });
    expect(res.ok()).toBeTruthy();

    // discount
  res = await request.patch(`${base}/api/admin/shop/items/${id}/discount`, { data: { discount_percent: 15 }, headers });
    expect(res.ok()).toBeTruthy();

    // rank
  res = await request.patch(`${base}/api/admin/shop/items/${id}/rank`, { data: { min_rank: 'VIP1' }, headers });
    expect(res.ok()).toBeTruthy();

    // delete
  res = await request.delete(`${base}/api/admin/shop/items/${id}`, { headers });
    expect(res.ok()).toBeTruthy();
  });
});
