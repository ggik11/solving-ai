// 빠른 매칭 알고리즘 (지시서 7장 B, architecture.md 5.5절). 순수 함수로 구현해 단위 테스트로
// 정확성을 검증한다. 실제 운영 경로(스케줄 워커)는 이 로직과 동일한 설계를 DB 함수(plpgsql)로
// 재구현한다 — pg_cron이 Node 코드를 호출할 수 없어 워커 자체는 DB 안에서 돌아야 하기 때문이다
// (architecture.md 12.2절 참고). 이 파일은 그 설계의 실행 가능한 명세이자 회귀 테스트 기준이다.
//
// 보장하지 않는 것: 최적해. 탐욕 선택 + 제한된 백트래킹으로 "찾아지면 쓸 수 있는 해"를 반환하고,
// maxBacktrackSteps를 넘기면 해가 존재할 수도 있는 상태에서 그냥 null을 반환한다.

export interface AvailabilityInterval {
  dayOfWeek: number; // 0=일요일 ~ 6=토요일
  startMinutes: number; // 자정 기준 분
  endMinutes: number;
}

export interface MatchCandidate {
  queueId: string;
  profileId: string;
  waitSince: string; // ISO — 대기 시작 시각(FIFO 우선순위)
  eligibleRoles: string[];
  leaderOptIn: boolean;
  availability: AvailabilityInterval[];
}

export interface RoleRequirement {
  roleName: string;
  capacity: number;
}

export interface BlockedPair {
  profileIdA: string;
  profileIdB: string;
}

export interface MatchSettings {
  minCommonMinutes: number;
  maxCandidates: number;
  maxBacktrackSteps: number;
}

export interface MatchAssignment {
  profileId: string;
  queueId: string;
  roleName: string;
}

export interface MatchResult {
  members: MatchAssignment[];
  leaderProfileId: string;
  totalCommonMinutes: number;
}

type WeekRange = readonly [start: number, end: number]; // [day*1440+startMinutes, day*1440+endMinutes)

const MINUTES_PER_DAY = 1440;
const FULL_WEEK: readonly WeekRange[] = [[0, 7 * MINUTES_PER_DAY]];

function toWeeklyRanges(availability: AvailabilityInterval[]): WeekRange[] {
  const raw = availability
    .map((a): WeekRange => [a.dayOfWeek * MINUTES_PER_DAY + a.startMinutes, a.dayOfWeek * MINUTES_PER_DAY + a.endMinutes])
    .sort((a, b) => a[0] - b[0]);

  const merged: WeekRange[] = [];
  for (const [start, end] of raw) {
    const last = merged[merged.length - 1];
    if (last && start <= last[1]) {
      merged[merged.length - 1] = [last[0], Math.max(last[1], end)];
    } else {
      merged.push([start, end]);
    }
  }
  return merged;
}

/** 두 개의 정렬·병합된 구간 리스트의 교집합(투 포인터 스윕). */
function intersectRanges(a: readonly WeekRange[], b: readonly WeekRange[]): WeekRange[] {
  const result: WeekRange[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    const start = Math.max(a[i][0], b[j][0]);
    const end = Math.min(a[i][1], b[j][1]);
    if (start < end) result.push([start, end]);
    if (a[i][1] < b[j][1]) i++;
    else j++;
  }
  return result;
}

function totalMinutes(ranges: readonly WeekRange[]): number {
  return ranges.reduce((sum, [start, end]) => sum + (end - start), 0);
}

function blockedKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/**
 * 주어진 대기열 후보 중에서 역할 슬롯을 모두 채우고, 전체 공통 시간이 최소 기준 이상이며,
 * 팀장 동의자가 1명 이상 포함된 조합을 찾는다. 찾지 못하면(또는 탐색 한도를 넘기면) null.
 */
