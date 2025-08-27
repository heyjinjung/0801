// 단일 Jest 설정 (Next.js 15 + TypeScript) - VSCode 확장 다중 설정 충돌 방지
// 기존 jest.config.ts 내용을 통합하여 ts-jest 개별 설정 없이 next/jest (SWC) 파이프라인 사용.
// 해결 대상 에러: "Multiple configurations found" -> jest.config.ts 제거(또는 rename) 권장.
// 만약 삭제가 곤란하면 package.json scripts 의 test 명령에 --config jest.config.js 명시.

const nextJest = require('next/jest');
const createJestConfig = nextJest({ dir: './' });

/** @type {import('jest').Config} */
const customJestConfig = {
  testEnvironment: 'jsdom',
  // jest.setup.ts 를 우선 사용; 없으면 .js 로 대체 가능
  setupFilesAfterEnv: [
    '<rootDir>/jest.setup.ts',
    // fallback 용: 존재하지 않아도 오류 아님 (존재 여부는 runner가 무시)
  ].filter(Boolean),
  // 통일된 패턴 (.test. 확장) - ts/tsx/js 모두 허용
  testMatch: ['**/__tests__/**/*.test.(ts|tsx|js)'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  moduleNameMapper: {
    '^@/(.+)$': '<rootDir>/$1',
    // 스타일 모듈 mock 필요 시 identity-obj-proxy 설치되어 있으면 활성화
    '\\.(css|less|scss|sass)$': 'identity-obj-proxy',
  },
  // 필요 시 커버리지 수집 (기본 watchAll=false 환경에서만 활성화 권고)
  collectCoverageFrom: [
    '<rootDir>/**/*.{ts,tsx}',
    '!<rootDir>/.next/**',
    '!<rootDir>/node_modules/**',
  ],
  // 경로 중 중첩/복제 폴더(예: frontend/0801/cc-webapp/frontend) 테스트 제외 안전장치
  testPathIgnorePatterns: [
    '<rootDir>/.next/',
    '<rootDir>/node_modules/',
    '<rootDir>/.*/cc-webapp/frontend/',
  ],
};

module.exports = createJestConfig(customJestConfig);
