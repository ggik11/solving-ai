"use client";

import { useState } from "react";
import { embedTexts, getEmbeddingModelId } from "@/lib/poster/textEmbedding";
import {
  cleanTextForEmbedding,
  REFERENCE_VERSION,
  type EmbeddingReference,
  type EmbeddingReferenceItem,
} from "@/lib/poster/embeddingClassifier";
import { parseManifestCsv } from "@/lib/modelLab/manifest";
import { parseOcrCsv } from "@/lib/modelLab/ocrCsv";
import { downloadTextFile, basename, stripExtension } from "@/lib/modelLab/download";

interface FieldDescriptionsFile {
  version: string;
  classes: Record<string, { name: string; description: string }>;
}

/** 한 번에 너무 많은(또는 긴) 텍스트를 임베딩하면 WASM 메모리 한도를 넘어 실패한다
 * (padding="true"가 배치 안 가장 긴 문장에 맞춰 전부 패딩하기 때문) — 작게 나눠 돌린다. */
const EMBED_BATCH_SIZE = 16;

async function embedInBatches(texts: string[]): Promise<number[][] | null> {
  const vectors: number[][] = [];
  for (let i = 0; i < texts.length; i += EMBED_BATCH_SIZE) {
    const batch = texts.slice(i, i + EMBED_BATCH_SIZE);
    const batchVectors = await embedTexts(batch);
    if (!batchVectors) return null;
    vectors.push(...batchVectors);
  }
  return vectors;
}

/**
 * 2-B 임베딩 분류의 참조 세트(가이드 12장 2번)를 브라우저에서 만든다 — 분야 설명문 + 학습용
 * 포스터 OCR 텍스트를 임베딩해 public/models/text-reference/reference-v1.json으로 내려받는다.
 * 벡터만 저장하므로(원문 텍스트는 넣지 않는다) 커밋해도 된다. manifest.csv로 각 OCR 행이 실제로
 * train split인지 확인하고, train이 아니거나 manifest에 없는 행이 섞여 있으면 전체를 거부한다
 * (test 사진이 참조 세트에 들어가는 것을 막는 안전장치, 가이드 12.3 공정성 원칙).
 */
