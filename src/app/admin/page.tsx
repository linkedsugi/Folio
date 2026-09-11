import type { Metadata } from "next";
import { AdminClient } from "./admin-client";

export const metadata: Metadata = {
  title: "회원 관리",
  // 관리 화면은 검색 결과에 남을 이유가 없다.
  robots: { index: false, follow: false },
};

export default function AdminPage() {
  return <AdminClient />;
}
