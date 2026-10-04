import { describe, expect, it } from "vitest";
import { fetchSinglePage } from "@/lib/activity-import/fetch";
import type { FetchDeps } from "@/lib/activity-import/fetch";

function htmlResponse(html: string, extraHeaders: Record<string, string> = {}, status = 200): Response {
  return new Response(html, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", ...extraHeaders },
  });
}

function redirectResponse(location: string, status = 302): Response {
  return new Response(null, { status, headers: { location } });
}

function plainTextResponse(text: string, status = 200): Response {
  return new Response(text, { status, headers: { "content-type": "text/plain" } });
}

type Route = Response | "timeout" | (() => Response);

/** 테스트용 가짜 fetch — 네트워크 없이 URL -> 응답을 흉내낸다. robots.txt는 기본적으로 "없음"(404). */
function createFakeFetch(routes: Record<string, Route>): typeof fetch {
  return (async (input: string | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const route = routes[url];
    if (route === undefined) {
      if (url.endsWith("/robots.txt")) return plainTextResponse("", 404);
      throw new Error(`no fake route registered for ${url}`);
    }
    if (route === "timeout") {
      return new Promise<Response>((_resolve, reject) => {
        const signal = init?.signal;
        if (signal) {
          signal.addEventListener("abort", () => {
            const err = new Error("aborted");
            err.name = "AbortError";
            reject(err);
          });
        }
      });
    }
    return typeof route === "function" ? route() : route;
  }) as typeof fetch;
}

/** 테스트용 가짜 DNS 조회 — 호스트명 -> IP 목록 매핑. */
function createFakeResolveHost(map: Record<string, string[]>): FetchDeps["resolveHost"] {
  return async (hostname: string) => {
    const addresses = map[hostname];
    if (!addresses) throw new Error(`no fake DNS entry for ${hostname}`);
    return addresses;
  };
}

