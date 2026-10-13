import { describe, expect, it } from "vitest";
import { basename, stripExtension } from "@/lib/modelLab/download";

describe("stripExtension", () => {
  it("확장자를 뗀다", () => {
    expect(stripExtension("poster.png")).toBe("poster");
  });
  it("확장자가 없으면 그대로 반환한다", () => {
    expect(stripExtension("poster")).toBe("poster");
  });
  it("숨김 파일(.gitignore처럼 점으로 시작)은 그대로 반환한다", () => {
    expect(stripExtension(".gitignore")).toBe(".gitignore");
  });
});

describe("basename", () => {
  it("경로에서 파일 이름만 뗀다", () => {
    expect(basename("posters/IT_DATA/e001_a.png")).toBe("e001_a.png");
  });
  it("경로 구분자가 없으면 그대로 반환한다", () => {
    expect(basename("e001_a.png")).toBe("e001_a.png");
  });
});
