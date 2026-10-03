import { PageContainer } from "@/components/PageContainer";
import { EmptyState } from "@/components/states";

export default function PartiesPage() {
  return (
    <PageContainer>
      <h1 className="mb-4 text-xl font-semibold">파티</h1>
      <EmptyState
        title="파티 기능은 준비 중이에요"
        description="파티 모집·지원·승인과 빠른 매칭은 3~4단계에서 구현됩니다."
      />
    </PageContainer>
  );
}
