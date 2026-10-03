import { PageContainer } from "@/components/PageContainer";
import { EmptyState } from "@/components/states";

export default function ChatPage() {
  return (
    <PageContainer>
      <h1 className="mb-4 text-xl font-semibold">채팅</h1>
      <EmptyState
        title="채팅 기능은 준비 중이에요"
        description="팀이 확정되면 바로 쓸 수 있는 채팅은 4단계에서 구현됩니다."
      />
    </PageContainer>
  );
}
