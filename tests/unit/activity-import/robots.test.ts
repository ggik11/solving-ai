import { describe, expect, it } from "vitest";
import { isPathAllowedByRobots } from "@/lib/activity-import/robots";

describe("isPathAllowedByRobots", () => {
  it("robots.txt가 없거나 빈 경우 허용한다", () => {
    expect(isPathAllowedByRobots("", "/notice/123")).toBe(true);
  });

  it("전체 차단(Disallow: /)이면 거부한다", () => {
    const robots = "User-agent: *\nDisallow: /";
    expect(isPathAllowedByRobots(robots, "/notice/123")).toBe(false);
  });

  it("특정 경로만 차단하면 그 경로만 거부한다", () => {
    const robots = "User-agent: *\nDisallow: /admin\nDisallow: /private/";
    expect(isPathAllowedByRobots(robots, "/admin/secret")).toBe(false);
    expect(isPathAllowedByRobots(robots, "/private/x")).toBe(false);
    expect(isPathAllowedByRobots(robots, "/notice/123")).toBe(true);
  });

  it("더 구체적인 Allow가 Disallow를 이긴다", () => {
    const robots = "User-agent: *\nDisallow: /notice\nAllow: /notice/public";
    expect(isPathAllowedByRobots(robots, "/notice/public/1")).toBe(true);
    expect(isPathAllowedByRobots(robots, "/notice/private/1")).toBe(false);
  });

  it("와일드카드(*)를 지원한다", () => {
    const robots = "User-agent: *\nDisallow: /*.pdf$";
    expect(isPathAllowedByRobots(robots, "/files/report.pdf")).toBe(false);
    expect(isPathAllowedByRobots(robots, "/files/report.pdf.html")).toBe(true);
  });

  it("우리 User-Agent 전용 그룹이 있으면 그걸 우선한다", () => {
    const robots = [
      "User-agent: *",
      "Disallow: /",
      "User-agent: sangmyungmatelinkimporter",
      "Disallow:",
    ].join("\n");
    expect(isPathAllowedByRobots(robots, "/notice/1")).toBe(true);
  });

  it("주석과 빈 줄을 무시한다", () => {
    const robots = ["# comment", "", "User-agent: *", "# another comment", "Disallow: /secret"].join("\n");
    expect(isPathAllowedByRobots(robots, "/secret")).toBe(false);
    expect(isPathAllowedByRobots(robots, "/public")).toBe(true);
  });
});
