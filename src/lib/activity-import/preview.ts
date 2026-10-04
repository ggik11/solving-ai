/**
 * URL 가져오기 미리보기 조립. 이 파일은 두 겹으로 나뉜다:
 * - `buildPreviewFromHtml` — 순수 함수. 이미 가져온 HTML/후보 목록/기존 활동 목록을 받아
 *   미리보기 데이터를 조립한다(단위 테스트 대상).
 * - `runUrlImportPreview` — 실제 I/O(빈도 제한 RPC, 네트워크 가져오기, 기존 활동 조회, 선택적
 *   LLM 호출)를 수행하는 오케스트레이션. 서버 액션에서만 호출되고, 아래쪽 개별 조각들이 전부
 *   단위 테스트돼 있어 이 함수 자체는 E2E로 검증한다.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchSinglePage, FetchSinglePageError } from "./fetch";
import { extractDateCandidates, extractStructuredData, type DateCandidate } from "./extract";
import { htmlToText } from "./html-text";
import { checkDateRangeIssues, type DateRangeConfig, type DateRangeIssue } from "./verify";
import { findDuplicateCandidates, type DuplicateCandidate, type ExistingActivityForDuplicateCheck } from "./duplicates";
import { normalizeImportUrl } from "./url-normalize";
import { getLlmProvider, type LlmSuggestion } from "./llm";

export interface UrlImportPreviewData {
  normalizedUrl: string;
  finalUrl: string;
  suggestedTitle: string | null;
  suggestedOrgName: string | null;
  suggestedDescription: string | null;
  suggestedTags: string[];
  suggestedActivityType: string | null;
  suggestedEligibility: string | null;
  dateCandidates: DateCandidate[];
  rangeIssues: DateRangeIssue[];
  duplicates: DuplicateCandidate[];
  llmUsed: boolean;
}

export type UrlImportPreviewResult = { ok: true; data: UrlImportPreviewData } | { ok: false; error: string };

function firstNonEmpty(...values: Array<string | null | undefined>): string | null {
  for (const v of values) {
    if (v && v.trim()) return v.trim();
  }
  return null;
}

function extractJsonLdString(jsonLd: Record<string, unknown>[], key: string): string | null {
  for (const node of jsonLd) {
    const value = node[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (value && typeof value === "object" && "name" in (value as Record<string, unknown>)) {
      const name = (value as Record<string, unknown>).name;
      if (typeof name === "string" && name.trim()) return name.trim();
    }
  }
  return null;
}

export function buildPreviewFromHtml(input: {
  normalizedUrl: string;
  finalUrl: string;
  html: string;
  existing: ExistingActivityForDuplicateCheck[];
  dedupeKey: string | null;
  llmSuggestion: LlmSuggestion | null;
  now?: Date;
  dateRangeConfig?: DateRangeConfig;
}): UrlImportPreviewData {
  const structured = extractStructuredData(input.html);
  const pageText = htmlToText(input.html);
  const dateCandidates = extractDateCandidates(pageText, input.now);

  // 규칙 우선: JSON-LD > og: > meta/title. LLM 제안은 규칙 기반 값이 전부 비어 있을 때만 보충한다.
  const ruleTitle = firstNonEmpty(extractJsonLdString(structured.jsonLd, "name"), structured.ogTitle, structured.titleTag);
  const ruleOrgName = extractJsonLdString(structured.jsonLd, "organizer") ?? extractJsonLdString(structured.jsonLd, "publisher");
  const ruleDescription = firstNonEmpty(structured.ogDescription, structured.metaDescription);

  const suggestedTitle = firstNonEmpty(ruleTitle, input.llmSuggestion?.title ?? null);
  const suggestedOrgName = firstNonEmpty(ruleOrgName, input.llmSuggestion?.orgName ?? null);
  const suggestedDescription = firstNonEmpty(ruleDescription, input.llmSuggestion?.eligibilitySummary ?? null);

  const bestEnd = dateCandidates.find((c) => c.role === "apply_end" && c.iso) ?? null;
  const bestStart = dateCandidates.find((c) => c.role === "apply_start" && c.iso) ?? null;
  const rangeIssues = checkDateRangeIssues(
    { applyStartIso: bestStart?.iso ?? null, applyEndIso: bestEnd?.iso ?? null },
    input.dateRangeConfig,
    input.now
  );

  const duplicates = findDuplicateCandidates(
    { dedupeKey: input.dedupeKey, title: suggestedTitle ?? "", orgName: suggestedOrgName },
    input.existing
  );

  return {
    normalizedUrl: input.normalizedUrl,
    finalUrl: input.finalUrl,
    suggestedTitle,
    suggestedOrgName,
    suggestedDescription,
    suggestedTags: input.llmSuggestion?.tags ?? [],
    suggestedActivityType: input.llmSuggestion?.activityType ?? null,
    suggestedEligibility: input.llmSuggestion?.eligibilitySummary ?? null,
    dateCandidates,
    rangeIssues,
    duplicates,
    llmUsed: input.llmSuggestion !== null,
  };
}

/**
 * 실제 가져오기 오케스트레이션. 로그인 사용자라면 누구나 호출 가능(관리자 등록·사용자 제보
 * 화면 둘 다에서 공유) — 등록 권한 자체는 각 서버 액션(승인/초안 생성)이 별도로 검사한다.
 */
