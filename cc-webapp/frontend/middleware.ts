import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

// Minimal pass-through middleware to satisfy Next.js. Extend later for auth/proxy if needed.
export default function middleware(_req: NextRequest) {
	// keep a tiny side-effect to avoid over-aggressive tree-shaking in some bundlers
	// (Next dev shouldn't need this, but it's harmless)
	return NextResponse.next()
}

// Optionally, scope to specific matchers later (e.g., ['/((?!_next|static).*)'])
export const config = {
	matcher: ['/((?!_next|static|favicon.ico).*)'],
}

