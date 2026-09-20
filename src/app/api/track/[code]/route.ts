import { NextResponse } from 'next/server'
import type { TrackingResult } from '@/lib/stores'

/**
 * Tracking API contract. Real data will arrive here later (warehouse system / Telegram bot).
 * Until then every code is "not found" — the UI explains and routes the visitor to Telegram.
 * Response: { found:true, code, status, history[] } | { found:false }
 */
export async function GET(_req: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params
  const clean = decodeURIComponent(code).trim().toUpperCase().slice(0, 40)
  if (!/^[A-Z0-9-]{4,40}$/.test(clean)) {
    return NextResponse.json({ found: false, error: 'invalid' } satisfies TrackingResult & { error: string }, { status: 400 })
  }
  const result: TrackingResult = { found: false, code: clean }
  return NextResponse.json(result, { headers: { 'Cache-Control': 'no-store' } })
}
