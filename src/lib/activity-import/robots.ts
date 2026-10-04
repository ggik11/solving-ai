/**
 * 아주 작은 robots.txt 파서. 전체 스펙(와일드카드 `$`, `*` 우선순위 세부 규칙 등)을 따르지
 * 않고, "우리 User-Agent(또는 `*`) 그룹의 Disallow 규칙에 걸리면 가져오지 않는다"는 보수적인
 * 부분집합만 구현한다 — 단일 페이지 1회 조회라는 용도에는 이 정도로 충분하고, 과도한 해석으로
 * 오히려 허용돼야 할 요청을 더 막는 쪽(보수적)으로 치우치는 것이 안전하다.
 */

export const IMPORT_USER_AGENT = "SangmyungMateLinkImporter/1.0 (+activity-url-import)";

interface RobotsGroup {
  agents: string[];
  disallow: string[];
  allow: string[];
}

function parseRobotsTxt(text: string): RobotsGroup[] {
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | null = null;

  for (const rawLine of text.split("\n")) {
    const line = rawLine.split("#")[0].trim();
    if (!line) continue;
    const sepIndex = line.indexOf(":");
    if (sepIndex === -1) continue;
    const field = line.slice(0, sepIndex).trim().toLowerCase();
    const value = line.slice(sepIndex + 1).trim();

    if (field === "user-agent") {
      if (!current || current.disallow.length > 0 || current.allow.length > 0) {
        current = { agents: [], disallow: [], allow: [] };
        groups.push(current);
      }
      current.agents.push(value.toLowerCase());
    } else if (field === "disallow" && current) {
      if (value) current.disallow.push(value);
    } else if (field === "allow" && current) {
      if (value) current.allow.push(value);
    }
  }
  return groups;
}

function pathMatches(pattern: string, path: string): boolean {
  // '*'를 "임의 문자열"로 취급하는 간단한 매칭(끝의 '$'는 "그 지점에서 끝"으로 처리).
  // '*' 기준으로 나눠 각 조각만 정규식 특수문자 escape하고, '*' 자체는 escape하지 않은 채
  // ".*"로 join한다(먼저 전체를 escape하면 '*'도 리터럴이 되어 버려 와일드카드가 깨진다).
  const anchored = pattern.endsWith("$");
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const escaped = body
    .split("*")
    .map((part) => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&"))
    .join(".*");
  const regex = new RegExp(`^${escaped}${anchored ? "$" : ""}`);
  return regex.test(path);
}

function selectGroup(groups: RobotsGroup[], userAgentToken: string): RobotsGroup | null {
  const specific = groups.find((g) => g.agents.includes(userAgentToken));
  if (specific) return specific;
  return groups.find((g) => g.agents.includes("*")) ?? null;
}

/**
 * 주어진 robots.txt 본문 기준으로 path를 가져와도 되는지 판정한다.
 * 그룹이 전혀 없으면(robots.txt 없음/빈 파일) 허용으로 본다.
 */
export function isPathAllowedByRobots(
  robotsTxt: string,
  path: string,
  userAgentToken = "sangmyungmatelinkimporter"
): boolean {
  const groups = parseRobotsTxt(robotsTxt);
  if (groups.length === 0) return true;
  const group = selectGroup(groups, userAgentToken);
  if (!group) return true;

  const matchingAllow = group.allow.filter((p) => pathMatches(p, path));
  const matchingDisallow = group.disallow.filter((p) => pathMatches(p, path));
  if (matchingDisallow.length === 0) return true;

  const longestAllow = Math.max(0, ...matchingAllow.map((p) => p.length));
  const longestDisallow = Math.max(0, ...matchingDisallow.map((p) => p.length));
  // 더 구체적인(긴) 규칙이 우선한다(표준 robots.txt 해석과 동일).
  return longestAllow >= longestDisallow;
}
