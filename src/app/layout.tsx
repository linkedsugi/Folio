import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: {
    default: "RoleFit Canvas — 맞춤 이력서 작성 + 지원전략 분석",
    template: "%s | RoleFit Canvas",
  },
  description:
    "지원할 회사의 공고와 나의 이력을 연결해, 무엇을 보여주고 무엇을 더 준비할지 알려주는 웹앱. 기업 제출용 맞춤 이력서와 지원자 전용 지원전략 분석서를 함께 만듭니다.",
  applicationName: "RoleFit Canvas",
  authors: [{ name: "MindCanvas" }],
  keywords: ["이력서", "Resume", "CV", "채용공고", "직무 매칭률", "지원전략", "인재상"],
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#12263f",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ko">
      <body className="min-h-dvh bg-surface text-ink antialiased">
        {/* 키보드 사용자를 위한 본문 바로가기 */}
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-sm focus:bg-ink focus:px-4 focus:py-2 focus:text-sm focus:text-white"
        >
          본문으로 건너뛰기
        </a>
        {children}
      </body>
    </html>
  );
}
