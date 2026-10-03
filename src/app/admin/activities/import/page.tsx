import { PageContainer } from "@/components/PageContainer";
import { CsvImportClient } from "./CsvImportClient";

export default function ImportActivitiesPage() {
  return (
    <PageContainer>
      <h1 className="mb-1 text-xl font-semibold">CSV로 활동 가져오기</h1>
      <p className="mb-4 text-sm text-[var(--color-muted-foreground)]">
        업로드하면 행별 오류와 중복 후보를 먼저 보여줍니다. 확인 후 선택한 행만 비공개(draft) 상태로 등록됩니다.
      </p>
      <CsvImportClient />
    </PageContainer>
  );
}
