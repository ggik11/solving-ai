import { describe, expect, it } from "vitest";
import { parseOcrCsv } from "@/lib/modelLab/ocrCsv";

const HEADER = "filename,ok,ocr_ms,embed_ms,text";

describe("parseOcrCsv (가이드 12장 — 임베딩 참조 만들기용)", () => {
  it("정상 행을 파싱한다", () => {
    const csv = [HEADER, "a.png,true,100,50,해커톤 모집"].join("\n");
    expect(parseOcrCsv(csv)).toEqual([{ filename: "a.png", ok: true, text: "해커톤 모집" }]);
  });

  it("text 안의 실제 줄바꿈을 보존한다(따옴표로 감싼 필드)", () => {
    const csv = [HEADER, `a.png,true,100,50,"첫째 줄\n둘째 줄"`].join("\n");
    const rows = parseOcrCsv(csv);
    expect(rows).toHaveLength(1);
    expect(rows[0].text).toBe("첫째 줄\n둘째 줄");
  });

  it("따옴표 안의 쉼표도 보존한다", () => {
    const csv = [HEADER, `a.png,true,100,50,"봉사, 교육, 멘토링"`].join("\n");
    expect(parseOcrCsv(csv)[0].text).toBe("봉사, 교육, 멘토링");
  });

  it("이스케이프된 큰따옴표(\"\")를 하나로 되돌린다", () => {
    const csv = [HEADER, `a.png,true,100,50,"그는 ""안녕""이라 했다"`].join("\n");
    expect(parseOcrCsv(csv)[0].text).toBe('그는 "안녕"이라 했다');
  });

  it("ok=false 행도 그대로 읽는다(텍스트가 비어 있을 수 있음)", () => {
    const csv = [HEADER, "b.png,false,0,0,"].join("\n");
    expect(parseOcrCsv(csv)).toEqual([{ filename: "b.png", ok: false, text: "" }]);
  });

  it("여러 행을 순서대로 파싱한다", () => {
    const csv = [HEADER, "a.png,true,1,1,가", "b.png,true,2,2,나"].join("\n");
    const rows = parseOcrCsv(csv);
    expect(rows.map((r) => r.filename)).toEqual(["a.png", "b.png"]);
  });

  it("UTF-8 BOM으로 시작해도 정상 파싱한다", () => {
    const csv = "﻿" + [HEADER, "a.png,true,1,1,가"].join("\n");
    expect(parseOcrCsv(csv)[0].filename).toBe("a.png");
  });

  it("filename/ok/text 컬럼이 없으면 빈 배열이다", () => {
    expect(parseOcrCsv("a,b,c\n1,2,3")).toEqual([]);
  });

  it("빈 문자열이면 빈 배열이다", () => {
    expect(parseOcrCsv("")).toEqual([]);
  });
});
