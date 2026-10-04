/**
 * 가져오기 URL 정규화. "입력한 URL을 정규화해서 그대로 저장"하는 데 쓰는 순수 함수 —
 * 추측으로 경로를 바꾸거나 쿼리스트링을 지우지 않고, `URL` 표준 정규화(퍼센트 인코딩 통일,
 * 기본 포트 제거, 호스트 소문자화 등)만 적용한다. 중복 후보 탐지용 "느슨한 키"는 별도로 제공한다.
 */

export interface NormalizedImportUrl {
  /** 저장할 정규화된 URL(그대로 DB에 저장). */
  url: string;
  /** 중복 후보 탐지에 쓰는 느슨한 키(스킴 무시, www. 제거, 끝 슬래시 제거, 소문자). */
  dedupeKey: string;
}

export type NormalizeUrlResult = { ok: true; value: NormalizedImportUrl } | { ok: false; error: string };

export function normalizeImportUrl(raw: string): NormalizeUrlResult {
  const trimmed = raw.trim();
  if (!trimmed) return { ok: false, error: "URL을 입력해 주세요." };

  let parsed: URL;
  try {
    parsed = new URL(trimmed);
  } catch {
    return { ok: false, error: "올바른 URL 형식이 아니에요." };
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, error: "http(s) URL만 가져올 수 있어요." };
  }

  const url = parsed.toString();
  const dedupeKey = buildDedupeKey(parsed);
  return { ok: true, value: { url, dedupeKey } };
}

export function buildDedupeKey(url: URL): string {
  const host = url.hostname.toLowerCase().replace(/^www\./, "");
  const path = url.pathname.replace(/\/+$/, "").toLowerCase();
  return `${host}${path}`;
}

/** 이미 알고 있는(저장된) URL 문자열로부터도 같은 방식으로 dedupe 키를 뽑는다. */
export function dedupeKeyOf(rawUrl: string | null | undefined): string | null {
  if (!rawUrl) return null;
  try {
    return buildDedupeKey(new URL(rawUrl));
  } catch {
    return null;
  }
}
