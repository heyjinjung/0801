import { NextRequest, NextResponse } from "next/server";

// 최소 미들웨어: 모든 요청을 통과시킵니다.
// 추후 /admin 가드 등을 여기에 추가합니다.
export function middleware(_req: NextRequest) {
	return NextResponse.next();
}

// 불필요한 정적 리소스는 제외하여 오버헤드를 줄입니다.
export const config = {
	matcher: [
		"/((?!_next/|favicon.ico|.*\\.(?:js|css|map|png|jpg|jpeg|gif|svg|webp|ico)$).*)",
	],
};