export function EmbeddingReferenceBuilderSection() {
  const [descriptionsFile, setDescriptionsFile] = useState<File | null>(null);
  const [ocrFiles, setOcrFiles] = useState<File[]>([]);
  const [manifestFile, setManifestFile] = useState<File | null>(null);
  const [status, setStatus] = useState<"idle" | "running" | "done" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<{ label: string; count: number }[] | null>(null);

  async function handleBuild() {
    if (!descriptionsFile || !manifestFile || ocrFiles.length === 0) return;
    setStatus("running");
    setError(null);
    setSummary(null);

    try {
      const descriptions = JSON.parse(await descriptionsFile.text()) as FieldDescriptionsFile;
      const classEntries = Object.entries(descriptions.classes ?? {});
      if (classEntries.length === 0) {
        throw new Error("분야 설명문 JSON에 classes가 없어요.");
      }

      const { rows: manifestRows, errors: manifestErrors } = parseManifestCsv(await manifestFile.text());
      if (manifestErrors.length > 0) {
        throw new Error(`manifest.csv 형식 오류: ${manifestErrors[0].message}`);
      }
      const splitByFilename = new Map<string, string>();
      for (const row of manifestRows) {
        splitByFilename.set(basename(row.imagePath), row.split);
      }

      // 1) manifest로 train split만 섞여 있는지 먼저 전부 확인한다 — 하나라도 어긋나면 통째로 거부.
      const violations: string[] = [];
      const trainTexts: { label: string; text: string }[] = [];
      for (const file of ocrFiles) {
        const label = stripExtension(file.name);
        const rows = parseOcrCsv(await file.text());
        for (const row of rows) {
          const split = splitByFilename.get(basename(row.filename));
          if (split === undefined) {
            violations.push(`${label}/${row.filename}: manifest.csv에 없음`);
            continue;
          }
          if (split !== "train") {
            violations.push(`${label}/${row.filename}: split=${split} (train 아님)`);
            continue;
          }
          const cleaned = cleanTextForEmbedding(row.text);
          if (cleaned) {
            trainTexts.push({ label, text: cleaned });
          }
        }
      }
      if (violations.length > 0) {
        throw new Error(
          `train split이 아니거나 manifest에 없는 행이 섞여 있어요(${violations.length}건). 예: ${violations.slice(0, 5).join(", ")}`
        );
      }
      if (trainTexts.length === 0) {
        throw new Error("임베딩할 학습용 OCR 텍스트가 없어요(정리 후 전부 비어 있음).");
      }

      // 2) 분야 설명문 + 학습용 OCR 텍스트를 임베딩한다(나눠서 — 한 번에 너무 많이 돌리면
      // WASM이 메모리 부족으로 실패한다, cleanTextForEmbedding과 같은 정리를 거쳐 일관성도 맞춘다).
      const descriptionTexts = classEntries.map(([, c]) => cleanTextForEmbedding(c.description) ?? c.description);
      const allTexts = [...descriptionTexts, ...trainTexts.map((t) => t.text)];
      const vectors = await embedInBatches(allTexts);
      if (!vectors) {
        throw new Error("임베딩 모델을 불러오지 못했어요. npm run fetch:ai-assets를 실행했는지 확인하세요.");
      }

      const items: EmbeddingReferenceItem[] = [
        ...classEntries.map(([classId], i) => ({ label: classId, source: "description" as const, vector: vectors[i] })),
        ...trainTexts.map((t, i) => ({ label: t.label, source: "train" as const, vector: vectors[descriptionTexts.length + i] })),
      ];

      const reference: EmbeddingReference = { version: REFERENCE_VERSION, model: getEmbeddingModelId(), items };
      downloadTextFile(`${REFERENCE_VERSION}.json`, JSON.stringify(reference, null, 2), "application/json");

      const counts = new Map<string, number>();
      for (const item of items) counts.set(item.label, (counts.get(item.label) ?? 0) + 1);
      setSummary([...counts.entries()].map(([label, count]) => ({ label, count })));
      setStatus("done");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setStatus("error");
    }
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <h2 className="text-sm font-semibold text-[var(--color-muted-foreground)]">임베딩 참조 만들기</h2>
      <p className="text-xs text-[var(--color-muted-foreground)]">
        분야 설명문과 학습용 포스터 OCR 텍스트(csv)를 임베딩해 reference-v1.json을 만들어요. manifest.csv로 전부
        train split인지 확인하고, 아니면 통째로 거부해요(test 사진이 섞이는 것을 막는 안전장치). 벡터만 들어 있어
        커밋해도 돼요.
      </p>

      <label className="flex flex-col gap-1 text-sm font-medium">
        분야 설명문 JSON (field-descriptions-v1.json)
        <input
          type="file"
          accept=".json,application/json"
          onChange={(e) => setDescriptionsFile(e.target.files?.[0] ?? null)}
          disabled={status === "running"}
          className="text-sm font-normal"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        학습용 OCR 결과 CSV (파일명이 라벨, 예: IT_ENGINEERING.csv — 여러 개 선택)
        <input
          type="file"
          accept=".csv,text/csv"
          multiple
          onChange={(e) => setOcrFiles(Array.from(e.target.files ?? []))}
          disabled={status === "running"}
          className="text-sm font-normal"
        />
        {ocrFiles.length > 0 && <span className="text-xs font-normal text-[var(--color-muted-foreground)]">{ocrFiles.length}개 선택됨</span>}
      </label>
      <label className="flex flex-col gap-1 text-sm font-medium">
        manifest.csv (split 확인용)
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(e) => setManifestFile(e.target.files?.[0] ?? null)}
          disabled={status === "running"}
          className="text-sm font-normal"
        />
      </label>

      <button
        type="button"
        onClick={handleBuild}
        disabled={!descriptionsFile || !manifestFile || ocrFiles.length === 0 || status === "running"}
        className="self-start rounded-md bg-[var(--color-brand-600)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {status === "running" ? "만드는 중... (임베딩 모델 로딩 포함)" : "reference-v1.json 만들기"}
      </button>

      {error && <p className="text-xs text-[var(--color-danger)]">{error}</p>}
      {status === "done" && summary && (
        <div className="text-xs text-[var(--color-brand-700)]">
          <p>만들어서 내려받았어요 — 총 {summary.reduce((sum, s) => sum + s.count, 0)}개 벡터.</p>
          <ul className="list-inside list-disc text-[var(--color-muted-foreground)]">
            {summary.map((s) => (
              <li key={s.label}>
                {s.label}: {s.count}개
              </li>
            ))}
          </ul>
          <p className="mt-1">
            내려받은 파일을 <code>public/models/text-reference/reference-v1.json</code>에 넣으면 2-B 임베딩 분류가
            켜져요.
          </p>
        </div>
      )}
    </section>
  );
}
