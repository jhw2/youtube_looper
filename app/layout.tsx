import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Analytics } from "@vercel/analytics/next";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://ytlooper.net"),
  applicationName: "YouTube Looper",
  title: "YouTube Looper - 유튜브 구간 반복 재생",
  description:
    "기타 연습, 베이스 연습, 드럼, 피아노 등 악기 연습과 음악 연습에 최적화된 유튜브 구간 반복 재생 도구입니다. A/B 구간 반복, 속도 조절, 구간 저장, 재생 목록 관리 기능을 무료로 제공합니다.",
  keywords: [
    "유튜브 구간 반복",
    "YouTube loop",
    "AB 반복",
    "유튜브 루프",
    "구간 반복 재생",
    "youtube repeat",
    "기타 연습",
    "베이스 연습",
    "악기 연습",
    "음악 연습",
    "드럼 연습",
    "피아노 연습",
    "구간 루프",
    "카피 연습",
    "커버 연습",
  ],
  openGraph: {
    title: "YouTube Looper - 유튜브 구간 반복 재생",
    description:
      "기타, 베이스, 드럼, 피아노 등 악기 연습에 최적화된 유튜브 구간 반복 재생 도구. A/B 반복, 속도 조절, 구간 저장까지.",
    type: "website",
    locale: "ko_KR",
    siteName: "YouTube Looper",
    url: "https://ytlooper.net",
  },
  twitter: {
    card: "summary_large_image",
    title: "YouTube Looper - 유튜브 구간 반복 재생",
    description:
      "기타, 베이스, 악기 연습에 최적화된 유튜브 구간 반복 재생. A/B 구간, 속도 조절, 구간 저장 지원.",
  },
  robots: {
    index: true,
    follow: true,
  },
  alternates: {
    canonical: 'https://ytlooper.net',
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
      </head>
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
        <Analytics />
      </body>
    </html>
  );
}
