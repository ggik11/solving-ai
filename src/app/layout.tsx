import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { BottomNav } from "@/components/BottomNav";
import { getNavBadgeCounts } from "@/lib/nav-badges";
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
  title: "상명메이트",
  description: "상명대학교 서울캠퍼스 학생을 위한 대외활동 추천·파티 매칭 서비스 (비공식 데모)",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const { chatUnread, notificationUnread } = await getNavBadgeCounts();

  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-[var(--background)] pb-16">
        {children}
        <BottomNav chatUnread={chatUnread} notificationUnread={notificationUnread} />
      </body>
    </html>
  );
}
