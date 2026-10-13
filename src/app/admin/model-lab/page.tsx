import { createClient } from "@/lib/supabase/server";
import { PageContainer } from "@/components/PageContainer";
import { loadPosterClassifierConfig } from "@/lib/poster/query";
import { ImagePreprocessSection } from "./ImagePreprocessSection";
import { ManifestCheckSection } from "./ManifestCheckSection";
import { ModelEvaluationSection } from "./ModelEvaluationSection";

/**
 * 실험 도구(가이드 6장, G4) — 관리자 전용, 전부 브라우저에서 실행한다. 이미지는 서버로
 * 보내지 않는다(네이티브 패키지 설치 문제 회피 + 서비스와 완전히 같은 전처리·추론 코드 재사용).
 */
export default async function ModelLabPage() {
  const supabase = await createClient();
  const [posterConfig, { data: classMapRows }] = await Promise.all([
    loadPosterClassifierConfig(supabase),
    supabase.from("model_class_field_map").select("class_id"),
  ]);
  const knownClassIds = [...new Set((classMapRows ?? []).map((r) => r.class_id as string))];

  return (
    <PageContainer>
      <h1 className="mb-1 text-xl font-semibold">실험 도구</h1>
      <p className="mb-4 text-sm text-[var(--color-muted-foreground)]">
        포스터 분류 모델을 학습·평가하는 도구예요. 이미지는 브라우저 안에서만 처리되고 서버로 전송되지 않아요.
      </p>
      <div className="flex flex-col gap-4">
        <ImagePreprocessSection />
        <ManifestCheckSection knownClassIds={knownClassIds} />
        <ModelEvaluationSection posterConfig={posterConfig} />
      </div>
    </PageContainer>
  );
}
