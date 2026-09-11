/**
 * 상태 확인 경로.
 *
 * Railway 같은 호스팅이 배포가 살아났는지 확인할 때 부른다.
 * 새 배포가 실제로 응답하기 전에는 트래픽을 넘기지 않게 하려는 것이다.
 *
 * 운영에 필요한 최소한만 답한다. 어떤 기능이 켜져 있는지는 알리되,
 * 키 값이나 경로 같은 내부 사정은 담지 않는다 — 이 경로는 누구나 부를 수 있다.
 */
import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  return NextResponse.json({
    ok: true,
    service: "rolefit-canvas",
    // 서버가 있는 배포인지(= API 경로가 살아 있는지) 화면이 확인하는 데도 쓴다.
    server: true,
    // 켜짐 여부만 알린다. 키 자체는 어디에도 싣지 않는다.
    features: {
      memberStore: Boolean(process.env.ROLEFIT_DATA_DIR),
      precisionAnalysis: Boolean(process.env.ROLEFIT_ANTHROPIC_API_KEY),
      googleLogin: Boolean(process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID),
    },
  });
}
