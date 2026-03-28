import { NextResponse } from "next/server"
import type { NextRequest } from "next/server"
import { detectPreferredLanguage, isSupportedLanguage, SITE_HOST } from "@/lib/i18n-config"

const ALLOWED_HOST = SITE_HOST

export function middleware(request: NextRequest) {
  const host = request.headers.get("host") || ""

  // Block generated vercel.app URLs and only serve the public custom domain.
  if (host.endsWith("vercel.app") && host !== ALLOWED_HOST) {
    return new NextResponse("Forbidden", { status: 403 })
  }

  const pathname = request.nextUrl.pathname
  const cookieLanguage = request.cookies.get("preferred-language")?.value
  const preferredLanguage = cookieLanguage && isSupportedLanguage(cookieLanguage)
    ? cookieLanguage
    : detectPreferredLanguage(request.headers.get("accept-language"))

  if (pathname === "/") {
    const url = request.nextUrl.clone()
    url.pathname = `/${preferredLanguage}`
    return NextResponse.redirect(url)
  }

  const requestHeaders = new Headers(request.headers)
  const pathnameLanguage = pathname.split("/").filter(Boolean)[0]
  const currentLanguage = pathnameLanguage && isSupportedLanguage(pathnameLanguage)
    ? pathnameLanguage
    : preferredLanguage

  requestHeaders.set("x-current-language", currentLanguage)

  return NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  })
}
