/**
 * 규칙 기반 추출(지시서: "규칙 우선, AI는 선택"). 전부 순수 함수 — 네트워크 접근이 없어
 * 저장해 둔 HTML 문자열로 단위 테스트할 수 있다.
 *
 * 1. extractStructuredData — JSON-LD/meta/title 같은 구조화 데이터.
 * 2. extractDateCandidates — 한국어 날짜 형식을 규칙 기반으로 찾고, 각 후보에 "근거 문장"을
 *    함께 반환한다. 연도가 본문에 없으면 추정하되(가장 가까운 미래로) `yearInferred`로 표시해
 *    "AI가 날짜를 만들어낸 것"과 구분한다 — 이 추정도 결정적 규칙이고, 최종 저장 전 운영자가
 *    반드시 미리보기에서 확인·수정한다.
 */
import { htmlToText } from "./html-text";

export interface StructuredData {
  jsonLd: Record<string, unknown>[];
  ogTitle: string | null;
  ogDescription: string | null;
  metaDescription: string | null;
  titleTag: string | null;
  canonicalUrl: string | null;
}

function extractAttr(tag: string, name: string): string | null {
  const re = new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i");
  const match = re.exec(tag);
  if (!match) return null;
  return match[2] ?? match[3] ?? null;
}

function flattenJsonLd(value: unknown, out: Record<string, unknown>[]): void {
  if (Array.isArray(value)) {
    for (const item of value) flattenJsonLd(item, out);
    return;
  }
  if (value && typeof value === "object") {
    const obj = value as Record<string, unknown>;
    out.push(obj);
    if (Array.isArray(obj["@graph"])) flattenJsonLd(obj["@graph"], out);
  }
}

