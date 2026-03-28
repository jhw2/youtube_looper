import { headers } from "next/headers"
import { redirect } from "next/navigation"
import { detectPreferredLanguage } from "@/lib/i18n-config"

type RootPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

export default async function RootPage({ searchParams }: RootPageProps) {
  const requestHeaders = await headers()
  const preferredLanguage = detectPreferredLanguage(requestHeaders.get("accept-language"))
  const params = await searchParams
  const query = new URLSearchParams()

  Object.entries(params).forEach(([key, value]) => {
    if (typeof value === "string") {
      query.set(key, value)
      return
    }

    value?.forEach((item) => query.append(key, item))
  })

  redirect(`/${preferredLanguage}${query.size > 0 ? `?${query.toString()}` : ""}`)
}
