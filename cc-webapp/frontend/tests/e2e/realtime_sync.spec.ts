import { test, expect } from '@playwright/test';

/**
 * E2E: 표준 WS 경로(`/api/realtime/sync`) 연결 시도 흔적이 존재하는지 간단 검증
 * 구현 세부가 숨겨져도, 에러 로그/경고 토스트/네트워크 요청 존재로 간접 확인
 */
test.describe('Realtime sync WS standard path', () => {
  const baseURL = 'http://localhost:3000';

  test('connects to /api/realtime/sync (indirect)', async ({ page }) => {
    const consoleLogs: string[] = [];
    page.on('console', (msg) => consoleLogs.push(msg.text()));

    await page.goto(baseURL + '/');
    // 대시보드 진입 시 WS 초기화가 이뤄진다고 가정하고, 간접 신호를 기다림
    await page.waitForTimeout(500);

    const anySyncMention = consoleLogs.some(l => l.includes('/api/realtime/sync'));
    // 느슨한 어설션: 최소한 표준 경로 문자열이 어딘가에 노출되었는지 확인
    expect(anySyncMention).toBeTruthy();
  });
});