export function extractStructuredData(html: string): StructuredData {
  const jsonLd: Record<string, unknown>[] = [];
  const scriptRe = /<script[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let scriptMatch: RegExpExecArray | null;
  while ((scriptMatch = scriptRe.exec(html))) {
    try {
      const parsed = JSON.parse(scriptMatch[1].trim());
      flattenJsonLd(parsed, jsonLd);
    } catch {
      // 잘못된 JSON-LD는 조용히 무시한다(이 블록만 못 쓰는 것이지 전체 추출 실패는 아니다).
    }
  }

  let ogTitle: string | null = null;
  let ogDescription: string | null = null;
  let metaDescription: string | null = null;
  const metaRe = /<meta\s+[^>]*>/gi;
  let metaMatch: RegExpExecArray | null;
  while ((metaMatch = metaRe.exec(html))) {
    const tag = metaMatch[0];
    const property = extractAttr(tag, "property")?.toLowerCase();
    const name = extractAttr(tag, "name")?.toLowerCase();
    const content = extractAttr(tag, "content");
    if (content == null) continue;
    if (property === "og:title") ogTitle = content;
    else if (property === "og:description") ogDescription = content;
    else if (name === "description") metaDescription = content;
  }

  const titleMatch = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const titleTag = titleMatch ? titleMatch[1].trim() : null;

  const canonicalMatch = /<link\s+[^>]*rel\s*=\s*["']canonical["'][^>]*>/i.exec(html);
  const canonicalUrl = canonicalMatch ? extractAttr(canonicalMatch[0], "href") : null;

  return { jsonLd, ogTitle, ogDescription, metaDescription, titleTag, canonicalUrl };
}

export type DateRole = "apply_start" | "apply_end" | "unknown";

export interface DateCandidate {
  /** 원문에 실제로 있던 문자열(근거) — 검증은 항상 이 값을 원문과 대조한다. */
  raw: string;
  /** 근거 문장(주변 맥락, 운영자가 읍 읽고 판단할 수 있도록). */
  context: string;
  /** 해석에 성공하면 ISO 8601(UTC), 실패하면 null. */
  iso: string | null;
  hasTime: boolean;
  /** 원문에 연도가 없어 추정한 경우 true — "AI가 만들어낸 날짜"가 아니라 결정적 규칙(가장
   * 가까운 미래 연도)임을 명시하되, 운영자 확인이 더 필요하다는 신호로 쓴다. */
  yearInferred: boolean;
  role: DateRole;
  index: number;
}

const DAY_NAME = "[월화수목금토일]";
const PATTERNS: Array<{ regex: RegExp; build: (m: RegExpExecArray) => { year: number | null; month: number; day: number; hour: number | null; minute: number | null } }> = [
  {
    // 2026년 10월 31일, 2026년 10월 31일(금) 18:00
    regex: new RegExp(`(\\d{4})\\s*년\\s*(\\d{1,2})\\s*월\\s*(\\d{1,2})\\s*일(?:\\s*\\(${DAY_NAME}\\))?(?:\\s+(\\d{1,2}):(\\d{2}))?`, "g"),
    build: (m) => ({ year: Number(m[1]), month: Number(m[2]), day: Number(m[3]), hour: m[4] ? Number(m[4]) : null, minute: m[5] ? Number(m[5]) : null }),
  },
  {
    // 2026.10.31 / 2026. 10. 31. / 2026-10-31 / 2026-10-31 18:00
    regex: /(\d{4})\s*[.\-]\s*(\d{1,2})\s*[.\-]\s*(\d{1,2})\s*\.?(?:\s+(\d{1,2}):(\d{2}))?/g,
    build: (m) => ({ year: Number(m[1]), month: Number(m[2]), day: Number(m[3]), hour: m[4] ? Number(m[4]) : null, minute: m[5] ? Number(m[5]) : null }),
  },
  {
    // 10월 31일(금), 10월 31일 18:00 (연도 없음). "2026년 10월 31일"처럼 앞에 연도가 이미
    // 있는 경우는 1번 패턴이 먼저 그 구간 전체를 선점하므로(아래 overlap 검사) 중복 매칭되지 않는다.
    regex: new RegExp(`(\\d{1,2})\\s*월\\s*(\\d{1,2})\\s*일(?:\\s*\\(${DAY_NAME}\\))?(?:\\s+(\\d{1,2}):(\\d{2}))?`, "g"),
    build: (m) => ({ year: null, month: Number(m[1]), day: Number(m[2]), hour: m[3] ? Number(m[3]) : null, minute: m[4] ? Number(m[4]) : null }),
  },
  {
    // ~10/31, 10/31 (연도 없음) — 뒤에 또 다른 "/"가 와서 분수 등으로 오인될 소지가 있는 것은 제외.
    regex: /(~\s*)?(\d{1,2})\/(\d{1,2})(?!\/\d)/g,
    build: (m) => ({ year: null, month: Number(m[2]), day: Number(m[3]), hour: null, minute: null }),
  },
];

function buildContext(text: string, start: number, end: number): string {
  // 줄(문단) 경계를 넘어 다음 문장의 키워드까지 섞여 들어가면 역할 분류(접수 시작/마감)가
  // 엉뚱하게 뒤섞인다 — 그래서 ±30자 창을 같은 줄 안으로만 clamp한다.
  const lineStart = text.lastIndexOf("\n", start) + 1;
  const nextNewline = text.indexOf("\n", end);
  const lineEnd = nextNewline === -1 ? text.length : nextNewline;
  const from = Math.max(lineStart, start - 30);
  const to = Math.min(lineEnd, end + 30);
  return text.slice(from, to).replace(/\s+/g, " ").trim();
}

function inferYear(month: number, day: number, now: Date): { year: number; inferred: true } {
  const candidateThisYear = new Date(Date.UTC(now.getUTCFullYear(), month - 1, day));
  const diffDays = (candidateThisYear.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  // 이미 90일 넘게 지난 날짜면("작년 얘기"일 가능성이 높음) 가장 가까운 미래인 내년으로 본다.
  // 결정적 규칙이며, 실제 값은 항상 미리보기에서 운영자가 확인한다.
  const year = diffDays < -90 ? now.getUTCFullYear() + 1 : now.getUTCFullYear();
  return { year, inferred: true };
}

function toIso(year: number, month: number, day: number, hour: number | null, minute: number | null): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const hh = hour ?? 0;
  const mm = minute ?? 0;
  const pad = (n: number) => String(n).padStart(2, "0");
  const kst = `${year}-${pad(month)}-${pad(day)}T${pad(hh)}:${pad(mm)}:00+09:00`;
  const date = new Date(kst);
  if (Number.isNaN(date.getTime())) return null;
  // 월/일 범위를 벗어난 값(예: 2월 30일)을 Date가 다음 달로 "보정"해 버리는 것을 막는다.
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
  if (parts !== `${year}-${pad(month)}-${pad(day)}`) return null;
  return date.toISOString();
}

const START_KEYWORDS = ["접수시작", "접수 시작", "모집시작", "모집 시작", "신청시작", "신청 시작", "부터"];
const END_KEYWORDS = ["접수마감", "접수 마감", "모집마감", "모집 마감", "마감일", "마감", "까지", "제출기한", "제출 기한"];

function classifyRole(context: string, hasTildePrefix: boolean): DateRole {
  if (hasTildePrefix) return "apply_end";
  for (const kw of END_KEYWORDS) {
    if (context.includes(kw)) return "apply_end";
  }
  for (const kw of START_KEYWORDS) {
    if (context.includes(kw)) return "apply_start";
  }
  return "unknown";
}

/** 한국어 날짜 형식을 규칙 기반으로 찾는다. `now`는 연도 추정 기준 시각(테스트에서 주입). */
export function extractDateCandidates(text: string, now: Date = new Date()): DateCandidate[] {
  const results: DateCandidate[] = [];
  const seenSpans = new Set<string>();

  for (const { regex, build } of PATTERNS) {
    const re = new RegExp(regex.source, regex.flags);
    let match: RegExpExecArray | null;
    while ((match = re.exec(text))) {
      const start = match.index;
      const end = start + match[0].length;
      const spanKey = `${start}-${end}`;
      if (seenSpans.has(spanKey)) continue;
      // 이미 더 구체적인(연도 포함) 패턴이 겹치는 위치를 선점했으면 건너뛴다.
      const overlapsExisting = results.some((r) => r.index <= start && start < r.index + r.raw.length);
      if (overlapsExisting) continue;

      const { year, month, day, hour, minute } = build(match);
      let resolvedYear = year;
      let yearInferred = false;
      if (resolvedYear == null) {
        const inferred = inferYear(month, day, now);
        resolvedYear = inferred.year;
        yearInferred = true;
      }
      const iso = toIso(resolvedYear, month, day, hour, minute);
      const raw = match[0].trim();
      const context = buildContext(text, start, end);
      const hasTildePrefix = /^~\s*/.test(match[0]) || /~\s*$/.test(text.slice(Math.max(0, start - 2), start));
      const role = classifyRole(context, hasTildePrefix);

      results.push({
        raw,
        context,
        iso,
        hasTime: hour != null,
        yearInferred,
        role,
        index: start,
      });
      seenSpans.add(spanKey);
    }
  }

  return results.sort((a, b) => a.index - b.index);
}

export interface BestDateGuess {
  applyStart: DateCandidate | null;
  applyEnd: DateCandidate | null;
  all: DateCandidate[];
}

/** 분류된 후보 중 가장 그럴듯한 접수 시작/마감 1개씩을 고른다(나머지는 전부 `all`에 남아 운영자가 볼 수 있다). */
export function pickBestDates(candidates: DateCandidate[]): BestDateGuess {
  const applyStart = candidates.find((c) => c.role === "apply_start" && c.iso) ?? null;
  const applyEnd = candidates.find((c) => c.role === "apply_end" && c.iso) ?? null;
  return { applyStart, applyEnd, all: candidates };
}

export { htmlToText };
