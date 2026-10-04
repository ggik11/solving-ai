/**
 * 정기 점검(4/4) — 공개 중인 활동의 원문 링크가 아직 살아있는지, 접수 마감일 근거 문자열이
 * 여전히 페이지에 남아있는지 확인한다. 원문 전문은 저장하지 않으므로(지시서 요구사항) 매번
 * 새로 가져와서 그 자리에서만 검사하고 버린다 — 재검사에 쓰는 것은 등록 시점에 저장해 둔 짧은
 * 근거 문자열(`apply_end_at_evidence`) 하나뿐이다.
 */
import { fetchSinglePage, FetchSinglePageError, type FetchDeps, type SinglePageFetchOptions } from "./fetch";
import { htmlToText } from "./html-text";
import { verifyDateAgainstText } from "./verify";
import { describeFetchError } from "./preview";

export interface LinkCheckInput {
  sourceUrl: string;
  /** 등록 시점에 저장해 둔 "접수 마감일 근거 문자열". 없으면 HTTP 응답만 확인한다. */
  applyEndAtEvidence: string | null;
}

export type LinkCheckResult = { ok: true; resolvedUrl: string } | { ok: false; note: string };

export async function checkActivityLink(
  input: LinkCheckInput,
  deps: FetchDeps = {},
  options: SinglePageFetchOptions = {}
): Promise<LinkCheckResult> {
  let fetched;
  try {
    fetched = await fetchSinglePage(input.sourceUrl, { checkRobots: true, ...options }, deps);
  } catch (err) {
    if (err instanceof FetchSinglePageError) {
      return { ok: false, note: `${err.reason}: ${describeFetchError(err)}` };
    }
    return { ok: false, note: "UNKNOWN_ERROR: 알 수 없는 오류로 점검에 실패했습니다." };
  }

  if (input.applyEndAtEvidence) {
    const pageText = htmlToText(fetched.html);
    if (!verifyDateAgainstText(input.applyEndAtEvidence, pageText)) {
      return { ok: false, note: `DEADLINE_STRING_NOT_FOUND: 원문에서 마감일 문구(“${input.applyEndAtEvidence}”)를 더 이상 찾을 수 없습니다.` };
    }
  }

  return { ok: true, resolvedUrl: fetched.finalUrl };
}
