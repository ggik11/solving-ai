import { afterEach, describe, expect, it } from "vitest";
import { findMatch, type AvailabilityInterval, type MatchSettings } from "@/lib/matching";
import { createAdminClient, signInAs, TEST_USERS } from "./helpers";

// 5단계: "실제 워커(plpgsql _find_match_for_group)와 단위 테스트 대상인 src/lib/matching.ts의
// findMatch()가 같은 입력에 같은 결론을 내는가"를 직접 비교하는 일치 테스트.
// (PROGRESS.md "먼저: 매칭 로직 일치 검증" 요구사항 — architecture.md 12.2절이 명시한 "두 구현이
// 갈라질 위험"을 실제로 재현·확인한다.)
//
// 같은 시나리오 픽스처를 두 번 쓴다: TS 쪽은 임의의 논리적 profileId로, DB 쪽은 실제 로그인
// 가능한 테스트 프로필(student1/2/3)에 매핑한다. DB 쪽 가능 시간은 테스트 동안 해당 프로필의
// 기존 availability_slots를 모두 치우고 픽스처가 명시한 시간만 넣어(isolate) 두 구현이 정확히
// 같은 입력을 보도록 만들고, 끝나면 원래 데이터로 복원한다.

const DEFAULT_SETTINGS: MatchSettings = { minCommonMinutes: 60, maxCandidates: 30, maxBacktrackSteps: 500 };

interface AvailabilityRow {
  id: string;
  profile_id: string;
  day_of_week: number;
  start_time: string;
  end_time: string;
}

async function isolateAvailability(
  profileIds: string[],
  fixture: Record<string, AvailabilityInterval[]>
): Promise<AvailabilityRow[]> {
  const admin = createAdminClient();
  const { data: original, error } = await admin
    .from("availability_slots")
    .select("id, profile_id, day_of_week, start_time, end_time")
    .in("profile_id", profileIds);
  if (error) throw new Error(`기존 가능 시간 조회 실패: ${error.message}`);

  await admin.from("availability_slots").delete().in("profile_id", profileIds);

  const rows = profileIds.flatMap((profileId) =>
    (fixture[profileId] ?? []).map((slot) => ({
      profile_id: profileId,
      day_of_week: slot.dayOfWeek,
      start_time: minutesToTime(slot.startMinutes),
      end_time: minutesToTime(slot.endMinutes),
    }))
  );
  if (rows.length > 0) {
    const { error: insertError } = await admin.from("availability_slots").insert(rows);
    if (insertError) throw new Error(`픽스처 가능 시간 삽입 실패: ${insertError.message}`);
  }
  return (original ?? []) as AvailabilityRow[];
}

async function restoreAvailability(profileIds: string[], original: AvailabilityRow[]) {
  const admin = createAdminClient();
  await admin.from("availability_slots").delete().in("profile_id", profileIds);
  if (original.length > 0) {
    const { error } = await admin.from("availability_slots").insert(original);
    if (error) throw new Error(`가능 시간 복원 실패: ${error.message}`);
  }
}

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60)
    .toString()
    .padStart(2, "0");
  const m = (minutes % 60).toString().padStart(2, "0");
  return `${h}:${m}`;
}

async function createMatchActivity(title: string) {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from("activities")
    .insert({ title, status: "published", participation_mode: "team", location_type: "offline", is_demo: true })
    .select("id")
    .single();
  if (error || !data) throw new Error(`테스트 활동 생성 실패: ${error?.message}`);
  return data.id as string;
}

async function createTemplate(activityId: string, roles: { roleName: string; capacity: number }[]) {
  const admin = createAdminClient();
  const { data: template, error } = await admin
    .from("activity_match_templates")
    .insert({ activity_id: activityId, name: "일치 검증 템플릿" })
    .select("id")
    .single();
  if (error || !template) throw new Error(`템플릿 생성 실패: ${error?.message}`);
  const { error: rolesError } = await admin
    .from("activity_match_template_roles")
    .insert(roles.map((r) => ({ template_id: template.id, role_name: r.roleName, capacity: r.capacity })));
  if (rolesError) throw new Error(`템플릿 역할 생성 실패: ${rolesError.message}`);
  return template.id as string;
}

async function deleteActivity(activityId: string) {
  const admin = createAdminClient();
  await admin.from("activities").delete().eq("id", activityId);
}

async function runWorker() {
  const admin = createAdminClient();
  const { data, error } = await admin.rpc("run_match_worker", { p_as_of: new Date().toISOString() });
  if (error) throw new Error(`워커 실행 실패: ${error.message}`);
  return data as { new_proposals: number };
}

const P1 = TEST_USERS.student1.id;
const P2 = TEST_USERS.student2.id;
const P3 = TEST_USERS.student3.id;

