import type { ClassScore } from "./classifier";

/**
 * 모델 로딩·추론 인터페이스. 실제 서비스는 teachableMachineLoader를 쓰고, 테스트는 이 인터페이스를
 * 구현한 목(mock)을 주입한다(가짜 모델/임의 예측값은 테스트에서만 — 9장 G3 지시사항).
 */
export interface LoadedPosterModel {
  /** metadata.json의 labels 그대로. model_class_field_map과의 연결표 일치 검사(가이드 5.1)에 쓴다. */
  labels: string[];
  /**
   * metadata.json에서 읽은 모델 버전(가이드 5.1). 티처블 머신이 내보내는 metadata.json에는
   * 공식적으로 "version" 필드가 없어, 커뮤니티 관례대로 timeStamp(내보낸 시각)를 버전 식별자로
   * 쓴다 — 실제 모델이 생기면 metadata.json 구조를 다시 확인해야 한다(가이드 5.1 메모 그대로,
   * docs/architecture.md에도 기록).
   */
  modelVersion: string;
  predict(canvas: HTMLCanvasElement): Promise<ClassScore[]>;
}

export interface PosterModelLoader {
  /**
   * modelPath(예: "/models/poster-classifier/")에서 model.json/metadata.json을 불러온다.
   * 파일이 없으면(아직 모델 미배포) 던지는 에러를 호출부가 "model_missing"으로 구분할 수 있도록
   * ModelMissingError를 던진다. 그 외 로딩 실패는 일반 Error로 던진다(model_load_error).
   */
  load(modelPath: string): Promise<LoadedPosterModel>;
}

export class ModelMissingError extends Error {
  constructor(message = "모델 파일을 찾을 수 없습니다.") {
    super(message);
    this.name = "ModelMissingError";
  }
}

/** metadata.json이 실제로 존재하는지 먼저 확인한다 — 모델 미배포 상태를 "로딩 실패"와 구분하기 위해서다. */
async function assertMetadataExists(modelPath: string): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${modelPath}metadata.json`, { cache: "no-store" });
  } catch {
    throw new ModelMissingError();
  }
  if (!response.ok) {
    throw new ModelMissingError();
  }
}

/**
 * 공식 @teachablemachine/image 라이브러리로 모델을 불러온다(가이드 5.2 1순위 — 결정 근거는
 * docs/architecture.md 참조). 이 함수 안에서만 동적 import해 다른 페이지 번들에 들어가지 않는다.
 */
export const teachableMachineLoader: PosterModelLoader = {
  async load(modelPath: string): Promise<LoadedPosterModel> {
    await assertMetadataExists(modelPath);

    let tmImage: typeof import("@teachablemachine/image");
    try {
      tmImage = await import("@teachablemachine/image");
    } catch (error) {
      throw new Error(`모델 라이브러리를 불러오지 못했습니다: ${error instanceof Error ? error.message : String(error)}`);
    }

    const modelURL = `${modelPath}model.json`;
    const metadataURL = `${modelPath}metadata.json`;

    let model: Awaited<ReturnType<typeof tmImage.load>>;
    try {
      model = await tmImage.load(modelURL, metadataURL);
    } catch (error) {
      throw new Error(`모델을 불러오지 못했습니다: ${error instanceof Error ? error.message : String(error)}`);
    }

    const metadata = model.getMetadata();
    return {
      labels: model.getClassLabels(),
      modelVersion: metadata.timeStamp ?? "unknown",
      async predict(canvas: HTMLCanvasElement): Promise<ClassScore[]> {
        const predictions = await model.predict(canvas);
        return predictions.map((p) => ({ classId: p.className, score: p.probability }));
      },
    };
  },
};
