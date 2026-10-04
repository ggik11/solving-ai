import { describe, expect, it } from "vitest";
import { AnthropicExtractionProvider, getLlmProvider } from "@/lib/activity-import/llm";

describe("getLlmProvider — 환경변수 기반 켜짐/꺼짐", () => {
  it("API 키가 없으면 null(꺼짐)을 반환한다", () => {
    expect(getLlmProvider({})).toBeNull();
  });

  it("키가 있으면 기본 공급자(anthropic)를 반환한다", () => {
    const provider = getLlmProvider({ ACTIVITY_IMPORT_LLM_API_KEY: "sk-test" });
    expect(provider).toBeInstanceOf(AnthropicExtractionProvider);
  });

  it("알 수 없는 공급자 이름이면 안전하게 꺼짐으로 처리한다", () => {
    expect(getLlmProvider({ ACTIVITY_IMPORT_LLM_API_KEY: "sk-test", ACTIVITY_IMPORT_LLM_PROVIDER: "unknown" })).toBeNull();
  });
});

function fakeFetchReturning(text: string, ok = true): typeof fetch {
  return (async () =>
    new Response(JSON.stringify({ content: [{ type: "text", text }] }), {
      status: ok ? 200 : 500,
    })) as unknown as typeof fetch;
}

describe("AnthropicExtractionProvider.suggest — 날짜는 절대 받지 않고, 실패해도 throw하지 않는다", () => {
  it("정상 JSON 응답을 파싱해 후보를 반환한다", async () => {
    const fetchImpl = fakeFetchReturning(
      JSON.stringify({ title: "제목 후보", orgName: "주최기관 후보", tags: ["IT", "창업"] })
    );
    const provider = new AnthropicExtractionProvider("sk-test", "model", fetchImpl);
    const result = await provider.suggest("페이지 본문 텍스트");
    expect(result).toEqual({ title: "제목 후보", orgName: "주최기관 후보", tags: ["IT", "창업"] });
  });

  it("마크다운 코드블록으로 감싸진 JSON도 파싱한다", async () => {
    const fetchImpl = fakeFetchReturning('```json\n{"title": "코드블록 제목"}\n```');
    const provider = new AnthropicExtractionProvider("sk-test", "model", fetchImpl);
    const result = await provider.suggest("텍스트");
    expect(result).toEqual({ title: "코드블록 제목" });
  });

  it("응답에 날짜 관련 필드가 와도 무시한다(스키마에 없는 필드는 버림)", async () => {
    const fetchImpl = fakeFetchReturning(JSON.stringify({ title: "제목", applyEndAt: "2099-01-01" }));
    const provider = new AnthropicExtractionProvider("sk-test", "model", fetchImpl);
    const result = await provider.suggest("텍스트");
    expect(result).toEqual({ title: "제목" });
    expect(result).not.toHaveProperty("applyEndAt");
  });

  it("HTTP 오류 응답이면 null을 반환한다(throw하지 않음)", async () => {
    const fetchImpl = fakeFetchReturning("무시됨", false);
    const provider = new AnthropicExtractionProvider("sk-test", "model", fetchImpl);
    await expect(provider.suggest("텍스트")).resolves.toBeNull();
  });

  it("네트워크 오류가 나도 null을 반환한다(throw하지 않음)", async () => {
    const fetchImpl = (async () => {
      throw new Error("network down");
    }) as unknown as typeof fetch;
    const provider = new AnthropicExtractionProvider("sk-test", "model", fetchImpl);
    await expect(provider.suggest("텍스트")).resolves.toBeNull();
  });

  it("JSON이 아닌 응답이면 null을 반환한다", async () => {
    const fetchImpl = fakeFetchReturning("이건 그냥 설명 텍스트입니다, JSON이 아님");
    const provider = new AnthropicExtractionProvider("sk-test", "model", fetchImpl);
    await expect(provider.suggest("텍스트")).resolves.toBeNull();
  });

  it("빈 객체({})만 왔으면 null을 반환한다", async () => {
    const fetchImpl = fakeFetchReturning("{}");
    const provider = new AnthropicExtractionProvider("sk-test", "model", fetchImpl);
    await expect(provider.suggest("텍스트")).resolves.toBeNull();
  });
});
