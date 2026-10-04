import { describe, expect, it } from "vitest";
import { htmlToText } from "@/lib/activity-import/html-text";

describe("htmlToText", () => {
  it("script/style를 제거하고 태그를 걷어낸다", () => {
    const html = `<html><head><style>.a{color:red}</style></head><body><script>var x=1;</script><h1>제목</h1><p>본문 내용</p></body></html>`;
    const text = htmlToText(html);
    expect(text).not.toContain("color:red");
    expect(text).not.toContain("var x=1");
    expect(text).toContain("제목");
    expect(text).toContain("본문 내용");
  });

  it("블록 태그 경계를 개행으로 보존한다", () => {
    const html = `<p>첫 문단</p><p>둘째 문단</p>`;
    const text = htmlToText(html);
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    expect(lines).toContain("첫 문단");
    expect(lines).toContain("둘째 문단");
  });

  it("HTML 엔티티를 디코딩한다", () => {
    const html = `<p>A&amp;B &lt;tag&gt; &nbsp;끝&#44;나</p>`;
    const text = htmlToText(html);
    expect(text).toContain("A&B");
    expect(text).toContain("<tag>");
    expect(text).toContain("끝,나");
  });

  it("주석을 제거한다", () => {
    const html = `<p>보임</p><!-- 숨김 주석 --><p>또보임</p>`;
    const text = htmlToText(html);
    expect(text).not.toContain("숨김 주석");
    expect(text).toContain("보임");
    expect(text).toContain("또보임");
  });
});
