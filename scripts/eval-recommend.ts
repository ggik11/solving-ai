// 6.4 추천 평가(가이드 6.4, G4) — 실제 DB의 활동·분야 확정 상태를 그대로 두고, 15개의 합성
// 테스트 프로필(단과대학별·복수전공·부전공·전공 미배정·관심분야만 입력·모드별)로
// rankActivities()를 돌려 프로필별 상위 5개, 점수 구성, 근거를 CSV로 출력한다. 전공 항목을
// 끈 버전(변형: no_major_variant)도 같은 CSV에 함께 쓴다 — 비교는 variant 컬럼으로 한다.
//
// 사용법: npm run eval:recommend
//
// 테스트 프로필은 실제 auth 계정을 만들지 않는다 — rankActivities()가 순수 함수라
// RecommendationProfileInput 객체만 있으면 되므로, DB에서 실제 활동·분야·전공·관심분야만
// 읽고 프로필은 이 스크립트가 메모리에서 구성한다.
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  DEFAULT_RECOMMENDATION_MODES,
  rankActivities,
  type ActivityFieldInput,
  type MajorRelevanceInput,
  type RecommendationActivityInput,
  type RecommendationModesConfig,
  type RecommendationProfileInput,
  type UserSelectableRecommendationMode,
} from "../src/lib/recommend";

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
config({ path: path.join(projectRoot, ".env.local") });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !serviceKey) {
  console.error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY가 .env.local에 필요합니다 (supabase start 출력 참고).");
  process.exit(1);
}
const admin = createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });

interface MajorRow {
  id: string;
  name: string;
  department: string;
}
interface InterestRow {
  id: string;
  name: string;
}
interface FieldWeightRow {
  major_id: string;
  interest_id: string;
  weight: number;
}
interface ActivityTypeRow {
  id: string;
  name: string;
}
interface ActivityRow {
  id: string;
  title: string;
  activity_type_id: string | null;
  location_type: "online" | "offline" | "hybrid";
  region: string | null;
  apply_end_at: string | null;
  last_verified_at: string | null;
  weekly_hours: number | null;
  eligibility_scope: "any" | "restricted" | "unknown";
  eligible_major_ids: string[];
}
interface ActivityFieldRow {
  activity_id: string;
  interest_id: string;
  role: "primary" | "secondary";
}

