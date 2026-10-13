"use client";

import { useState } from "react";
import { PREPROCESS_VERSION, computeSquarePlacement, renderToSquareCanvas } from "@/lib/poster/preprocess";
import { downloadBlob, stripExtension } from "@/lib/modelLab/download";

/**
 * 6.1 학습 이미지 변환(가이드 6.1). 서비스 분석과 완전히 같은 전처리 함수(preprocess.ts)를
 * 그대로 써서, 학습 자료도 서비스가 보는 것과 같은 모양으로 맞춘다(체크리스트 9번). 이미지는
 * 브라우저 밖으로 나가지 않는다 — 변환한 PNG를 파일별로 바로 내려받는다(zip 라이브러리를 새로
 * 추가하지 않기 위한 선택 — 결과는 같다. PROGRESS.md 참조).
 */
export function ImagePreprocessSection() {
  const [files, setFiles] = useState<File[]>([]);
  const [status, setStatus] = useState<"idle" | "running" | "done">("idle");
  const [progress, setProgress] = useState(0);
  const [errors, setErrors] = useState<string[]>([]);

  async function handleConvert() {
    setStatus("running");
    setProgress(0);
    setErrors([]);
    const failed: string[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      try {
        const bitmap = await createImageBitmap(file);
        const canvas = renderToSquareCanvas(bitmap, { width: bitmap.width, height: bitmap.height });
        computeSquarePlacement({ width: bitmap.width, height: bitmap.height }); // 검증 겸.
        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
        if (!blob) throw new Error("PNG로 변환하지 못했습니다.");
        downloadBlob(`${stripExtension(file.name)}_${PREPROCESS_VERSION}.png`, blob);
      } catch {
        failed.push(file.name);
      }
      setProgress(i + 1);
    }
    setErrors(failed);
    setStatus("done");
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <h2 className="text-sm font-semibold text-[var(--color-muted-foreground)]">6.1 학습 이미지 변환</h2>
      <p className="text-xs text-[var(--color-muted-foreground)]">
        선택한 이미지를 서비스와 같은 전처리({PREPROCESS_VERSION})로 맞춰 PNG로 내려받아요. 변환한 이미지를 티처블 머신에 업로드하세요.
      </p>
      <label className="flex flex-col gap-1 text-sm font-medium">
        이미지 선택 (여러 장)
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => setFiles(Array.from(e.target.files ?? []))}
          disabled={status === "running"}
          className="text-sm font-normal"
        />
      </label>
      {files.length > 0 && <p className="text-xs text-[var(--color-muted-foreground)]">{files.length}개 선택됨</p>}
      <button
        type="button"
        onClick={handleConvert}
        disabled={files.length === 0 || status === "running"}
        className="self-start rounded-md bg-[var(--color-brand-600)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {status === "running" ? `변환 중... (${progress}/${files.length})` : "변환해서 다운로드"}
      </button>
      {status === "done" && (
        <p className="text-sm text-[var(--color-brand-700)]">
          {files.length - errors.length}/{files.length}개 변환 완료.
        </p>
      )}
      {errors.length > 0 && (
        <p className="text-xs text-[var(--color-danger)]">변환 실패: {errors.join(", ")}</p>
      )}
    </section>
  );
}
