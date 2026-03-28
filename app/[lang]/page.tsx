import { notFound } from "next/navigation"
import LooperPageClient from "../looper-page-client"
import { isSupportedLanguage } from "@/lib/i18n-config"

type LangPageProps = {
  params: Promise<{ lang: string }>
}

const metadataByLang = {
  en: {
    title: "YT Looper - YouTube Loop & A-B Repeat",
    description:
      "Loop YouTube videos by selecting A-B sections, changing speed, and saving segments. Optimized for musicians and simple repeat watchers.",
    keywords: [
      "YouTube loop",
      "video repeat",
      "A-B repeat",
      "music practice",
      "video practice",
      "segment repeat",
      "YouTube looper",
    ],
  },
  ko: {
    title: "YT Looper - 유튜브 구간 반복 재생",
    description:
      "유튜브 영상 A-B 구간 반복, 재생 속도 조절, 세그먼트 저장 기능. 악기 연습과 단순 영상 반복 모두에 최적화된 루퍼입니다.",
    keywords: [
      "유튜브 반복",
      "영상 반복",
      "A-B 반복",
      "악기 연습",
      "반복 재생",
      "루퍼",
      "YouTube 루프",
    ],
  },
}

export function generateMetadata({ params }: { params: { lang: string } }) {
  const lang = params.lang as keyof typeof metadataByLang
  const meta = metadataByLang[lang] ?? metadataByLang.en

  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "https://your-domain.com"
  const canonicalUrl = `${baseUrl}/${lang}`

  return {
    title: meta.title,
    description: meta.description,
    keywords: meta.keywords,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title: meta.title,
      description: meta.description,
      type: "website",
      siteName: "YT Looper",
      url: canonicalUrl,
    },
    twitter: {
      card: "summary_large_image",
      title: meta.title,
      description: meta.description,
    },
  }
}

export default async function LangPage({ params }: LangPageProps) {
  const { lang } = await params

  if (!isSupportedLanguage(lang)) {
    notFound()
  }

  return <LooperPageClient lang={lang} />
}
