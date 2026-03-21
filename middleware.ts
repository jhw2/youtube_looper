import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"

const ALLOWED_HOST = "ytlooper.net"

export function middleware(request: NextRequest) {
  const host = request.headers.get("host") || ""

  // Block generated vercel.app URLs and only serve the public custom domain.
  if (host.endsWith("vercel.app") && host !== ALLOWED_HOST) {
    return new NextResponse("Forbidden", { status: 403 })
  }

  return NextResponse.next()
}