async function main() {
  const [{ data: majors }, { data: interests }, { data: fieldWeights }, { data: activityTypes }, { data: modeSettings }] = await Promise.all([
    admin.from("majors").select("id, name, department").eq("is_active", true).order("sort_order").returns<MajorRow[]>(),
    admin.from("interests").select("id, name").eq("is_active", true).order("sort_order").returns<InterestRow[]>(),
    admin.from("major_field_weights").select("major_id, interest_id, weight").returns<FieldWeightRow[]>(),
    admin.from("activity_types").select("id, name").order("name").returns<ActivityTypeRow[]>(),
    admin.from("app_settings").select("value").eq("key", "recommendation_modes").maybeSingle(),
  ]);
  const { data: activities } = await admin
    .from("activities")
    .select("id, title, activity_type_id, location_type, region, apply_end_at, last_verified_at, weekly_hours, eligibility_scope, eligible_major_ids")
    .eq("status", "published")
    .returns<ActivityRow[]>();
  const { data: activityFieldRows } = await admin.from("activity_fields").select("activity_id, interest_id, role").returns<ActivityFieldRow[]>();

  if (!majors || !interests || !fieldWeights || !activities || !activityFieldRows || !activityTypes) {
    console.error("필요한 참조 데이터를 읽지 못했습니다. 로컬 Supabase가 실행 중인지 확인해 주세요.");
    process.exit(1);
  }

  const interestNameById = new Map(interests.map((i) => [i.id, i.name] as const));
  const fieldWeightsByMajor = new Map<string, Record<string, number>>();
  for (const row of fieldWeights) {
    const map = fieldWeightsByMajor.get(row.major_id) ?? {};
    map[row.interest_id] = row.weight;
    fieldWeightsByMajor.set(row.major_id, map);
  }
  const fieldsByActivity = new Map<string, ActivityFieldInput[]>();
  for (const row of activityFieldRows) {
    const list = fieldsByActivity.get(row.activity_id) ?? [];
    list.push({ interestId: row.interest_id, interestName: interestNameById.get(row.interest_id) ?? row.interest_id, role: row.role });
    fieldsByActivity.set(row.activity_id, list);
  }

  const modes: RecommendationModesConfig = (modeSettings?.value as RecommendationModesConfig) ?? DEFAULT_RECOMMENDATION_MODES;

  const recActivities: RecommendationActivityInput[] = activities.map((a) => ({
    id: a.id,
    fields: fieldsByActivity.get(a.id) ?? [],
    activityTypeId: a.activity_type_id,
    locationType: a.location_type,
    region: a.region,
    applyEndAt: a.apply_end_at,
    lastVerifiedAt: a.last_verified_at,
    weeklyHours: a.weekly_hours,
    eligibilityScope: a.eligibility_scope,
    eligibleMajorIds: a.eligible_major_ids,
  }));
  const activityTitleById = new Map(activities.map((a) => [a.id, a.title] as const));

  function major(m: MajorRow, weight: number): MajorRelevanceInput {
    return { majorId: m.id, majorName: m.name, weight, fieldWeights: fieldWeightsByMajor.get(m.id) ?? {} };
  }
  function interestWeight(i: InterestRow, weight: number) {
    return { interestId: i.id, interestName: i.name, weight };
  }

  const byDepartment = new Map<string, MajorRow>();
  for (const m of majors) if (!byDepartment.has(m.department)) byDepartment.set(m.department, m);
  const departmentMajors = [...byDepartment.values()].slice(0, 8);

  const profiles: { name: string; input: RecommendationProfileInput }[] = [];

  departmentMajors.forEach((m, i) => {
    profiles.push({
      name: `단과대학-${m.department}-${m.name}`,
      input: {
        interestWeights: [interestWeight(interests[i % interests.length], 0.6), interestWeight(interests[(i + 1) % interests.length], 0.4)],
        majors: [major(m, 1)],
        majorStatus: "assigned",
        recommendationMode: "balanced",
        preferredActivityTypeIds: activityTypes.length > 0 && i % 2 === 0 ? [activityTypes[0].id] : [],
        preferredLocationType: i % 3 === 0 ? "offline" : i % 3 === 1 ? "online" : null,
        preferredRegion: null,
        weeklyAvailableHours: i % 2 === 0 ? 10 : null,
      },
    });
  });

  if (majors.length >= 2) {
    profiles.push({
      name: "복수전공(균등 가중)",
      input: {
        interestWeights: [interestWeight(interests[0], 1)],
        majors: [major(majors[0], 0.5), major(majors[1], 0.5)],
        majorStatus: "assigned",
        recommendationMode: "balanced",
        preferredActivityTypeIds: [],
        preferredLocationType: null,
        preferredRegion: null,
        weeklyAvailableHours: null,
      },
    });
    profiles.push({
      name: "부전공(주전공 비중 높음)",
      input: {
        interestWeights: [interestWeight(interests[1], 1)],
        majors: [major(majors[0], 0.7), major(majors[1], 0.3)],
        majorStatus: "assigned",
        recommendationMode: "balanced",
        preferredActivityTypeIds: [],
        preferredLocationType: null,
        preferredRegion: null,
        weeklyAvailableHours: null,
      },
    });
  }

  profiles.push({
    name: "전공 미배정",
    input: {
      interestWeights: [interestWeight(interests[2], 1)],
      majors: [],
      majorStatus: "not_provided",
      recommendationMode: "balanced",
      preferredActivityTypeIds: [],
      preferredLocationType: null,
      preferredRegion: null,
      weeklyAvailableHours: null,
    },
  });

  profiles.push({
    name: "관심분야만 입력(전공 탐색 중)",
    input: {
      interestWeights: [interestWeight(interests[3], 0.5), interestWeight(interests[4], 0.3), interestWeight(interests[5], 0.2)],
      majors: [],
      majorStatus: "exploring",
      recommendationMode: "interest_expand",
      preferredActivityTypeIds: [],
      preferredLocationType: null,
      preferredRegion: null,
      weeklyAvailableHours: null,
    },
  });

  const modeVariants: UserSelectableRecommendationMode[] = ["balanced", "major_focus", "interest_expand"];
  if (majors.length > 0) {
    for (const mode of modeVariants) {
      profiles.push({
        name: `모드-${mode}`,
        input: {
          interestWeights: [interestWeight(interests[0], 1)],
          majors: [major(majors[0], 1)],
          majorStatus: "assigned",
          recommendationMode: mode,
          preferredActivityTypeIds: [],
          preferredLocationType: null,
          preferredRegion: null,
          weeklyAvailableHours: null,
        },
      });
    }
  }

  type Row = {
    profile: string;
    variant: "normal" | "no_major";
    rank: number;
    activityId: string;
    activityTitle: string;
    score: string;
    isDiscovery: boolean;
    eligibility: string;
    reasons: string;
  };
  const rows: Row[] = [];

  for (const { name, input } of profiles) {
    for (const variant of ["normal", "no_major"] as const) {
      const effectiveInput: RecommendationProfileInput =
        variant === "no_major" ? { ...input, majors: [], majorStatus: "not_provided" } : input;
      const ranked = rankActivities(effectiveInput, recActivities, modes, { limit: 5 });
      ranked.forEach((r, i) => {
        rows.push({
          profile: name,
          variant,
          rank: i + 1,
          activityId: r.activityId,
          activityTitle: activityTitleById.get(r.activityId) ?? "",
          score: r.score != null ? r.score.toFixed(1) : "",
          isDiscovery: r.isDiscovery,
          eligibility: r.eligibility,
          reasons: r.reasons.join("; "),
        });
      });
    }
  }

  const header = ["profile", "variant", "rank", "activity_id", "activity_title", "score", "is_discovery", "eligibility", "reasons"];
  const csvEscape = (v: string) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const csv = [
    header.join(","),
    ...rows.map((r) =>
      [r.profile, r.variant, String(r.rank), r.activityId, r.activityTitle, r.score, String(r.isDiscovery), r.eligibility, r.reasons]
        .map(csvEscape)
        .join(",")
    ),
  ].join("\n");

  const outDir = path.join(projectRoot, "eval-output");
  mkdirSync(outDir, { recursive: true });
  const outPath = path.join(outDir, `recommend-eval-${Date.now()}.csv`);
  writeFileSync(outPath, csv, "utf-8");

  console.log(`추천 평가 완료: ${profiles.length}개 프로필 × 2개 변형(normal/no_major) → ${rows.length}행`);
  console.log(`결과 저장: ${outPath}`);
  console.log("사람이 적합 여부(1/0)를 채우면 Precision@5와 지원 자격 위반 건수를 계산할 수 있습니다(가이드 6.4) — 이 스크립트는 그 입력값까지는 만들지 않습니다.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
