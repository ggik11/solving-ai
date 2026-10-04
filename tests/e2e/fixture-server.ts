import http from "node:http";
import type { AddressInfo } from "node:net";

/**
 * URL 가져오기 E2E용 아주 작은 고정 HTML 응답 서버. 127.0.0.1의 임의 빈 포트에 바인딩한다 —
 * 실제 외부 네트워크를 쓰지 않고, SSRF 테스트 허용 목록(ACTIVITY_IMPORT_SSRF_TEST_ALLOWLIST,
 * playwright.config.ts에서만 설정됨)을 통해서만 가져올 수 있다.
 */
export class FixtureServer {
  private server: http.Server;
  public readonly port: Promise<number>;

  constructor(private routes: Record<string, string>) {
    this.server = http.createServer((req, res) => {
      const path = (req.url ?? "/").split("?")[0];
      const body = this.routes[path];
      if (body === undefined) {
        res.writeHead(404, { "content-type": "text/plain" });
        res.end("not found");
        return;
      }
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      res.end(body);
    });

    this.port = new Promise((resolve) => {
      this.server.listen(0, "127.0.0.1", () => {
        resolve((this.server.address() as AddressInfo).port);
      });
    });
  }

  async url(path: string): Promise<string> {
    return `http://127.0.0.1:${await this.port}${path}`;
  }

  async close(): Promise<void> {
    await new Promise<void>((resolve) => this.server.close(() => resolve()));
  }
}
