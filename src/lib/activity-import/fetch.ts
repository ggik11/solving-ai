/**
 * SSRF 방어가 적용된 "단일 페이지 1회 조회" 가져오기. 목록 페이지를 따라가며 여러 공고를
 * 긁는 기능은 의도적으로 만들지 않는다 — 호출자가 넘긴 URL 정확히 하나만 가져온다.
 *
 * 테스트 용이성을 위해 실제 네트워크 I/O(DNS 조회·HTTP 요청)는 전부 주입 가능한 의존성으로
 * 분리했다(`FetchDeps`). 기본값은 실제 `fetch`/`dns.lookup`을 쓰고, 단위 테스트는 가짜 구현을
 * 주입해 실제 네트워크 없이 리다이렉트·SSRF 차단 시나리오를 검증한다.
 */
import { lookup as dnsLookup } from "node:dns/promises";
import { isAllowedScheme, isBlockedIpAddress, isObviouslyBlockedHostname } from "./ssrf";
import { IMPORT_USER_AGENT, isPathAllowedByRobots } from "./robots";

export type FetchFailureReason =
  | "UNSUPPORTED_SCHEME"
  | "BLOCKED_HOST"
  | "ROBOTS_DISALLOWED"
  | "TOO_MANY_REDIRECTS"
  | "NON_HTML"
  | "TIMEOUT"
  | "TOO_LARGE"
  | "HTTP_ERROR"
  | "NETWORK_ERROR";

export class FetchSinglePageError extends Error {
  constructor(
    public readonly reason: FetchFailureReason,
    message: string,
    public readonly status?: number
  ) {
    super(message);
    this.name = "FetchSinglePageError";
  }
}

export interface SinglePageFetchResult {
  /** 리다이렉트를 모두 따라간 뒤의 최종 URL. */
  finalUrl: string;
  status: number;
  html: string;
  /** 처음 입력한 URL부터 최종 URL까지의 전체 경로(검토용). */
  redirectChain: string[];
}

export interface ResolveHostFn {
  (hostname: string): Promise<string[]>;
}

export interface FetchDeps {
  fetchImpl?: typeof fetch;
  resolveHost?: ResolveHostFn;
}

export interface SinglePageFetchOptions {
  maxRedirects?: number;
  timeoutMs?: number;
  maxBytes?: number;
  checkRobots?: boolean;
}

const DEFAULTS = {
  maxRedirects: 5,
  timeoutMs: 8000,
  maxBytes: 2_000_000,
  checkRobots: true,
};

async function defaultResolveHost(hostname: string): Promise<string[]> {
  const results = await dnsLookup(hostname, { all: true, verbatim: true });
  return results.map((r) => r.address);
}

function stripBrackets(host: string): string {
  return host.startsWith("[") && host.endsWith("]") ? host.slice(1, -1) : host;
}

async function assertHostIsSafe(url: URL, resolveHost: ResolveHostFn): Promise<void> {
  if (!isAllowedScheme(url)) {
    throw new FetchSinglePageError("UNSUPPORTED_SCHEME", `지원하지 않는 스킴입니다: ${url.protocol}`);
  }
  const hostname = url.hostname;
  if (isObviouslyBlockedHostname(hostname)) {
    throw new FetchSinglePageError("BLOCKED_HOST", `차단된 호스트입니다: ${hostname}`);
  }
  const bareHost = stripBrackets(hostname);
  if (isBlockedIpAddress(bareHost)) {
    throw new FetchSinglePageError("BLOCKED_HOST", `차단된 IP 대역입니다: ${hostname}`);
  }

  let addresses: string[];
  try {
    addresses = await resolveHost(hostname);
  } catch {
    throw new FetchSinglePageError("NETWORK_ERROR", `호스트를 확인할 수 없습니다: ${hostname}`);
  }
  if (addresses.length === 0) {
    throw new FetchSinglePageError("NETWORK_ERROR", `호스트를 확인할 수 없습니다: ${hostname}`);
  }
  for (const address of addresses) {
    if (isBlockedIpAddress(address)) {
      throw new FetchSinglePageError(
        "BLOCKED_HOST",
        `차단된 IP 대역으로 연결됩니다: ${hostname} -> ${address}`
      );
    }
  }
}

async function readBodyWithLimit(response: Response, maxBytes: number): Promise<string> {
  const body = response.body;
  if (!body) return "";

  const reader = body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (value) {
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel().catch(() => {});
        throw new FetchSinglePageError("TOO_LARGE", `응답 크기가 제한(${maxBytes}바이트)을 초과했습니다.`);
      }
      chunks.push(value);
    }
  }
  const combined = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    combined.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8").decode(combined);
}

