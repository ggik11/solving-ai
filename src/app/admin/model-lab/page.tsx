import { createClient } from "@/lib/supabase/server";
import { PageContainer } from "@/components/PageContainer";
import { loadPosterClassifierConfig } from "@/lib/poster/query";
import { loadClassifierClassSets } from "@/lib/modelLab/classSets";
import { loadPosterModelMetadataFromDisk } from "@/lib/modelLab/modelMetadata";
import { loadAiAssetsStatus } from "@/lib/modelLab/aiAssetsStatus";
import { ImagePreprocessSection } from "./ImagePreprocessSection";
import { ManifestCheckSection } from "./ManifestCheckSection";
import { ModelEvaluationSection } from "./ModelEvaluationSection";
import { ModelRegistrationSection, type ExistingClassifierRegistration } from "./ModelRegistrationSection";
import { TextAiPreviewSection } from "./TextAiPreviewSection";
import { EmbeddingReferenceBuilderSection } from "./EmbeddingReferenceBuilderSection";

interface RegistrationRowDb {
  model_version: string;
  class_set_id: string;
  registered_at: string;
  profiles: { nickname: string } | null;
  classifier_class_sets: { code: string } | null;
}

/**
 * 실험 도구(가이드 6장, G4) — 관리자 전용, 전부 브라우저에서 실행한다. 이미지는 서버로
 * 보내지 않는다(네이티브 패키지 설치 문제 회피 + 서비스와 완전히 같은 전처리·추론 코드 재사용).
 */
export default async function ModelLabPage() {
  const supabase = await createClient();
  const [posterConfig, classifierClassSets, aiAssetsStatus] = await Promise.all([
    loadPosterClassifierConfig(supabase),
    loadClassifierClassSets(supabase),
    loadAiAssetsStatus(),
  ]);
  const metadata = await loadPosterModelMetadataFromDisk(posterConfig.modelPath);

  let existingRegistration: ExistingClassifierRegistration | null = null;
  if (metadata) {
    const { data } = await supabase
      .from("classifier_model_registrations")
      .select("model_version, class_set_id, registered_at, profiles:registered_by(nickname), classifier_class_sets(code)")
      .eq("model_version", metadata.modelVersion)
      .maybeSingle<RegistrationRowDb>();
    if (data) {
      existingRegistration = {
        modelVersion: data.model_version,
        classSetId: data.class_set_id,
        classSetCode: data.classifier_class_sets?.code ?? "",
        registeredByNickname: data.profiles?.nickname ?? null,
        registeredAt: data.registered_at,
      };
    }
  }

  return (
    <PageContainer>
      <h1 className="mb-1 text-xl font-semibold">실험 도구</h1>
      <p className="mb-4 text-sm text-[var(--color-muted-foreground)]">
        포스터 분류 모델을 학습·평가하는 도구예요. 이미지는 브라우저 안에서만 처리되고 서버로 전송되지 않아요.
      </p>
      <div className="flex flex-col gap-4">
        <ImagePreprocessSection classSets={classifierClassSets} />
        <ManifestCheckSection classSets={classifierClassSets} />
        <ModelRegistrationSection
          metadata={metadata}
          classSets={classifierClassSets}
          existingRegistration={existingRegistration}
        />
        <ModelEvaluationSection posterConfig={posterConfig} isModelRegistered={existingRegistration != null} />
        <TextAiPreviewSection aiAssetsReady={aiAssetsStatus.ocrReady && aiAssetsStatus.embeddingReady} />
        {aiAssetsStatus.embeddingReady && <EmbeddingReferenceBuilderSection />}
      </div>
    </PageContainer>
  );
}