export async function runUrlImportPreview(supabase: SupabaseClient, rawUrl: string): Promise<UrlImportPreviewResult> {
  const normalized = normalizeImportUrl(rawUrl);
  if (!normalized.ok) return { ok: false, error: normalized.error };

  const { error: rateLimitError } = await supabase.rpc("check_url_fetch_rate_limit");
  if (rateLimitError) {
    const message = rateLimitError.message.includes("RATE_LIMITED")
      ? "URL 가져오기를 너무 많이 요청했어요. 잠시 후 다시 시도해 주세요."
      : "URL을 가져올 권한이 없어요. 로그인 상태를 확인해 주세요.";
    return { ok: false, error: message };
  }

  let fetched;
  try {
    fetched = await fetchSinglePage(normalized.value.url);
  } catch (err) {
    if (err instanceof FetchSinglePageError) {
      return { ok: false, error: describeFetchError(err) };
    }
    return { ok: false, error: "페이지를 가져오는 중 알 수 없는 오류가 발생했어요." };
  }

  const { data: existingRows } = await supabase.from("activities").select("id, title, org_name, source_url").limit(500);
  const existing: ExistingActivityForDuplicateCheck[] = (existingRows ?? []).map((row) => ({
    id: row.id,
    title: row.title,
    orgName: row.org_name,
    sourceUrl: row.source_url,
  }));

  const llmProvider = getLlmProvider();
  const pageText = htmlToText(fetched.html);
  const llmSuggestion = llmProvider ? await llmProvider.suggest(pageText) : null;

  const data = buildPreviewFromHtml({
    normalizedUrl: normalized.value.url,
    finalUrl: fetched.finalUrl,
    html: fetched.html,
    existing,
    dedupeKey: normalized.value.dedupeKey,
    llmSuggestion,
  });

  return { ok: true, data };
}

function describeFetchError(err: FetchSinglePageError): string {
  switch (err.reason) {
    case "UNSUPPORTED_SCHEME":
      return "http(s) URL만 가져올 수 있어요.";
    case "BLOCKED_HOST":
      return "이 주소는 안전상의 이유로 가져올 수 없어요(내부망/예약된 주소).";
    case "ROBOTS_DISALLOWED":
      return "이 페이지는 robots.txt에서 가져오기를 허용하지 않아요.";
    case "TOO_MANY_REDIRECTS":
      return "리다이렉트가 너무 많아요.";
    case "NON_HTML":
      return "HTML 페이지가 아니에요.";
    case "TIMEOUT":
      return "응답 시간이 초과됐어요. 잠시 후 다시 시도해 주세요.";
    case "TOO_LARGE":
      return "페이지 용량이 너무 커요.";
    case "HTTP_ERROR":
      return `페이지를 가져올 수 없어요(상태 코드 ${err.status ?? "알 수 없음"}).`;
    case "NETWORK_ERROR":
      return "네트워크 오류로 페이지를 가져올 수 없어요.";
    default:
      return "페이지를 가져오는 중 오류가 발생했어요.";
  }
}
