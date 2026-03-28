import i18n from "i18next"
import { initReactI18next } from "react-i18next"
import enCommon from "../public/locales/en/common.json"
import koCommon from "../public/locales/ko/common.json"

const resources = {
  en: {
    common: enCommon,
  },
  ko: {
    common: koCommon,
  },
} as const

const SUPPORTED_LANGUAGES = new Set(["ko", "en"])

const getLanguageFromPathname = () => {
  if (typeof window === "undefined") return null

  const [maybeLanguage] = window.location.pathname.split("/").filter(Boolean)
  return maybeLanguage && SUPPORTED_LANGUAGES.has(maybeLanguage) ? maybeLanguage : null
}

const detectLanguage = () => {
  if (typeof window === "undefined") {
    return "en"
  }

  const pathnameLanguage = getLanguageFromPathname()
  if (pathnameLanguage) {
    return pathnameLanguage
  }

  const saved = window.localStorage.getItem("i18nextLng")
  if (saved === "ko" || saved === "en") {
    return saved
  }

  return window.navigator.language.toLowerCase().startsWith("ko") ? "ko" : "en"
}

if (!i18n.isInitialized) {
  void i18n.use(initReactI18next).init({
    resources,
    lng: detectLanguage(),
    fallbackLng: "en",
    defaultNS: "common",
    interpolation: {
      escapeValue: false,
    },
  })
}

export default i18n
