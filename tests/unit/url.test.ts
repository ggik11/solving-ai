import { describe, expect, it } from "vitest";
import { isSafeRelativePath, pickRequestOrigin, resolveAllowedOrigins } from "@/lib/url";

describe("resolveAllowedOrigins", () => {
  it("NEXT_PUBLIC_SITE_URL을 origin으로 정규화한다(경로·트레일링 슬래시 제거)", () => {
    expect(resolveAllowedOrigins("http://127.0.0.1:3000/", undefined)).toEqual([
      "http://127.0.0.1:3000",
    ]);
  });

  it("ALIASES를 쉼표로 분리해 추가한다", () => {
    expect(
      resolveAllowedOrigins("http://127.0.0.1:3000", "http://localhost:3000, http://localhost:3000")
    ).toEqual(["http://127.0.0.1:3000", "http://localhost:3000"]);
  });

  it("잘못된 값(스킴 없음 등)은 무시한다", () => {
    expect(resolveAllowedOrigins("not-a-url", "also not a url")).toEqual([]);
  });

  it("값이 전부 없으면 빈 배열을 돌려준다", () => {
    expect(resolveAllowedOrigins(undefined, undefined)).toEqual([]);
  });
});

describe("pickRequestOrigin", () => {
  const allowed = ["http://127.0.0.1:3000", "http://localhost:3000"];

  it("Host 헤더가 허용 목록과 일치하면 그 origin을 쓴다", () => {
    expect(pickRequestOrigin("localhost:3000", allowed)).toBe("http://localhost:3000");
    expect(pickRequestOrigin("127.0.0.1:3000", allowed)).toBe("http://127.0.0.1:3000");
  });

  it("조작된 Host 헤더(허용 목록에 없는 값)는 무시하고 기본(첫 번째) origin으로 되돌린다", () => {
    expect(pickRequestOrigin("evil.com", allowed)).toBe("http://127.0.0.1:3000");
    expect(pickRequestOrigin("127.0.0.1:3000.evil.com", allowed)).toBe("http://127.0.0.1:3000");
    expect(pickRequestOrigin("localhost:3000@evil.com", allowed)).toBe("http://127.0.0.1:3000");
  });

  it("Host 헤더가 없으면 기본 origin을 쓴다", () => {
    expect(pickRequestOrigin(null, allowed)).toBe("http://127.0.0.1:3000");
  });

  it("허용 목록이 비어 있으면 설정 오류로 던진다(조작된 Host로 origin을 만들지 않는다)", () => {
    expect(() => pickRequestOrigin("evil.com", [])).toThrow();
  });
});

describe("isSafeRelativePath", () => {
  it("같은 사이트 내 상대경로는 허용한다", () => {
    expect(isSafeRelativePath("/")).toBe(true);
    expect(isSafeRelativePath("/parties")).toBe(true);
    expect(isSafeRelativePath("/activities/123?tab=applications")).toBe(true);
  });

  it("외부 URL(절대 URL)은 거부한다", () => {
    expect(isSafeRelativePath("https://evil.com")).toBe(false);
    expect(isSafeRelativePath("http://evil.com/")).toBe(false);
  });

  it("프로토콜 상대 URL(//evil.com)은 거부한다", () => {
    expect(isSafeRelativePath("//evil.com")).toBe(false);
    expect(isSafeRelativePath("/\\evil.com")).toBe(false);
  });

  it("인코딩으로 숨긴 외부 URL은 거부한다", () => {
    expect(isSafeRelativePath("/%2F%2Fevil.com")).toBe(false);
    expect(isSafeRelativePath("/%68%74%74%70%3A%2F%2Fevil.com")).toBe(false); // "/http://evil.com"
  });

  it("상대경로가 아닌 값은 거부한다", () => {
    expect(isSafeRelativePath("relative/without/slash")).toBe(false);
    expect(isSafeRelativePath(null)).toBe(false);
    expect(isSafeRelativePath(undefined)).toBe(false);
    expect(isSafeRelativePath("")).toBe(false);
  });

  it("개행·제어문자가 섞인 값은 거부한다", () => {
    expect(isSafeRelativePath("/ok\r\nLocation: http://evil.com")).toBe(false);
  });
});
