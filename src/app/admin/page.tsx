import Link from "next/link";
import { PageContainer } from "@/components/PageContainer";

export default function AdminHomePage() {
  return (
    <PageContainer>
      <h1 className="mb-4 text-xl font-semibold">관리자</h1>
      <div className="flex flex-col gap-2">
        <Link
          href="/admin/activities"
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm font-medium"
        >
          활동 관리 (등록·수정·비공개)
        </Link>
        <Link
          href="/admin/activities/import"
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm font-medium"
        >
          CSV로 활동 가져오기
        </Link>
        <Link
          href="/admin/submissions"
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm font-medium"
        >
          활동 제보 검토
        </Link>
        <Link
          href="/admin/reports"
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm font-medium"
        >
          신고 관리
        </Link>
        <Link
          href="/admin/accounts"
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm font-medium"
        >
          계정 관리
        </Link>
        <Link
          href="/admin/audit-logs"
          className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-4 py-3 text-sm font-medium"
        >
          감사 로그
        </Link>
      </div>
    </PageContainer>
  );
}
