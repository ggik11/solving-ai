/**
 * URL 가져오기(SSRF 방어) 순수 함수. 실제 DNS 조회는 호출자가 주입하는 `resolveHost`를
 * 통해서만 일어나므로(기본 구현은 `src/lib/activity-import/fetch.ts`), 이 파일 자체는
 * 네트워크 접근이 전혀 없는 순수 로직이라 단위 테스트가 쉽다.
 *
 * 차단 대상: http/https 이외 스킴, localhost류, 사설 IP(RFC1918), 링크 로컬(169.254.0.0/16,
 * 메타데이터 주소 169.254.169.254 포함), 루프백, 멀티캐스트/예약 대역, IPv6 대응 range.
 */

export type SsrfRejectReason =
  | "INVALID_URL"
  | "UNSUPPORTED_SCHEME"
  | "BLOCKED_HOST";

export class SsrfValidationError extends Error {
  constructor(
    public readonly reason: SsrfRejectReason,
    message: string
  ) {
    super(message);
    this.name = "SsrfValidationError";
  }
}

const ALLOWED_SCHEMES = new Set(["http:", "https:"]);

/** http/https만 허용한다. */
export function isAllowedScheme(url: URL): boolean {
  return ALLOWED_SCHEMES.has(url.protocol);
}

function ipv4ToInt(parts: number[]): number {
  return ((parts[0] << 24) | (parts[1] << 16) | (parts[2] << 8) | parts[3]) >>> 0;
}

function parseIpv4(host: string): number[] | null {
  const match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!match) return null;
  const parts = match.slice(1, 5).map((p) => Number(p));
  if (parts.some((p) => p < 0 || p > 255)) return null;
  return parts;
}

const IPV4_BLOCKED_CIDRS: Array<{ base: number[]; bits: number }> = [
  { base: [0, 0, 0, 0], bits: 8 }, // "이 네트워크" 예약
  { base: [10, 0, 0, 0], bits: 8 }, // RFC1918
  { base: [100, 64, 0, 0], bits: 10 }, // CGNAT
  { base: [127, 0, 0, 0], bits: 8 }, // 루프백
  { base: [169, 254, 0, 0], bits: 16 }, // 링크 로컬(메타데이터 169.254.169.254 포함)
  { base: [172, 16, 0, 0], bits: 12 }, // RFC1918
  { base: [192, 0, 0, 0], bits: 24 }, // IETF 프로토콜 할당
  { base: [192, 0, 2, 0], bits: 24 }, // TEST-NET-1
  { base: [192, 168, 0, 0], bits: 16 }, // RFC1918
  { base: [198, 18, 0, 0], bits: 15 }, // 벤치마크
  { base: [198, 51, 100, 0], bits: 24 }, // TEST-NET-2
  { base: [203, 0, 113, 0], bits: 24 }, // TEST-NET-3
  { base: [224, 0, 0, 0], bits: 4 }, // 멀티캐스트
  { base: [240, 0, 0, 0], bits: 4 }, // 예약
  { base: [255, 255, 255, 255], bits: 32 }, // 브로드캐스트
];

function isIpv4Blocked(host: string): boolean {
  const parts = parseIpv4(host);
  if (!parts) return false;
  const value = ipv4ToInt(parts);
  return IPV4_BLOCKED_CIDRS.some(({ base, bits }) => {
    const baseValue = ipv4ToInt(base);
    const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
    return (value & mask) === (baseValue & mask);
  });
}

/** 매우 단순한(이 용도로 충분한) IPv6 확장 파서. 압축(`::`) 표기와 매핑된 IPv4 접미사를 지원한다. */
function expandIpv6(host: string): bigint | null {
  let address = host;
  if (address.startsWith("[") && address.endsWith("]")) {
    address = address.slice(1, -1);
  }
  if (!address.includes(":")) return null;

  const [headPart, tailPart] = address.split("::");
  const hasDoubleColon = address.includes("::");

  function groupsOf(part: string): string[] {
    return part.length === 0 ? [] : part.split(":");
  }

  let headGroups = groupsOf(headPart ?? "");
  let tailGroups = hasDoubleColon ? groupsOf(tailPart ?? "") : [];

  // 마지막 그룹이 IPv4 점표기(예: ::ffff:127.0.0.1)인 경우 두 개의 16비트 그룹으로 변환.
  function expandEmbeddedIpv4(groups: string[]): string[] {
    if (groups.length === 0) return groups;
    const last = groups[groups.length - 1];
    const ipv4 = parseIpv4(last);
    if (!ipv4) return groups;
    const hi = ((ipv4[0] << 8) | ipv4[1]).toString(16);
    const lo = ((ipv4[2] << 8) | ipv4[3]).toString(16);
    return [...groups.slice(0, -1), hi, lo];
  }

  headGroups = expandEmbeddedIpv4(headGroups);
  tailGroups = expandEmbeddedIpv4(tailGroups);

  let fullGroups: string[];
  if (hasDoubleColon) {
    const missing = 8 - (headGroups.length + tailGroups.length);
    if (missing < 0) return null;
    fullGroups = [...headGroups, ...Array(missing).fill("0"), ...tailGroups];
  } else {
    fullGroups = headGroups;
  }
  if (fullGroups.length !== 8) return null;

  let value = BigInt(0);
  for (const group of fullGroups) {
    if (!/^[0-9a-fA-F]{1,4}$/.test(group)) return null;
    value = (value << BigInt(16)) | BigInt(parseInt(group, 16));
  }
  return value;
}

