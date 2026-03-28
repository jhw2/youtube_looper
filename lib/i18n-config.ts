export const SUPPORTED_LANGUAGES = ["ko", "en"] as const

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]

export const DEFAULT_LANGUAGE: SupportedLanguage = "en"
export const SITE_URL = "https://ytlooper.net"
export const SITE_HOST = "ytlooper.net"

export function isSupportedLanguage(value: string): value is SupportedLanguage {
  return SUPPORTED_LANGUAGES.includes(value as SupportedLanguage)
}

export function detectPreferredLanguage(acceptLanguage: string | null | undefined): SupportedLanguage {
  if (!acceptLanguage) return DEFAULT_LANGUAGE
  return acceptLanguage.toLowerCase().includes("ko") ? "ko" : "en"
}

export const metadataByLanguage: Record<
  SupportedLanguage,
  {
    title: string
    description: string
    keywords: string[]
    openGraphLocale: string
  }
> = {
  ko: {
    title: "YouTube Looper | 유튜브 구간 반복, 저장, A-B 반복",
    description:
      "유튜브 영상의 원하는 구간만 반복하고 저장하세요. A/B 구간 반복, 저장된 구간 다시 보기, 속도 조절, 키보드 단축키를 지원해 영상 복습과 연습에 좋은 YouTube Looper입니다.",
    keywords: [
      "유튜브 구간 반복",
      "유튜브 구간 저장",
      "유튜브 반복 재생",
      "YouTube Looper",
      "AB 반복",
      "유튜브 루프",
      "구간 반복 재생",
      "유튜브 구간 저장",
      "유튜브 반복",
      "영상 반복 재생",
      "속도 조절",
      "영상 연습",
      "반복 학습",
    ],
    openGraphLocale: "ko_KR",
  },
  en: {
    title: "YouTube Looper | A-B Repeat, Saved Segments, Video Loop",
    description:
      "Repeat and save specific parts of YouTube videos with A-B repeat, saved segments, speed control, keyboard shortcuts, and mobile support. Great for review and practice.",
    keywords: [
      "YouTube Looper",
      "YouTube A-B repeat",
      "YouTube saved segments",
      "YouTube segment loop",
      "YouTube repeat tool",
      "YouTube video loop",
      "save YouTube segments",
      "YouTube speed control",
      "loop part of YouTube video",
      "video review tool",
      "practice tool",
    ],
    openGraphLocale: "en_US",
  },
}
