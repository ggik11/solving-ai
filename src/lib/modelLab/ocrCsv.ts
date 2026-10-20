/**
 * "텍스트 AI 미리보기"(가이드 8/12장)가 내려주는 CSV(filename,ok,ocr_ms,embed_ms,text)를
 * 다시 읽는다 — "임베딩 참조 만들기"가 학습용 포스터의 OCR 텍스트를 가져오는 용도(가이드 12장
 * 2번). text 칸은 OCR 줄바꿈이 그대로 들어 있어 따옴표 안에 실제 개행이 섞인다 — 줄 단위로
 * 쪼개는 단순 파서로는 깨지므로, 전체 텍스트를 문자 단위로 훑는 파서를 쓴다.
 */

export interface OcrCsvRow {
  filename: string;
  ok: boolean;
  text: string;
}

/** RFC4180과 비슷하게 따옴표 안의 쉼표·줄바꿈·이스케이프된 "" 를 지원하는 최소 CSV 파서. */
function parseCsvTable(csvText: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  let sawAnything = false;
  const text = csvText.replace(/^﻿/, "");

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      sawAnything = true;
    } else if (ch === ",") {
      row.push(field);
      field = "";
      sawAnything = true;
    } else if (ch === "\r") {
      // 줄바꿈은 \n에서 처리 — \r은 건너뛴다.
    } else if (ch === "\n") {
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
      sawAnything = false;
    } else {
      field += ch;
      sawAnything = true;
    }
  }
  if (sawAnything || field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows.filter((r) => !(r.length === 1 && r[0].trim() === ""));
}

export function parseOcrCsv(csvText: string): OcrCsvRow[] {
  const table = parseCsvTable(csvText);
  if (table.length === 0) return [];
  const header = table[0].map((h) => h.trim());
  const filenameIdx = header.indexOf("filename");
  const okIdx = header.indexOf("ok");
  const textIdx = header.indexOf("text");
  if (filenameIdx === -1 || okIdx === -1 || textIdx === -1) return [];

  const rows: OcrCsvRow[] = [];
  for (let i = 1; i < table.length; i++) {
    const cells = table[i];
    const filename = cells[filenameIdx]?.trim() ?? "";
    if (!filename) continue;
    rows.push({
      filename,
      ok: cells[okIdx]?.trim() === "true",
      text: cells[textIdx] ?? "",
    });
  }
  return rows;
}
