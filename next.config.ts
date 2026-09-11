import type { NextConfig } from "next";

/**
 * 두 가지 배포 모양을 지원한다.
 *
 *  기본 (Node 서버)   — API 경로가 살아 있다. 공고 URL 을 서버가 대신 열어 주고,
 *                      ANTHROPIC_API_KEY 가 있으면 정밀 분석을 쓴다.
 *  BUILD_TARGET=static — 정적 파일만 내보낸다(GitHub Pages 등).
 *                      파일 읽기는 브라우저에서 하므로 그대로 동작하고,
 *                      공고 URL 가져오기만 빠진다(화면이 붙여넣기로 안내한다).
 *
 * 정적 빌드에서는 route handler 를 내보낼 수 없으므로, CI 가 빌드 전에 src/app/api 를 치운다.
 * (scripts/prepare-static.mjs)
 */
const isStatic = process.env.BUILD_TARGET === "static";

/** GitHub Pages 는 https://<user>.github.io/<repo>/ 아래에 올라간다. */
const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  ...(isStatic ? { output: "export" as const } : {}),
  basePath: basePath || undefined,
  // 정적 배포에서는 이미지 최적화 서버가 없다.
  images: { unoptimized: isStatic },
  // 정적 호스팅은 /apply/story 같은 경로를 /apply/story/index.html 로 찾는다.
  trailingSlash: isStatic,
};

export default nextConfig;
