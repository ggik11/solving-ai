/**
 * LLM 보조는 선택 기능이다 — 환경변수에 API 키가 있을 때만 켜지고(서비스 키 1개, 사용자 키
 * 입력 없음), 키가 없거나 호출이 실패해도 규칙 기반 추출 + 수동 입력만으로 등록이 되어야 한다.
 * **날짜는 절대 LLM에 묻지 않는다** — 제목/주최기관/태그/유형/자격 요약 후보만 제안받고,
 * 이 결과도 전부 "후보"일 뿐 운영자가 미리보기에서 확인·수정해야 반영된다.
 *
 * 공급자를 교체할 수 있도록 인터페이스로 추상화했다. 기본 제공 구현은 Anthropic Messages API를
 * 쓰지만, 실제 HTTP 호출은 주입 가능해(테스트가 네트워크 없이 성공/실패 경로를 검증한다) 다른
 * 공급자로 바꾸려면 이 인터페이스만 구현하면 된다.
 */

export interface LlmSuggestion {
  title?: string;
  orgName?: string;
  tags?: string[];
  activityType?: string;
  eligibilitySummary?: string;
}

export interface LlmExtractionProvider {
  /** 페이지 평문을 넣고 후보를 받는다. 실패하면(네트워크 오류, 이상한 응답 등) null — 절대 throw하지 않는다. */
  suggest(pageText: string): Promise<LlmSuggestion | null>;
}

const SYSTEM_PROMPT = [
  "당신은 대외활동 공고 페이지의 텍스트에서 메타데이터 후보만 제안하는 보조자입니다.",
  "반드시 지켜야 할 규칙:",
  "- 날짜(접수 시작/마감, 활동 기간)는 절대 포함하지 마세요. 날짜는 별도의 규칙 기반 로직이 처리합니다.",
  "- 본문에 명시적으로 근거가 없는 정보는 추측해서 만들어내지 마세요. 모르면 그 필드를 비워두세요.",
  "- 반드시 JSON 객체 하나만 출력하세요. 다른 설명 텍스트를 붙이지 마세요.",
  '- 스키마: {"title"?: string, "orgName"?: string, "tags"?: string[], "activityType"?: string, "eligibilitySummary"?: string}',
].join("\n");

function extractJsonObject(text: string): unknown {
  const fencedMatch = /```(?:json)?\s*([\s\S]*?)```/i.exec(text);
  const body = fencedMatch ? fencedMatch[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start === -1 || end === -1 || end < start) throw new Error("no JSON object found");
  return JSON.parse(body.slice(start, end + 1));
}

function sanitizeSuggestion(value: unknown): LlmSuggestion | null {
  if (!value || typeof value !== "object") return null;
  const obj = value as Record<string, unknown>;
  const suggestion: LlmSuggestion = {};
  if (typeof obj.title === "string" && obj.title.trim()) suggestion.title = obj.title.trim();
  if (typeof obj.orgName === "string" && obj.orgName.trim()) suggestion.orgName = obj.orgName.trim();
  if (typeof obj.activityType === "string" && obj.activityType.trim()) suggestion.activityType = obj.activityType.trim();
  if (typeof obj.eligibilitySummary === "string" && obj.eligibilitySummary.trim()) {
    suggestion.eligibilitySummary = obj.eligibilitySummary.trim();
  }
  if (Array.isArray(obj.tags)) {
    const tags = obj.tags.filter((t): t is string => typeof t === "string" && t.trim().length > 0).map((t) => t.trim());
    if (tags.length > 0) suggestion.tags = tags;
  }
  return Object.keys(suggestion).length > 0 ? suggestion : null;
}

const MAX_INPUT_CHARS = 6000;

export class AnthropicExtractionProvider implements LlmExtractionProvider {
  constructor(
    private readonly apiKey: string,
    private readonly model: string = "claude-haiku-4-5-20251001",
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  async suggest(pageText: string): Promise<LlmSuggestion | null> {
    try {
      const response = await this.fetchImpl("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": this.apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: 512,
          system: SYSTEM_PROMPT,
          messages: [{ role: "user", content: pageText.slice(0, MAX_INPUT_CHARS) }],
        }),
      });
      if (!response.ok) return null;
      const data = (await response.json()) as { content?: Array<{ type: string; text?: string }> };
      const text = data.content?.find((block) => block.type === "text")?.text;
      if (!text) return null;
      return sanitizeSuggestion(extractJsonObject(text));
    } catch {
      // 네트워크 오류·타임아웃·JSON 파싱 실패 등 어떤 이유로든 LLM 보조는 "꺼진 것"과 동일하게
      // 취급한다 — 규칙 기반 추출/수동 입력으로 등록이 계속 가능해야 한다.
      return null;
    }
  }
}

export interface LlmProviderEnv {
  ACTIVITY_IMPORT_LLM_API_KEY?: string;
  ACTIVITY_IMPORT_LLM_PROVIDER?: string;
  ACTIVITY_IMPORT_LLM_MODEL?: string;
  // process.env(NodeJS.ProcessEnv)를 그대로 기본값으로 쓸 수 있도록 인덱스 시그니처를 맞춘다.
  [key: string]: string | undefined;
}

/** 환경변수에 키가 없으면 null(꺼짐) — 호출자는 null을 "LLM 없이 계속 진행"으로 처리해야 한다. */
export function getLlmProvider(env: LlmProviderEnv = process.env): LlmExtractionProvider | null {
  const apiKey = env.ACTIVITY_IMPORT_LLM_API_KEY;
  if (!apiKey) return null;
  const providerName = env.ACTIVITY_IMPORT_LLM_PROVIDER ?? "anthropic";
  if (providerName === "anthropic") {
    return new AnthropicExtractionProvider(apiKey, env.ACTIVITY_IMPORT_LLM_MODEL);
  }
  // 알 수 없는 공급자 이름 => 안전한 기본값(꺼짐)으로 되돌린다.
  return null;
}
