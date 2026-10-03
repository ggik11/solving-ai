import { describe, expect, it } from "vitest";
import { splitMessageSegments } from "@/lib/chat";

describe("splitMessageSegments", () => {
  it("링크가 없으면 텍스트 세그먼트 하나를 반환한다", () => {
    expect(splitMessageSegments("안녕하세요")).toEqual([{ type: "text", value: "안녕하세요" }]);
  });

  it("http/https 링크를 별도 세그먼트로 분리한다", () => {
    expect(splitMessageSegments("참고: https://smu.ac.kr 확인해줘")).toEqual([
      { type: "text", value: "참고: " },
      { type: "link", value: "https://smu.ac.kr" },
      { type: "text", value: " 확인해줘" },
    ]);
  });

  it("javascript: 같은 다른 스킴은 링크로 인식하지 않고 텍스트로 둔다", () => {
    const segments = splitMessageSegments("javascript:alert(1)");
    expect(segments).toEqual([{ type: "text", value: "javascript:alert(1)" }]);
  });

  it("여러 개의 링크를 모두 분리한다", () => {
    const segments = splitMessageSegments("https://a.com 그리고 https://b.com");
    expect(segments.filter((s) => s.type === "link")).toHaveLength(2);
  });
});