export function findMatch(
  candidates: MatchCandidate[],
  roles: RoleRequirement[],
  blockedPairs: BlockedPair[],
  settings: MatchSettings
): MatchResult | null {
  // 1. 결정적 우선순위: 오래 기다린 사람 먼저, 동점이면 queueId로 — 그리고 탐색 후보 수를 제한한다.
  const sorted = candidates
    .slice()
    .sort((x, y) => x.waitSince.localeCompare(y.waitSince) || x.queueId.localeCompare(y.queueId))
    .slice(0, settings.maxCandidates);

  const weeklyRanges = sorted.map((c) => toWeeklyRanges(c.availability));

  const blockedSet = new Set(blockedPairs.map((p) => blockedKey(p.profileIdA, p.profileIdB)));
  function isBlockedWith(candidateIndex: number, chosenIndices: readonly number[]): boolean {
    const candidateProfile = sorted[candidateIndex].profileId;
    return chosenIndices.some((idx) => blockedSet.has(blockedKey(candidateProfile, sorted[idx].profileId)));
  }

  // 2. 역할 슬롯을 역할명 알파벳순으로 정렬해 1명짜리 슬롯들로 펼친다(결정적 처리 순서).
  const slotRoles: string[] = roles
    .slice()
    .sort((a, b) => a.roleName.localeCompare(b.roleName))
    .flatMap((r) => Array(r.capacity).fill(r.roleName));

  const teamSize = slotRoles.length;
  if (teamSize === 0) return null;

  const used = new Array(sorted.length).fill(false) as boolean[];
  const chosenCandidateIndex: number[] = new Array(teamSize).fill(-1);
  const resumeFrom: number[] = new Array(teamSize).fill(0);

  function rangesForChosen(depth: number): WeekRange[] {
    let running: readonly WeekRange[] = FULL_WEEK;
    for (let d = 0; d < depth; d++) {
      running = intersectRanges(running, weeklyRanges[chosenCandidateIndex[d]]);
      if (running.length === 0) break;
    }
    return running as WeekRange[];
  }

  let depth = 0;
  let steps = 0;

  while (depth >= 0 && depth < teamSize) {
    if (steps >= settings.maxBacktrackSteps) return null;
    steps++;

    const role = slotRoles[depth];
    const baseRanges = rangesForChosen(depth);
    let found = -1;

    for (let i = resumeFrom[depth]; i < sorted.length; i++) {
      if (used[i]) continue;
      if (!sorted[i].eligibleRoles.includes(role)) continue;
      if (isBlockedWith(i, chosenCandidateIndex.slice(0, depth))) continue;

      const tentative = intersectRanges(baseRanges, weeklyRanges[i]);
      if (totalMinutes(tentative) < settings.minCommonMinutes) continue; // 교집합은 단조 감소하므로 바로 가지치기

      found = i;
      resumeFrom[depth] = i + 1;
      break;
    }

    if (found >= 0) {
      used[found] = true;
      chosenCandidateIndex[depth] = found;
      depth++;
      if (depth < teamSize) resumeFrom[depth] = 0;
    } else {
      // 이 깊이에서 더 시도할 후보가 없다 — 한 단계 되돌아간다.
      resumeFrom[depth] = 0;
      depth--;
      if (depth >= 0) used[chosenCandidateIndex[depth]] = false;
    }

    // 완전한 조합을 찾았어도 팀장 동의자가 없으면 실패로 취급하고 마지막 슬롯을 되돌려 계속 찾는다.
    if (depth === teamSize) {
      const hasLeader = chosenCandidateIndex.some((idx) => sorted[idx].leaderOptIn);
      if (!hasLeader) {
        depth--;
        used[chosenCandidateIndex[depth]] = false;
      }
    }
  }

  if (depth < teamSize) return null;

  const finalRanges = rangesForChosen(teamSize);
  const leaderIndex = chosenCandidateIndex.find((idx) => sorted[idx].leaderOptIn);
  if (leaderIndex === undefined) return null; // 이론상 도달하지 않음(위에서 이미 보장)

  // 같은 깊이에 여러 역할 슬롯이 있을 수 있으므로 slotRoles 순서와 1:1로 매핑해 역할을 부여한다.
  const members: MatchAssignment[] = chosenCandidateIndex.map((idx, slotIdx) => ({
    profileId: sorted[idx].profileId,
    queueId: sorted[idx].queueId,
    roleName: slotRoles[slotIdx],
  }));

  return {
    members,
    leaderProfileId: sorted[leaderIndex].profileId,
    totalCommonMinutes: totalMinutes(finalRanges),
  };
}
