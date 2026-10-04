import { describe, expect, it } from "vitest";
import { checkActivityLink } from "@/lib/activity-import/link-check";
import type { FetchDeps } from "@/lib/activity-import/fetch";

function htmlResponse(html: string, status = 200): Response {
  return new Response(html, { status, headers: { "content-type": "text/html; charset=utf-8" } });
}

function createFakeFetch(routes: Record<string, Response | "timeout">): typeof fetch {
  return (async (input: string | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    if (url.endsWith("/robots.txt")) return new Response("", { status: 404 });
    const route = routes[url];
    if (route === undefined) throw new Error(`no fake route for ${url}`);
    if (route === "timeout") {
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => {
          const err = new Error("aborted");
          err.name = "AbortError";
          reject(err);
        });
      });
    }
    return route;
  }) as typeof fetch;
}

function resolveHost(map: Record<string, string[]>): FetchDeps["resolveHost"] {
  return async (hostname: string) => map[hostname] ?? [];
}

describe("checkActivityLink", () => {
  it("응답이 정상이고 근거 문자열이 아직 있으면 ok", async () => {
    const fetchImpl = createFakeFetch({
      "https://notice.example.org/x": htmlResponse("<p>접수 마감 2026.10.31. 18:00까지</p>"),
    });
    const result = await checkActivityLink(
      { sourceUrl: "https://notice.example.org/x", applyEndAtEvidence: "2026.10.31. 18:00" },
      { fetchImpl, resolveHost: resolveHost({ "notice.example.org": ["93.184.216.34"] }) }
    );
    expect(result).toEqual({ ok: true, resolvedUrl: "https://notice.example.org/x" });
  });

  it("근거 문자열이 근거(evidence) 없이도 응답만 정상이면 ok", async () => {
    const fetchImpl = createFakeFetch({
      "https://notice.example.org/x": htmlResponse("<p>아무 내용</p>"),
    });
    const result = await checkActivityLink(
      { sourceUrl: "https://notice.example.org/x", applyEndAtEvidence: null },
      { fetchImpl, resolveHost: resolveHost({ "notice.example.org": ["93.184.216.34"] }) }
    );
    expect(result.ok).toBe(true);
  });

  it("마감일 근거 문자열을 더 이상 찾을 수 없으면 실패를 반환한다", async () => {
    const fetchImpl = createFakeFetch({
      "https://notice.example.org/x": htmlResponse("<p>이제 다른 내용으로 바뀌었습니다</p>"),
    });
    const result = await checkActivityLink(
      { sourceUrl: "https://notice.example.org/x", applyEndAtEvidence: "2026.10.31. 18:00" },
      { fetchImpl, resolveHost: resolveHost({ "notice.example.org": ["93.184.216.34"] }) }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.note).toContain("DEADLINE_STRING_NOT_FOUND");
  });

  it("HTTP 오류 응답이면 실패를 반환한다", async () => {
    const fetchImpl = createFakeFetch({
      "https://notice.example.org/x": htmlResponse("not found", 404),
    });
    const result = await checkActivityLink(
      { sourceUrl: "https://notice.example.org/x", applyEndAtEvidence: null },
      { fetchImpl, resolveHost: resolveHost({ "notice.example.org": ["93.184.216.34"] }) }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.note).toContain("HTTP_ERROR");
  });

  it("사설 IP로 이동된(DNS가 바뀐) 경우도 안전하게 차단되어 실패로 기록된다", async () => {
    const fetchImpl = createFakeFetch({});
    const result = await checkActivityLink(
      { sourceUrl: "https://moved.example.org/x", applyEndAtEvidence: null },
      { fetchImpl, resolveHost: resolveHost({ "moved.example.org": ["10.0.0.5"] }) }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.note).toContain("BLOCKED_HOST");
  });

  it("타임아웃이 나면 실패를 반환한다(throw하지 않음)", async () => {
    const fetchImpl = createFakeFetch({ "https://notice.example.org/x": "timeout" });
    const result = await checkActivityLink(
      { sourceUrl: "https://notice.example.org/x", applyEndAtEvidence: null },
      { fetchImpl, resolveHost: resolveHost({ "notice.example.org": ["93.184.216.34"] }) },
      { timeoutMs: 30 }
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.note).toContain("TIMEOUT");
  });
});