describe("fetchSinglePage", () => {
  it("정상 페이지를 가져온다", async () => {
    const fetchImpl = createFakeFetch({
      "https://example.com/notice/1": htmlResponse("<html><body>hello</body></html>"),
    });
    const result = await fetchSinglePage(
      "https://example.com/notice/1",
      { checkRobots: false },
      { fetchImpl, resolveHost: createFakeResolveHost({ "example.com": ["93.184.216.34"] }) }
    );
    expect(result.status).toBe(200);
    expect(result.finalUrl).toBe("https://example.com/notice/1");
    expect(result.html).toContain("hello");
    expect(result.redirectChain).toEqual(["https://example.com/notice/1"]);
  });

  it("호스트가 localhost면 DNS 조회 없이 즉시 차단한다", async () => {
    const fetchImpl = createFakeFetch({});
    await expect(
      fetchSinglePage("http://localhost:8080/x", { checkRobots: false }, { fetchImpl })
    ).rejects.toMatchObject({ reason: "BLOCKED_HOST" });
  });

  it("URL의 호스트가 이미 사설 IP 리터럴이면 차단한다(10.x)", async () => {
    const fetchImpl = createFakeFetch({});
    await expect(
      fetchSinglePage("http://10.0.0.5/internal", { checkRobots: false }, { fetchImpl })
    ).rejects.toMatchObject({ reason: "BLOCKED_HOST" });
  });

  it("클라우드 메타데이터 주소(169.254.169.254)를 차단한다", async () => {
    const fetchImpl = createFakeFetch({});
    await expect(
      fetchSinglePage("http://169.254.169.254/latest/meta-data", { checkRobots: false }, { fetchImpl })
    ).rejects.toMatchObject({ reason: "BLOCKED_HOST" });
  });

  it("DNS 조회 결과가 사설 IP면 차단한다(도메인은 공개처럼 보여도)", async () => {
    const fetchImpl = createFakeFetch({});
    const resolveHost = createFakeResolveHost({ "internal.example.com": ["192.168.1.10"] });
    await expect(
      fetchSinglePage("http://internal.example.com/x", { checkRobots: false }, { fetchImpl, resolveHost })
    ).rejects.toMatchObject({ reason: "BLOCKED_HOST" });
  });

  it("리다이렉트할 때마다 목적지를 재검사하고, 사설 IP로 가는 리다이렉트는 차단한다", async () => {
    const fetchImpl = createFakeFetch({
      "https://public.example.com/go": redirectResponse("http://internal.example.com/secret"),
    });
    const resolveHost = createFakeResolveHost({
      "public.example.com": ["93.184.216.34"],
      "internal.example.com": ["10.1.2.3"],
    });
    await expect(
      fetchSinglePage("https://public.example.com/go", { checkRobots: false }, { fetchImpl, resolveHost })
    ).rejects.toMatchObject({ reason: "BLOCKED_HOST" });
  });

  it("안전한 리다이렉트는 정상적으로 따라간다", async () => {
    const fetchImpl = createFakeFetch({
      "https://public.example.com/go": redirectResponse("https://public.example.com/final"),
      "https://public.example.com/final": htmlResponse("<html>final</html>"),
    });
    const resolveHost = createFakeResolveHost({ "public.example.com": ["93.184.216.34"] });
    const result = await fetchSinglePage(
      "https://public.example.com/go",
      { checkRobots: false },
      { fetchImpl, resolveHost }
    );
    expect(result.finalUrl).toBe("https://public.example.com/final");
    expect(result.redirectChain).toEqual(["https://public.example.com/go", "https://public.example.com/final"]);
  });

  it("리다이렉트 횟수 제한을 초과하면 거부한다", async () => {
    const resolveHost = createFakeResolveHost({ "loop.example.com": ["93.184.216.34"] });
    const fetchImpl = createFakeFetch({
      "https://loop.example.com/0": redirectResponse("https://loop.example.com/1"),
      "https://loop.example.com/1": redirectResponse("https://loop.example.com/2"),
      "https://loop.example.com/2": redirectResponse("https://loop.example.com/3"),
      "https://loop.example.com/3": redirectResponse("https://loop.example.com/4"),
    });
    await expect(
      fetchSinglePage(
        "https://loop.example.com/0",
        { checkRobots: false, maxRedirects: 3 },
        { fetchImpl, resolveHost }
      )
    ).rejects.toMatchObject({ reason: "TOO_MANY_REDIRECTS" });
  });

  it("HTML이 아닌 응답은 거부한다", async () => {
    const fetchImpl = createFakeFetch({
      "https://example.com/data.json": new Response("{}", { status: 200, headers: { "content-type": "application/json" } }),
    });
    await expect(
      fetchSinglePage(
        "https://example.com/data.json",
        { checkRobots: false },
        { fetchImpl, resolveHost: createFakeResolveHost({ "example.com": ["93.184.216.34"] }) }
      )
    ).rejects.toMatchObject({ reason: "NON_HTML" });
  });

  it("응답 크기가 제한을 초과하면 거부한다", async () => {
    const bigHtml = "x".repeat(1000);
    const fetchImpl = createFakeFetch({
      "https://example.com/big": htmlResponse(bigHtml),
    });
    await expect(
      fetchSinglePage(
        "https://example.com/big",
        { checkRobots: false, maxBytes: 100 },
        { fetchImpl, resolveHost: createFakeResolveHost({ "example.com": ["93.184.216.34"] }) }
      )
    ).rejects.toMatchObject({ reason: "TOO_LARGE" });
  });

  it("오류 상태(4xx/5xx)는 거부한다", async () => {
    const fetchImpl = createFakeFetch({
      "https://example.com/missing": htmlResponse("not found", {}, 404),
    });
    await expect(
      fetchSinglePage(
        "https://example.com/missing",
        { checkRobots: false },
        { fetchImpl, resolveHost: createFakeResolveHost({ "example.com": ["93.184.216.34"] }) }
      )
    ).rejects.toMatchObject({ reason: "HTTP_ERROR", status: 404 });
  });

  it("응답 시간이 초과되면 거부한다", async () => {
    const fetchImpl = createFakeFetch({ "https://example.com/slow": "timeout" });
    await expect(
      fetchSinglePage(
        "https://example.com/slow",
        { checkRobots: false, timeoutMs: 30 },
        { fetchImpl, resolveHost: createFakeResolveHost({ "example.com": ["93.184.216.34"] }) }
      )
    ).rejects.toMatchObject({ reason: "TIMEOUT" });
  });

  it("robots.txt가 경로를 차단하면 가져오지 않는다", async () => {
    const fetchImpl = createFakeFetch({
      "https://blocked.example.com/robots.txt": plainTextResponse("User-agent: *\nDisallow: /notice"),
      "https://blocked.example.com/notice/1": htmlResponse("<html>secret</html>"),
    });
    await expect(
      fetchSinglePage(
        "https://blocked.example.com/notice/1",
        { checkRobots: true },
        { fetchImpl, resolveHost: createFakeResolveHost({ "blocked.example.com": ["93.184.216.34"] }) }
      )
    ).rejects.toMatchObject({ reason: "ROBOTS_DISALLOWED" });
  });

  it("robots.txt가 허용하면 정상적으로 가져온다", async () => {
    const fetchImpl = createFakeFetch({
      "https://allowed.example.com/robots.txt": plainTextResponse("User-agent: *\nDisallow: /admin"),
      "https://allowed.example.com/notice/1": htmlResponse("<html>ok</html>"),
    });
    const result = await fetchSinglePage(
      "https://allowed.example.com/notice/1",
      { checkRobots: true },
      { fetchImpl, resolveHost: createFakeResolveHost({ "allowed.example.com": ["93.184.216.34"] }) }
    );
    expect(result.html).toContain("ok");
  });

  it("robots.txt가 없으면(404) 허용으로 간주한다", async () => {
    const fetchImpl = createFakeFetch({
      "https://norobots.example.com/notice/1": htmlResponse("<html>ok</html>"),
    });
    const result = await fetchSinglePage(
      "https://norobots.example.com/notice/1",
      { checkRobots: true },
      { fetchImpl, resolveHost: createFakeResolveHost({ "norobots.example.com": ["93.184.216.34"] }) }
    );
    expect(result.html).toContain("ok");
  });
});
