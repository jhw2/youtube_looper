import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

const ALLOWED_HOST = "youtube-looper.vercel.app"

export function middleware(request: NextRequest) {
  const host = request.headers.get("host") || ""

  // Only allow the canonical Vercel hostname; block other generated vercel.app URLs.
  if (host.endsWith("vercel.app") && host !== ALLOWED_HOST) {
    return new NextResponse("Forbidden", { status: 403 })
  }

  return NextResponse.next()
}