/** 상수를 16진수를 직접 세어 쓰면 자릿수 실수가 나기 쉬워, 표준 표기 문자열을 같은 파서로 계산한다. */
function prefixBase(canonicalForm: string): bigint {
  const value = expandIpv6(canonicalForm);
  if (value === null) throw new Error(`invalid canonical IPv6 prefix: ${canonicalForm}`);
  return value;
}

function matchesPrefix(value: bigint, base: bigint, bits: number): boolean {
  const shift = BigInt(128 - bits);
  return (value >> shift) === (base >> shift);
}

const IPV6_BLOCKED_RANGES: Array<{ base: bigint; bits: number }> = [
  { base: prefixBase("::"), bits: 128 }, // :: (미지정)
  { base: prefixBase("::1"), bits: 128 }, // ::1 (루프백)
  { base: prefixBase("fe80::"), bits: 10 }, // fe80::/10 링크 로컬
  { base: prefixBase("fc00::"), bits: 7 }, // fc00::/7 유니크 로컬
  { base: prefixBase("ff00::"), bits: 8 }, // ff00::/8 멀티캐스트
  { base: prefixBase("2001:db8::"), bits: 32 }, // 2001:db8::/32 문서용
];

// IPv4-mapped(::ffff:0:0/96)·NAT64(64:ff9b::/96) 접두사는 "매핑 방식"일 뿐 그 자체로 위험하지
// 않다 — 내부에 품은 IPv4 주소가 사설/예약 대역일 때만(아래 isIpv6Blocked에서 재검사) 차단한다.
// 그래서 이 둘은 IPV6_BLOCKED_RANGES(무조건 차단)에 넣지 않는다.
const IPV4_MAPPED_PREFIXES: Array<{ base: bigint; bits: number }> = [
  { base: prefixBase("::ffff:0:0"), bits: 96 },
  { base: prefixBase("64:ff9b::"), bits: 96 },
];

function isIpv6Blocked(host: string): boolean {
  const value = expandIpv6(host);
  if (value === null) return false;
  const blocked = IPV6_BLOCKED_RANGES.some(({ base, bits }) => matchesPrefix(value, base, bits));
  if (blocked) return true;

  // IPv4-mapped/변환 주소(::ffff:a.b.c.d, 64:ff9b::a.b.c.d)의 내부 IPv4도 재검사한다.
  const isMapped = IPV4_MAPPED_PREFIXES.some(({ base, bits }) => matchesPrefix(value, base, bits));
  if (isMapped) {
    const inner = value & ((BigInt(1) << BigInt(32)) - BigInt(1));
    const byteMask = BigInt(0xff);
    const a = Number((inner >> BigInt(24)) & byteMask);
    const b = Number((inner >> BigInt(16)) & byteMask);
    const c = Number((inner >> BigInt(8)) & byteMask);
    const d = Number(inner & byteMask);
    if (isIpv4Blocked(`${a}.${b}.${c}.${d}`)) return true;
  }
  return false;
}

/** 호스트 이름이 아니라 "이미 해석된 IP 문자열"이 사설/예약/루프백/링크로컬 대역인지 검사한다. */
export function isBlockedIpAddress(ip: string): boolean {
  if (parseIpv4(ip)) return isIpv4Blocked(ip);
  return isIpv6Blocked(ip);
}

const BLOCKED_HOSTNAMES = new Set(["localhost", "localhost.localdomain", "ip6-localhost", "metadata.google.internal"]);

/** 호스트명 자체가 명백히 로컬/메타데이터를 가리키는지(별도 DNS 조회 없이) 1차 검사한다. */
export function isObviouslyBlockedHostname(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/\.$/, "");
  if (BLOCKED_HOSTNAMES.has(normalized)) return true;
  if (normalized.endsWith(".localhost")) return true;
  if (normalized.endsWith(".internal")) return true;
  return false;
}
