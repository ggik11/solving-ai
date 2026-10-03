import Link from "next/link";
import { PageContainer } from "@/components/PageContainer";
import { EmptyState } from "@/components/states";

export default function SubmitActivityDonePage() {
  return (
    <PageContainer>
      <EmptyState
        title="제보가 접수됐어요"
        description="운영자 검토 후 공개돼요. 검토 결과는 알림으로 알려드려요."
        action={
          <Link href="/activities" className="rounded-md bg-[var(--color-brand-600)] px-4 py-2 text-sm font-medium text-white">
            활동 탐색으로
          </Link>
        }
      />
    </PageContainer>
  );
}
