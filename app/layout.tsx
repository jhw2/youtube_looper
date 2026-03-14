import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "YouTube Looper - 유튜브 구간 반복 재생",
  description:
    "유튜브 영상의 원하는 구간을 설정하고 반복 재생할 수 있는 무료 도구입니다. A/B 구간 반복, 속도 조절, 구간 저장 기능을 제공합니다.",
  keywords: [
    "유튜브 구간 반복",
    "YouTube loop",
    "AB 반복",
    "유튜브 루프",
    "구간 반복 재생",
    "youtube repeat",
  ],
  openGraph: {
    title: "YouTube Looper - 유튜브 구간 반복 재생",
    description:
      "유튜브 영상의 원하는 구간을 설정하고 반복 재생할 수 있는 무료 도구입니다.",
    type: "website",
    locale: "ko_KR",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ko">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
