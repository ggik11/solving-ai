"use client";

import { useState } from "react";
import { PREPROCESS_VERSION, computeSquarePlacement, renderToSquareCanvas } from "@/lib/poster/preprocess";
import { downloadBlob, stripExtension } from "@/lib/modelLab/download";

/** train split 라벨 폴더 이름(가이드 7장 데이터 현실화 절의 4분야). */
const TRAIN_LABELS = ["IT_DATA", "BUSINESS_PLANNING", "DESIGN_MEDIA", "SOCIAL_ENVIRONMENT"] as const;
type TrainLabel = (typeof TRAIN_LABELS)[number];

/**
 * 6.1 학습 이미지 변환(가이드 6.1). 서비스 분석과 완전히 같은 전처리 함수(preprocess.ts)를
 * 그대로 써서, 학습 자료도 서비스가 보는 것과 같은 모양으로 맞춘다(체크리스트 9번). 이미지는
 * 브라우저 밖으로 나가지 않는다 — 라벨별로 고른 train split 이미지를 변환한 뒤, 라벨 폴더로
 * 나눈 zip 하나로 묶어 내려받는다. fflate는 버튼을 누를 때만 동적으로 불러온다.
 */
export function ImagePreprocessSection() {
  const [filesByLabel, setFilesByLabel] = useState<Record<TrainLabel, File[]>>({
    IT_DATA: [],
    BUSINESS_PLANNING: [],
    DESIGN_MEDIA: [],
    SOCIAL_ENVIRONMENT: [],
  });
  const [status, setStatus] = useState<"idle" | "running" | "done">("idle");
  const [progress, setProgress] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);

  const totalFiles = TRAIN_LABELS.reduce((sum, label) => sum + filesByLabel[label].length, 0);

  function handleSelect(label: TrainLabel, fileList: FileList | null) {
    setFilesByLabel((prev) => ({ ...prev, [label]: Array.from(fileList ?? []) }));
  }

  async function handleExportZip() {
    setStatus("running");
    setProgress(0);
    setErrors([]);
    const failed: string[] = [];
    const zipEntries: Record<string, Uint8Array> = {};
    let done = 0;

    for (const label of TRAIN_LABELS) {
      for (const file of filesByLabel[label]) {
        try {
          const bitmap = await createImageBitmap(file);
          const canvas = renderToSquareCanvas(bitmap, { width: bitmap.width, height: bitmap.height });
          computeSquarePlacement({ width: bitmap.width, height: bitmap.height }); // 검증 겸.
          const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
          if (!blob) throw new Error("PNG로 변환하지 못했습니다.");
          const buffer = new Uint8Array(await blob.arrayBuffer());
          zipEntries[`${label}/${stripExtension(file.name)}_${PREPROCESS_VERSION}.png`] = buffer;
        } catch {
          failed.push(`${label}/${file.name}`);
        }
        done++;
        setProgress(done);
      }
    }

    if (Object.keys(zipEntries).length > 0) {
      const { zipSync } = await import("fflate");
      const zipped = zipSync(zipEntries);
      downloadBlob("train-dataset.zip", new Blob([zipped], { type: "application/zip" }));
    }
    setErrors(failed);
    setStatus("done");
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <h2 className="text-sm font-semibold text-[var(--color-muted-foreground)]">6.1 학습 이미지 변환</h2>
      <p className="text-xs text-[var(--color-muted-foreground)]">
        라벨별로 train split 이미지를 고르면 서비스와 같은 전처리({PREPROCESS_VERSION})로 맞춰 라벨 폴더로 나눈 zip
        하나로 내려받아요. 압축을 풀어 티처블 머신에 폴더째 업로드하세요.
      </p>
      {TRAIN_LABELS.map((label) => (
        <label key={label} className="flex flex-col gap-1 text-sm font-medium">
          {label}/ (여러 장)
          <input
            type="file"
            accept="image/*,.webp"
            multiple
            onChange={(e) => handleSelect(label, e.target.files)}
            disabled={status === "running"}
            className="text-sm font-normal"
          />
          {filesByLabel[label].length > 0 && (
            <span className="text-xs font-normal text-[var(--color-muted-foreground)]">
              {filesByLabel[label].length}개 선택됨
            </span>
          )}
        </label>
      ))}
      <button
        type="button"
        onClick={handleExportZip}
        disabled={totalFiles === 0 || status === "running"}
        className="self-start rounded-md bg-[var(--color-brand-600)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {status === "running" ? `변환 중... (${progress}/${totalFiles})` : "라벨별 zip으로 내보내기"}
      </button>
      {status === "done" && (
        <p className="text-sm text-[var(--color-brand-700)]">
          {totalFiles - errors.length}/{totalFiles}개 변환 완료.
        </p>
      )}
      {errors.length > 0 && (
        <p className="text-xs text-[var(--color-danger)]">변환 실패: {errors.join(", ")}</p>
      )}
    </section>
  );
}
