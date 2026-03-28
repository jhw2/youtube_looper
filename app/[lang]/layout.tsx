import type { Metadata } from "next"
import { notFound } from "next/navigation"
import { isSupportedLanguage, metadataByLanguage, SITE_URL } from "@/lib/i18n-config"

type LangLayoutProps = {
  children: React.ReactNode
  params: Promise<{ lang: string }>
}

export async function generateMetadata({ params }: LangLayoutProps): Promise<Metadata> {
  const { lang } = await params
  const language = isSupportedLanguage(lang) ? lang : "en"
  const meta = metadataByLanguage[language]

  return {
    metadataBase: new URL(SITE_URL),
    applicationName: "YouTube Looper",
    title: meta.title,
    description: meta.description,
    keywords: meta.keywords,
    openGraph: {
      title: meta.title,
      description: meta.description,
      type: "website",
      locale: meta.openGraphLocale,
      siteName: "YouTube Looper",
      url: `${SITE_URL}/${language}`,
    },
    twitter: {
      card: "summary_large_image",
      title: meta.title,
      description: meta.description,
    },
    robots: {
      index: true,
      follow: true,
    },
    alternates: {
      canonical: `${SITE_URL}/${language}`,
      languages: {
        ko: `${SITE_URL}/ko`,
        en: `${SITE_URL}/en`,
      },
    },
  }
}

export default async function LangLayout({ children, params }: LangLayoutProps) {
  const { lang } = await params

  if (!isSupportedLanguage(lang)) {
    notFound()
  }

  return children
}