describe("매칭 로직 일치 검증 — TS findMatch() vs plpgsql _find_match_for_group()", () => {
  let activityId = "";
  let touchedProfileIds: string[] = [];
  let originalAvailability: AvailabilityRow[] = [];

  afterEach(async () => {
    if (activityId) await deleteActivity(activityId);
    activityId = "";
    if (touchedProfileIds.length > 0) {
      await restoreAvailability(touchedProfileIds, originalAvailability);
      touchedProfileIds = [];
      originalAvailability = [];
    }
  });

  it("역할 충족 성공 시나리오에서 두 구현이 같은 결론(매칭 성공, 같은 배정·공통 시간)을 낸다", async () => {
    const mon10to12: AvailabilityInterval = { dayOfWeek: 1, startMinutes: 600, endMinutes: 720 };

    const tsResult = findMatch(
      [
        { queueId: "q1", profileId: P1, waitSince: "2026-01-01T00:00:00Z", eligibleRoles: ["기획"], leaderOptIn: true, availability: [mon10to12] },
        { queueId: "q2", profileId: P2, waitSince: "2026-01-01T00:01:00Z", eligibleRoles: ["개발"], leaderOptIn: false, availability: [mon10to12] },
      ],
      [{ roleName: "기획", capacity: 1 }, { roleName: "개발", capacity: 1 }],
      [],
      DEFAULT_SETTINGS
    );
    expect(tsResult).not.toBeNull();
    expect(tsResult!.leaderProfileId).toBe(P1);
    expect(tsResult!.totalCommonMinutes).toBe(120);

    touchedProfileIds = [P1, P2];
    originalAvailability = await isolateAvailability(touchedProfileIds, { [P1]: [mon10to12], [P2]: [mon10to12] });

    activityId = await createMatchActivity(`일치검증-성공 ${Date.now()}`);
    const templateId = await createTemplate(activityId, [{ roleName: "기획", capacity: 1 }, { roleName: "개발", capacity: 1 }]);
    const s1 = await signInAs(TEST_USERS.student1.email);
    const s2 = await signInAs(TEST_USERS.student2.email);
    await s1.rpc("join_matching_queue", { p_activity_id: activityId, p_template_id: templateId, p_eligible_roles: ["기획"], p_willing_leader: true, p_continue_on_fail: true });
    await s2.rpc("join_matching_queue", { p_activity_id: activityId, p_template_id: templateId, p_eligible_roles: ["개발"], p_willing_leader: false, p_continue_on_fail: true });

    // run_match_worker는 대기 중인 모든 그룹을 한 번에 처리하므로, 동시에 실행되는 다른 테스트의
    // 그룹도 함께 집계된 전역 카운트는 이 활동 하나에 대한 기대값과 비교할 수 없다 — 항상
    // activity_id로 좁혀서 검증한다.
    await runWorker();

    const admin = createAdminClient();
    const { data: proposals } = await admin
      .from("match_proposals")
      .select("id, proposed_leader_profile_id, common_minutes")
      .eq("activity_id", activityId);
    expect(proposals ?? []).toHaveLength(1);
    const proposal = proposals![0]!;
    expect(proposal.proposed_leader_profile_id).toBe(tsResult!.leaderProfileId);
    expect(proposal.common_minutes).toBe(tsResult!.totalCommonMinutes);
  });

  it("겹침의 함정 시나리오에서 두 구현 모두 매칭하지 않는다", async () => {
    const availability: Record<string, AvailabilityInterval[]> = {
      [P1]: [{ dayOfWeek: 4, startMinutes: 600, endMinutes: 720 }, { dayOfWeek: 6, startMinutes: 600, endMinutes: 720 }],
      [P2]: [{ dayOfWeek: 4, startMinutes: 600, endMinutes: 720 }, { dayOfWeek: 5, startMinutes: 600, endMinutes: 720 }],
      [P3]: [{ dayOfWeek: 5, startMinutes: 600, endMinutes: 720 }, { dayOfWeek: 6, startMinutes: 600, endMinutes: 720 }],
    };
    const roles = [{ roleName: "A", capacity: 1 }, { roleName: "B", capacity: 1 }, { roleName: "C", capacity: 1 }];

    const tsResult = findMatch(
      [
        { queueId: "q1", profileId: P1, waitSince: "2026-01-01T00:00:00Z", eligibleRoles: ["A"], leaderOptIn: true, availability: availability[P1] },
        { queueId: "q2", profileId: P2, waitSince: "2026-01-01T00:01:00Z", eligibleRoles: ["B"], leaderOptIn: true, availability: availability[P2] },
        { queueId: "q3", profileId: P3, waitSince: "2026-01-01T00:02:00Z", eligibleRoles: ["C"], leaderOptIn: true, availability: availability[P3] },
      ],
      roles,
      [],
      DEFAULT_SETTINGS
    );
    expect(tsResult).toBeNull();

    touchedProfileIds = [P1, P2, P3];
    originalAvailability = await isolateAvailability(touchedProfileIds, availability);

    activityId = await createMatchActivity(`일치검증-겹침함정 ${Date.now()}`);
    const templateId = await createTemplate(activityId, roles);
    const s1 = await signInAs(TEST_USERS.student1.email);
    const s2 = await signInAs(TEST_USERS.student2.email);
    const s3 = await signInAs(TEST_USERS.student3.email);
    await s1.rpc("join_matching_queue", { p_activity_id: activityId, p_template_id: templateId, p_eligible_roles: ["A"], p_willing_leader: true, p_continue_on_fail: true });
    await s2.rpc("join_matching_queue", { p_activity_id: activityId, p_template_id: templateId, p_eligible_roles: ["B"], p_willing_leader: true, p_continue_on_fail: true });
    await s3.rpc("join_matching_queue", { p_activity_id: activityId, p_template_id: templateId, p_eligible_roles: ["C"], p_willing_leader: true, p_continue_on_fail: true });

    await runWorker();

    const admin = createAdminClient();
    const { data: proposals } = await admin.from("match_proposals").select("id").eq("activity_id", activityId);
    expect(proposals ?? []).toHaveLength(0);
  });

  it("차단 관계로 대안을 선택하는 시나리오에서 두 구현이 같은 팀 구성을 선택한다", async () => {
    // seed.sql이 이미 student1(P1)↔student3(P3) 상호 차단 데모 데이터를 넣어두므로, 새로 차단
    // 관계를 만들지 않고 그 관계를 그대로 재사용한다(대안도 같이 차단되는 거짓 실패를 피함).
    const slot: AvailabilityInterval = { dayOfWeek: 1, startMinutes: 600, endMinutes: 720 };
    const availability = { [P1]: [slot], [P2]: [slot], [P3]: [slot] };
    const roles = [{ roleName: "기획", capacity: 1 }, { roleName: "개발", capacity: 1 }];

    const tsResult = findMatch(
      [
        { queueId: "q-dev1", profileId: P3, waitSince: "2026-01-01T00:00:00Z", eligibleRoles: ["개발"], leaderOptIn: false, availability: [slot] },
        { queueId: "q-dev2", profileId: P2, waitSince: "2026-01-01T00:01:00Z", eligibleRoles: ["개발"], leaderOptIn: false, availability: [slot] },
        { queueId: "q-leader", profileId: P1, waitSince: "2026-01-01T00:02:00Z", eligibleRoles: ["기획"], leaderOptIn: true, availability: [slot] },
      ],
      roles,
      [{ profileIdA: P1, profileIdB: P3 }],
      DEFAULT_SETTINGS
    );
    expect(tsResult).not.toBeNull();
    const tsMemberIds = tsResult!.members.map((m) => m.profileId);
    expect(tsMemberIds).toContain(P2);
    expect(tsMemberIds).not.toContain(P3);

    touchedProfileIds = [P1, P2, P3];
    originalAvailability = await isolateAvailability(touchedProfileIds, availability);

    const admin = createAdminClient();

    activityId = await createMatchActivity(`일치검증-차단 ${Date.now()}`);
    const templateId = await createTemplate(activityId, roles);
    const s1 = await signInAs(TEST_USERS.student1.email);
    const s2 = await signInAs(TEST_USERS.student2.email);
    const s3 = await signInAs(TEST_USERS.student3.email);
    await s3.rpc("join_matching_queue", { p_activity_id: activityId, p_template_id: templateId, p_eligible_roles: ["개발"], p_willing_leader: false, p_continue_on_fail: true });
    await s2.rpc("join_matching_queue", { p_activity_id: activityId, p_template_id: templateId, p_eligible_roles: ["개발"], p_willing_leader: false, p_continue_on_fail: true });
    await s1.rpc("join_matching_queue", { p_activity_id: activityId, p_template_id: templateId, p_eligible_roles: ["기획"], p_willing_leader: true, p_continue_on_fail: true });

    await runWorker();

    const { data: proposals } = await admin.from("match_proposals").select("id, common_minutes").eq("activity_id", activityId);
    expect(proposals ?? []).toHaveLength(1);
    const proposal = proposals![0]!;
    expect(proposal.common_minutes).toBe(tsResult!.totalCommonMinutes);
    const { data: members } = await admin.from("match_proposal_members").select("profile_id").eq("proposal_id", proposal.id);
    const dbMemberIds = (members ?? []).map((m) => m.profile_id as string);
    expect(new Set(dbMemberIds)).toEqual(new Set(tsMemberIds));
  });
});
