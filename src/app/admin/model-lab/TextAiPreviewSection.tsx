"use client";

import { useEffect, useRef, useState } from "react";
import { recognizeImageText, terminateOcrWorker } from "@/lib/poster/ocr";
import { normalizeText } from "@/lib/poster/textNormalize";
import { embedTexts, getEmbeddingModelId, getEmbeddingModelLoadDurationMs } from "@/lib/poster/textEmbedding";
import { downloadTextFile } from "@/lib/modelLab/download";

interface RowResult {
  filename: string;
  ok: boolean;
  ocrMs: number;
  embedMs: number | null;
  text: string;
}

function csvEscape(value: string): string {
  return /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
}

function buildCsv(rows: RowResult[]): string {
  const header = ["filename", "ok", "ocr_ms", "embed_ms", "text"];
  const lines = rows.map((r) =>
    [r.filename, String(r.ok), String(Math.round(r.ocrMs)), r.embedMs == null ? "" : String(Math.round(r.embedMs)), csvEscape(r.text)].join(",")
  );
  return [header.join(","), ...lines].join("\n");
}

/**
 * 포스터 2차 후처리 P1(가이드 8장) — OCR과 문장 임베딩이 브라우저에서 실제로 동작하는지
 * 확인하는 미리보기. 키워드 사전·점수 결합·DB 저장은 이 단계 범위가 아니다 — 파일명·시간·글자만
 * 화면에 보여주고 CSV로 내려받게 한다. 이미지와 텍스트는 서버로 보내지 않는다.
 */
export function TextAiPreviewSection({ aiAssetsReady }: { aiAssetsReady: boolean }) {
  const [files, setFiles] = useState<File[]>([]);
  const [status, setStatus] = useState<"idle" | "running" | "done">("idle");
  const [progress, setProgress] = useState(0);
  const [rows, setRows] = useState<RowResult[]>([]);
  const [modelInfo, setModelInfo] = useState<{ name: string; loadMs: number } | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    return () => {
      cancelledRef.current = true;
      void terminateOcrWorker();
    };
  }, []);

  async function handleRun() {
    setStatus("running");
    setProgress(0);
    setRows([]);
    setModelInfo(null);
    cancelledRef.current = false;

    const results: RowResult[] = [];
    for (let i = 0; i < files.length; i++) {
      if (cancelledRef.current) break;
      const file = files[i];
      const ocr = await recognizeImageText(file);
      const { normalized } = normalizeText(ocr.text);

      let embedMs: number | null = null;
      if (normalized.length > 0) {
        const embedStart = performance.now();
        const vectors = await embedTexts([normalized]);
        embedMs = performance.now() - embedStart;
        if (vectors && !modelInfo) {
          const loadMs = getEmbeddingModelLoadDurationMs();
          if (loadMs != null) setModelInfo({ name: getEmbeddingModelId(), loadMs });
        }
      }

      results.push({ filename: file.name, ok: ocr.ok, ocrMs: ocr.durationMs, embedMs, text: ocr.text });
      setRows([...results]);
      setProgress(i + 1);
    }

    setStatus("done");
  }

  if (!aiAssetsReady) {
    return (
      <section className="flex flex-col gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
        <h2 className="text-sm font-semibold text-[var(--color-muted-foreground)]">텍스트 AI 미리보기</h2>
        <p className="text-sm text-[var(--color-danger)]">
          AI 파일이 없습니다. <code>npm run fetch:ai-assets</code>를 실행하세요.
        </p>
        <p className="text-xs text-[var(--color-muted-foreground)]">
          이 파일이 없어도 티처블 머신(TM) 분석은 그대로 동작해요 — 이 미리보기만 OCR·임베딩 파일을 기다려요.
        </p>
      </section>
    );
  }

  return (
    <section className="flex flex-col gap-3 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-4">
      <h2 className="text-sm font-semibold text-[var(--color-muted-foreground)]">텍스트 AI 미리보기</h2>
      <p className="text-xs text-[var(--color-muted-foreground)]">
        이미지를 고르면 하나씩 OCR → 텍스트 정리 → 임베딩을 돌려요. 전부 브라우저 안에서만 처리되고 서버로 보내지
        않아요. 키워드 사전·점수 결합은 아직 붙이지 않았어요(기반 단계).
      </p>
      <p className="text-xs font-medium text-[var(--color-danger)]">
        평가용(test) 사진은 넣지 마세요 — 키워드 사전과 텍스트 기준은 학습용 사진으로만 만듭니다.
      </p>

      {modelInfo && (
        <p className="text-xs text-[var(--color-muted-foreground)]">
          임베딩 모델: {modelInfo.name} (로딩 {Math.round(modelInfo.loadMs)}ms · 이미지당 OCR 시간에는 tesseract.js
          worker 최초 로딩 시간이 포함돼요)
        </p>
      )}

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
        onClick={handleRun}
        disabled={files.length === 0 || status === "running"}
        className="self-start rounded-md bg-[var(--color-brand-600)] px-4 py-2 text-sm font-medium text-white disabled:opacity-60"
      >
        {status === "running" ? `처리 중... (${progress}/${files.length})` : "OCR·임베딩 실행"}
      </button>

      {rows.length > 0 && (
        <div className="flex flex-col gap-2">
          <table className="text-xs">
            <thead>
              <tr className="text-left text-[var(--color-muted-foreground)]">
                <th className="pr-3">파일명</th>
                <th className="pr-3">OCR</th>
                <th className="pr-3">OCR 시간</th>
                <th className="pr-3">임베딩 시간</th>
                <th>읽힌 글자</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={`${r.filename}-${i}`}>
                  <td className="max-w-[10rem] truncate pr-3">{r.filename}</td>
                  <td className="pr-3">{r.ok ? "성공" : "실패"}</td>
                  <td className="pr-3">{Math.round(r.ocrMs)}ms</td>
                  <td className="pr-3">{r.embedMs == null ? "-" : `${Math.round(r.embedMs)}ms`}</td>
                  <td className="max-w-[20rem] truncate">{r.text || "(없음)"}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <button
            type="button"
            onClick={() => downloadTextFile("text-ai-preview.csv", buildCsv(rows), "text/csv")}
            disabled={status === "running"}
            className="self-start rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs disabled:opacity-60"
          >
            결과 CSV 다운로드
          </button>
        </div>
      )}
    </section>
  );
}