async function checkRobotsAllowed(
  url: URL,
  fetchImpl: typeof fetch,
  resolveHost: ResolveHostFn,
  timeoutMs: number
): Promise<void> {
  const robotsUrl = new URL("/robots.txt", url.origin);
  try {
    await assertHostIsSafe(robotsUrl, resolveHost);
  } catch {
    // robots.txt 호스트 자체가 안전하지 않으면(이례적) 본 요청의 호스트 검사에서 곧 다시
    // 걸리므로 여기서는 그냥 허용(로봇 규칙 없음)으로 넘어간다.
    return;
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetchImpl(robotsUrl.toString(), {
      method: "GET",
      redirect: "manual",
      headers: { "User-Agent": IMPORT_USER_AGENT },
      signal: controller.signal,
    });
    if (response.status !== 200) return; // robots.txt 없음/오류 => 허용으로 간주.
    const text = await response.text();
    if (!isPathAllowedByRobots(text, url.pathname || "/")) {
      throw new FetchSinglePageError("ROBOTS_DISALLOWED", "robots.txt가 이 경로의 가져오기를 허용하지 않습니다.");
    }
  } catch (err) {
    if (err instanceof FetchSinglePageError) throw err;
    // robots.txt 조회 자체의 네트워크 오류는 "허용"으로 간주한다(보수적으로 막지 않음 — robots.txt는
    // 선택적 신호이고, 본 요청의 SSRF 검사가 실제 안전장치다).
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchSinglePage(
  inputUrl: string,
  options: SinglePageFetchOptions = {},
  deps: FetchDeps = {}
): Promise<SinglePageFetchResult> {
  const opts = { ...DEFAULTS, ...options };
  const fetchImpl = deps.fetchImpl ?? fetch;
  const resolveHost = deps.resolveHost ?? defaultResolveHost;

  let current: URL;
  try {
    current = new URL(inputUrl);
  } catch {
    throw new FetchSinglePageError("UNSUPPORTED_SCHEME", "올바른 URL이 아닙니다.");
  }

  const redirectChain: string[] = [current.toString()];
  const deadline = Date.now() + opts.timeoutMs;

  if (opts.checkRobots) {
    await checkRobotsAllowed(current, fetchImpl, resolveHost, Math.min(opts.timeoutMs, 3000));
  }

  for (let hop = 0; ; hop++) {
    await assertHostIsSafe(current, resolveHost);

    const remaining = deadline - Date.now();
    if (remaining <= 0) {
      throw new FetchSinglePageError("TIMEOUT", "응답 시간이 초과되었습니다.");
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), remaining);
    let response: Response;
    try {
      response = await fetchImpl(current.toString(), {
        method: "GET",
        redirect: "manual",
        headers: { "User-Agent": IMPORT_USER_AGENT, Accept: "text/html" },
        signal: controller.signal,
      });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new FetchSinglePageError("TIMEOUT", "응답 시간이 초과되었습니다.");
      }
      throw new FetchSinglePageError("NETWORK_ERROR", `요청에 실패했습니다: ${(err as Error).message}`);
    } finally {
      clearTimeout(timer);
    }

    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      await response.body?.cancel().catch(() => {});
      if (!location) {
        throw new FetchSinglePageError("HTTP_ERROR", "리다이렉트 응답에 Location 헤더가 없습니다.", response.status);
      }
      if (hop + 1 >= opts.maxRedirects) {
        throw new FetchSinglePageError("TOO_MANY_REDIRECTS", "리다이렉트 횟수가 제한을 초과했습니다.");
      }
      const next = new URL(location, current);
      redirectChain.push(next.toString());
      current = next;
      continue; // 다음 루프에서 새 호스트를 처음부터 다시 SSRF 검사한다(재검사).
    }

    if (response.status < 200 || response.status >= 300) {
      await response.body?.cancel().catch(() => {});
      throw new FetchSinglePageError("HTTP_ERROR", `예상치 못한 응답 상태: ${response.status}`, response.status);
    }

    const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
    if (!contentType.includes("text/html")) {
      await response.body?.cancel().catch(() => {});
      throw new FetchSinglePageError("NON_HTML", `HTML이 아닌 응답입니다(${contentType || "content-type 없음"}).`);
    }

    const html = await readBodyWithLimit(response, opts.maxBytes);
    return { finalUrl: current.toString(), status: response.status, html, redirectChain };
  }
}
