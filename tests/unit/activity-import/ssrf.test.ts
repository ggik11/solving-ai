import { describe, expect, it } from "vitest";
import { isAllowedScheme, isBlockedIpAddress, isObviouslyBlockedHostname } from "@/lib/activity-import/ssrf";

describe("isAllowedScheme", () => {
  it("http/https만 허용한다", () => {
    expect(isAllowedScheme(new URL("https://example.com"))).toBe(true);
    expect(isAllowedScheme(new URL("http://example.com"))).toBe(true);
    expect(isAllowedScheme(new URL("ftp://example.com"))).toBe(false);
    expect(isAllowedScheme(new URL("file:///etc/passwd"))).toBe(false);
    expect(isAllowedScheme(new URL("javascript:alert(1)"))).toBe(false);
  });
});

describe("isBlockedIpAddress — IPv4", () => {
  it.each([
    ["10.0.0.1"],
    ["10.255.255.255"],
    ["172.16.0.1"],
    ["172.31.255.255"],
    ["192.168.1.1"],
    ["127.0.0.1"],
    ["169.254.169.254"], // 클라우드 메타데이터 주소
    ["169.254.0.1"],
    ["100.64.0.1"],
    ["0.0.0.0"],
    ["224.0.0.1"],
    ["255.255.255.255"],
    ["192.0.2.1"],
  ])("%s는 차단된다", (ip) => {
    expect(isBlockedIpAddress(ip)).toBe(true);
  });

  it.each([["8.8.8.8"], ["1.1.1.1"], ["93.184.216.34"]])("%s(공인 IP)는 차단되지 않는다", (ip) => {
    expect(isBlockedIpAddress(ip)).toBe(false);
  });

  it("172.15.255.255/172.32.0.0 등 경계값은 차단되지 않는다", () => {
    expect(isBlockedIpAddress("172.15.255.255")).toBe(false);
    expect(isBlockedIpAddress("172.32.0.0")).toBe(false);
    expect(isBlockedIpAddress("9.255.255.255")).toBe(false);
    expect(isBlockedIpAddress("11.0.0.0")).toBe(false);
  });
});

describe("isBlockedIpAddress — IPv6", () => {
  it.each([["::1"], ["fe80::1"], ["fc00::1"], ["fd12:3456:789a::1"], ["::ffff:127.0.0.1"], ["::ffff:10.0.0.1"], ["ff02::1"]])(
    "%s는 차단된다",
    (ip) => {
      expect(isBlockedIpAddress(ip)).toBe(true);
    }
  );

  it("::ffff:8.8.8.8(매핑된 공인 IPv4)는 차단되지 않는다", () => {
    expect(isBlockedIpAddress("::ffff:8.8.8.8")).toBe(false);
  });

  it("2606:4700:4700::1111(공인 IPv6)은 차단되지 않는다", () => {
    expect(isBlockedIpAddress("2606:4700:4700::1111")).toBe(false);
  });
});

describe("isObviouslyBlockedHostname", () => {
  it.each([["localhost"], ["LOCALHOST"], ["localhost."], ["metadata.google.internal"], ["foo.internal"]])(
    "%s는 차단된다",
    (host) => {
      expect(isObviouslyBlockedHostname(host)).toBe(true);
    }
  );

  it("일반 도메인은 차단되지 않는다", () => {
    expect(isObviouslyBlockedHostname("example.com")).toBe(false);
    expect(isObviouslyBlockedHostname("www.smu.ac.kr")).toBe(false);
  });
});
