import { describe, expect, it } from "vitest";
import { createAdminClient, createAnonClient, signInAs, TEST_USERS } from "./helpers";
import { findInvalidLabels, parseManifestCsv } from "@/lib/modelLab/manifest";

// 티처블 머신 연동 보완: model_class_field_map이 비어 있어 manifest 라벨 검사가 동작하지 않고,
// 모델을 등록해도 model_class_field_map에 연결이 없어 후보 제안이 꺼지던 문제를 고친다.
// docs/teachable-machine-integration.md 3.6/6.2 보완, 마이그레이션 20261013060000.

const PILOT_CLASS_SET_ID = "f0000000-0000-0000-0000-000000000001";
const PILOT6_CLASS_SET_ID = "f0000000-0000-0000-0000-000000000002";
const PILOT7_CLASS_SET_ID = "f0000000-0000-0000-0000-000000000003";
const IT_DATA = "c0000000-0000-0000-0000-000000000002";
const BUSINESS_FINANCE = "c0000000-0000-0000-0000-000000000004";
const DESIGN_MEDIA = "c0000000-0000-0000-0000-000000000005";
const SOCIAL_WELFARE = "c0000000-0000-0000-0000-000000000006";
const ENERGY_ENVIRONMENT = "c0000000-0000-0000-0000-000000000001";
const ENGINEERING = "c0000000-0000-0000-0000-000000000007";
const HUMANITIES_CULTURE = "c0000000-0000-0000-0000-000000000008";
const LAW_POLICY = "c0000000-0000-0000-0000-000000000009";
const ARTS_PERFORMANCE = "c0000000-0000-0000-0000-000000000011";
const SPORTS = "c0000000-0000-0000-0000-000000000012";

const HEADER = "image_path,event_id,series_id,org_name,source_url,collected_at,label,secondary_labels,split,note";

describe("classifier_class_sets — 마이그레이션 예비 구성 'pilot-4-v1'(비활성으로 유지)", () => {
  const admin = createAdminClient();

  it("pilot-4-v1 구성은 지워지지 않고 그대로 남아 있다(비활성)", async () => {
    const { data } = await admin
      .from("classifier_class_sets")
      .select("id, code, is_active")
      .eq("code", "pilot-4-v1")
      .single();
    expect(data?.id).toBe(PILOT_CLASS_SET_ID);
    expect(data?.is_active).toBe(false);
  });

  it("클래스 구성이 가이드 3.6 표대로 들어가 있다(SOCIAL_ENVIRONMENT는 두 후보)", async () => {
    const { data } = await admin
      .from("classifier_class_set_classes")
      .select("class_id, interest_id")
      .eq("class_set_id", PILOT_CLASS_SET_ID);
    const byClass = new Map<string, string[]>();
    for (const row of data ?? []) {
      const list = byClass.get(row.class_id) ?? [];
      list.push(row.interest_id);
      byClass.set(row.class_id, list);
    }
    expect(byClass.get("IT_DATA")).toEqual([IT_DATA]);
    expect(byClass.get("BUSINESS_PLANNING")).toEqual([BUSINESS_FINANCE]);
    expect(byClass.get("DESIGN_MEDIA")).toEqual([DESIGN_MEDIA]);
    expect(new Set(byClass.get("SOCIAL_ENVIRONMENT"))).toEqual(new Set([SOCIAL_WELFARE, ENERGY_ENVIRONMENT]));
  });

  it("비로그인 사용자도 클래스 구성을 조회할 수 있다(manifest 검사 화면이 쓰는 데이터)", async () => {
    const anon = createAnonClient();
    const { data, error } = await anon.from("classifier_class_sets").select("id").eq("code", "pilot-4-v1");
    expect(error).toBeNull();
    expect(data).toHaveLength(1);
  });

  it("일반 사용자는 클래스 구성을 쓸 수 없다", async () => {
    const asStudent1 = await signInAs(TEST_USERS.student1.email);
    const { error, data } = await asStudent1
      .from("classifier_class_sets")
      .insert({ code: "hack-v1", name: "해킹 시도" })
      .select();
    expect(error !== null || (data?.length ?? 0) === 0).toBe(true);
  });
});

describe("classifier_class_sets — 마이그레이션 'pilot-6-v1'(비활성으로 유지)", () => {
  const admin = createAdminClient();

  it("pilot-6-v1 구성은 지워지지 않고 그대로 남아 있다(비활성)", async () => {
    const { data } = await admin
      .from("classifier_class_sets")
      .select("id, code, is_active")
      .eq("code", "pilot-6-v1")
      .single();
    expect(data?.id).toBe(PILOT6_CLASS_SET_ID);
    expect(data?.is_active).toBe(false);
  });

  it("클래스 구성이 가이드 3.6 보완 표대로 들어가 있다(IT_ENGINEERING·SOCIAL_ENVIRONMENT는 두 후보, CAMPUS_NOTICE는 후보 없음)", async () => {
    const { data } = await admin
      .from("classifier_class_set_classes")
      .select("class_id, interest_id")
      .eq("class_set_id", PILOT6_CLASS_SET_ID);
    const byClass = new Map<string, (string | null)[]>();
    for (const row of data ?? []) {
      const list = byClass.get(row.class_id) ?? [];
      list.push(row.interest_id);
      byClass.set(row.class_id, list);
    }
    expect(new Set(byClass.get("IT_ENGINEERING"))).toEqual(new Set([IT_DATA, ENGINEERING]));
    expect(byClass.get("BUSINESS_PLANNING")).toEqual([BUSINESS_FINANCE]);
    expect(byClass.get("DESIGN_MEDIA")).toEqual([DESIGN_MEDIA]);
    expect(new Set(byClass.get("SOCIAL_ENVIRONMENT"))).toEqual(new Set([SOCIAL_WELFARE, ENERGY_ENVIRONMENT]));
    expect(byClass.get("LAW_POLICY")).toEqual([LAW_POLICY]);
    expect(byClass.get("CAMPUS_NOTICE")).toEqual([null]);
  });

  it("manifest 라벨 검사에서 pilot-6-v1의 6개 class_id(CAMPUS_NOTICE 포함)가 모두 정상 라벨로 통과한다", async () => {
    const { data } = await admin
      .from("classifier_class_set_classes")
      .select("class_id")
      .eq("class_set_id", PILOT6_CLASS_SET_ID);
    const classIds = [...new Set((data ?? []).map((r) => r.class_id as string))];
    expect(classIds.sort()).toEqual(
      ["BUSINESS_PLANNING", "CAMPUS_NOTICE", "DESIGN_MEDIA", "IT_ENGINEERING", "LAW_POLICY", "SOCIAL_ENVIRONMENT"].sort()
    );

    const csv = [
      HEADER,
      "a.png,e1,,,,,IT_ENGINEERING,,train,",
      "b.png,e2,,,,,LAW_POLICY,,train,",
      "c.png,e3,,,,,CAMPUS_NOTICE,,train,",
    ].join("\n");
    const { rows } = parseManifestCsv(csv);
    expect(findInvalidLabels(rows, classIds)).toEqual([]);
  });
});

describe("classifier_class_sets — 마이그레이션 'pilot-7-v1'(파일럿 6개 → 7개 확장, 가이드 7.3)", () => {
  const admin = createAdminClient();

  it("활성 구성이 정확히 하나이고 pilot-7-v1이다", async () => {
    const { data } = await admin.from("classifier_class_sets").select("id, code, is_active").eq("is_active", true);
    expect(data).toHaveLength(1);
    expect(data?.[0].code).toBe("pilot-7-v1");
    expect(data?.[0].id).toBe(PILOT7_CLASS_SET_ID);
  });

  it("클래스 구성이 가이드 3.6 보완 표대로 들어가 있다(DESIGN_MEDIA는 두 후보, HOBBY_CULTURE는 세 후보, CAMPUS_NOTICE는 후보 없음)", async () => {
    const { data } = await admin
      .from("classifier_class_set_classes")
      .select("class_id, interest_id")
      .eq("class_set_id", PILOT7_CLASS_SET_ID);
    const byClass = new Map<string, (string | null)[]>();
    for (const row of data ?? []) {
      const list = byClass.get(row.class_id) ?? [];
      list.push(row.interest_id);
      byClass.set(row.class_id, list);
    }
    expect(new Set(byClass.get("IT_ENGINEERING"))).toEqual(new Set([IT_DATA, ENGINEERING]));
    expect(byClass.get("BUSINESS_PLANNING")).toEqual([BUSINESS_FINANCE]);
    expect(new Set(byClass.get("DESIGN_MEDIA"))).toEqual(new Set([DESIGN_MEDIA, ARTS_PERFORMANCE]));
    expect(new Set(byClass.get("SOCIAL_ENVIRONMENT"))).toEqual(new Set([SOCIAL_WELFARE, ENERGY_ENVIRONMENT]));
    expect(byClass.get("LAW_POLICY")).toEqual([LAW_POLICY]);
    expect(byClass.get("CAMPUS_NOTICE")).toEqual([null]);
    expect(new Set(byClass.get("HOBBY_CULTURE"))).toEqual(new Set([SPORTS, ARTS_PERFORMANCE, HUMANITIES_CULTURE]));
  });

  it("manifest 라벨 검사에서 pilot-7-v1의 7개 class_id(CAMPUS_NOTICE·HOBBY_CULTURE 포함)가 모두 정상 라벨로 통과한다", async () => {
    const { data } = await admin
      .from("classifier_class_set_classes")
      .select("class_id")
      .eq("class_set_id", PILOT7_CLASS_SET_ID);
    const classIds = [...new Set((data ?? []).map((r) => r.class_id as string))];
    expect(classIds.sort()).toEqual(
      [
        "BUSINESS_PLANNING",
        "CAMPUS_NOTICE",
        "DESIGN_MEDIA",
        "HOBBY_CULTURE",
        "IT_ENGINEERING",
        "LAW_POLICY",
        "SOCIAL_ENVIRONMENT",
      ].sort()
    );

    const csv = [
      HEADER,
      "a.png,e1,,,,,IT_ENGINEERING,,train,",
      "b.png,e2,,,,,HOBBY_CULTURE,,train,",
      "c.png,e3,,,,,CAMPUS_NOTICE,,train,",
    ].join("\n");
    const { rows } = parseManifestCsv(csv);
    expect(findInvalidLabels(rows, classIds)).toEqual([]);
  });

  it("같은 (class_set_id, class_id, interest_id=null) 행을 또 넣으면 유니크 제약(NULLS NOT DISTINCT)이 막는다", async () => {
    const { error } = await admin
      .from("classifier_class_set_classes")
      .insert({ class_set_id: PILOT7_CLASS_SET_ID, class_id: "CAMPUS_NOTICE", interest_id: null });
    expect(error).not.toBeNull();
    expect(error?.message.toLowerCase()).toContain("duplicate");
  });
});

describe("manifest 라벨 검사 — 활성 클래스 구성 기준(가이드 6.2 보완)", () => {
  const admin = createAdminClient();

  it("pilot-4-v1의 class_id는 정상 라벨로 통과한다", async () => {
    const { data } = await admin
      .from("classifier_class_set_classes")
      .select("class_id")
      .eq("class_set_id", PILOT_CLASS_SET_ID);
    const classIds = [...new Set((data ?? []).map((r) => r.class_id as string))];

    const csv = [
      HEADER,
      "a.png,e1,,,,,IT_DATA,,train,",
      "b.png,e2,,,,,BUSINESS_PLANNING,,train,",
      "c.png,e3,,,,,DESIGN_MEDIA,,train,",
      "d.png,e4,,,,,SOCIAL_ENVIRONMENT,,train,",
    ].join("\n");
    const { rows } = parseManifestCsv(csv);
    expect(findInvalidLabels(rows, classIds)).toEqual([]);
  });

  it("클래스 구성에 없는 라벨은 무효로 잡힌다", async () => {
    const { data } = await admin
      .from("classifier_class_set_classes")
      .select("class_id")
      .eq("class_set_id", PILOT_CLASS_SET_ID);
    const classIds = [...new Set((data ?? []).map((r) => r.class_id as string))];

    const csv = [HEADER, "a.png,e1,,,,,NOT_A_REAL_CLASS,,train,"].join("\n");
    const { rows } = parseManifestCsv(csv);
    const invalid = findInvalidLabels(rows, classIds);
    expect(invalid).toHaveLength(1);
    expect(invalid[0].label).toBe("NOT_A_REAL_CLASS");
  });
});

describe("register_classifier_model — 등록·재등록(가이드 3.6 보완)", () => {
  const admin = createAdminClient();

  async function cleanup(modelVersion: string) {
    await admin.from("classifier_model_registrations").delete().eq("model_version", modelVersion);
    await admin.from("model_class_field_map").delete().eq("model_version", modelVersion);
  }

  it("labels가 선택한 클래스 구성과 일치하지 않으면 등록을 거부한다", async () => {
    const modelVersion = `test-mismatch-${Date.now()}`;
    const asAdmin = await signInAs(TEST_USERS.admin.email);
    try {
      const { error } = await asAdmin.rpc("register_classifier_model", {
        p_model_version: modelVersion,
        p_class_set_id: PILOT_CLASS_SET_ID,
        p_labels: ["IT_DATA", "WRONG_LABEL"],
      });
      expect(error).not.toBeNull();
      expect(error?.message).toContain("LABELS_MISMATCH");

      const { data } = await admin.from("classifier_model_registrations").select("id").eq("model_version", modelVersion);
      expect(data ?? []).toHaveLength(0);
    } finally {
      await cleanup(modelVersion);
    }
  });

  it("일반 사용자는 모델을 등록할 수 없다", async () => {
    const modelVersion = `test-not-admin-${Date.now()}`;
    const asStudent1 = await signInAs(TEST_USERS.student1.email);
    try {
      const { error } = await asStudent1.rpc("register_classifier_model", {
        p_model_version: modelVersion,
        p_class_set_id: PILOT_CLASS_SET_ID,
        p_labels: ["IT_DATA", "BUSINESS_PLANNING", "DESIGN_MEDIA", "SOCIAL_ENVIRONMENT"],
      });
      expect(error).not.toBeNull();
      expect(error?.message).toContain("NOT_ADMIN");
    } finally {
      await cleanup(modelVersion);
    }
  });

  it("labels가 일치하면 등록되고, model_class_field_map이 클래스 구성에서 복사되어 후보 제안이 가능해진다(목 모델)", async () => {
    const modelVersion = `test-success-${Date.now()}`;
    const asAdmin = await signInAs(TEST_USERS.admin.email);
    try {
      const { data: registrationId, error } = await asAdmin.rpc("register_classifier_model", {
        p_model_version: modelVersion,
        p_class_set_id: PILOT_CLASS_SET_ID,
        p_labels: ["IT_DATA", "BUSINESS_PLANNING", "DESIGN_MEDIA", "SOCIAL_ENVIRONMENT"],
      });
      expect(error).toBeNull();
      expect(registrationId).toBeTruthy();

      const { data: registration } = await admin
        .from("classifier_model_registrations")
        .select("model_version, class_set_id, registered_by")
        .eq("model_version", modelVersion)
        .single();
      expect(registration?.class_set_id).toBe(PILOT_CLASS_SET_ID);
      expect(registration?.registered_by).toBe(TEST_USERS.admin.id);

      // 목 모델이 IT_DATA를 1위로 예측했다고 가정 — 이제 연결표가 있으니 후보가 나와야 한다.
      const { data: map } = await admin
        .from("model_class_field_map")
        .select("class_id, interest_id")
        .eq("model_version", modelVersion)
        .eq("class_id", "IT_DATA");
      expect(map).toEqual([{ class_id: "IT_DATA", interest_id: IT_DATA }]);

      const { data: socialMap } = await admin
        .from("model_class_field_map")
        .select("interest_id")
        .eq("model_version", modelVersion)
        .eq("class_id", "SOCIAL_ENVIRONMENT");
      expect(new Set((socialMap ?? []).map((r) => r.interest_id))).toEqual(new Set([SOCIAL_WELFARE, ENERGY_ENVIRONMENT]));
    } finally {
      await cleanup(modelVersion);
    }
  });

  it("같은 버전을 다시 등록해도 중복되지 않는다(멱등)", async () => {
    const modelVersion = `test-idempotent-${Date.now()}`;
    const asAdmin = await signInAs(TEST_USERS.admin.email);
    try {
      const labels = ["IT_DATA", "BUSINESS_PLANNING", "DESIGN_MEDIA", "SOCIAL_ENVIRONMENT"];
      await asAdmin.rpc("register_classifier_model", {
        p_model_version: modelVersion,
        p_class_set_id: PILOT_CLASS_SET_ID,
        p_labels: labels,
      });
      const { error } = await asAdmin.rpc("register_classifier_model", {
        p_model_version: modelVersion,
        p_class_set_id: PILOT_CLASS_SET_ID,
        p_labels: labels,
      });
      expect(error).toBeNull();

      const { data: registrations } = await admin
        .from("classifier_model_registrations")
        .select("id")
        .eq("model_version", modelVersion);
      expect(registrations).toHaveLength(1);

      const { data: mapRows } = await admin.from("model_class_field_map").select("id").eq("model_version", modelVersion);
      // IT_DATA/BUSINESS_PLANNING/DESIGN_MEDIA 1행씩 + SOCIAL_ENVIRONMENT 2행 = 5행, 재등록 후에도 그대로.
      expect(mapRows).toHaveLength(5);
    } finally {
      await cleanup(modelVersion);
    }
  });

  it("pilot-6-v1로 등록하면 CAMPUS_NOTICE도 model_class_field_map에 복사되고 interest_id는 null이다(가이드 3.6/7.3 보완)", async () => {
    const modelVersion = `test-pilot6-${Date.now()}`;
    const asAdmin = await signInAs(TEST_USERS.admin.email);
    try {
      const { error } = await asAdmin.rpc("register_classifier_model", {
        p_model_version: modelVersion,
        p_class_set_id: PILOT6_CLASS_SET_ID,
        p_labels: ["IT_ENGINEERING", "BUSINESS_PLANNING", "DESIGN_MEDIA", "SOCIAL_ENVIRONMENT", "LAW_POLICY", "CAMPUS_NOTICE"],
      });
      expect(error).toBeNull();

      const { data: campusNoticeMap } = await admin
        .from("model_class_field_map")
        .select("interest_id")
        .eq("model_version", modelVersion)
        .eq("class_id", "CAMPUS_NOTICE");
      expect(campusNoticeMap).toEqual([{ interest_id: null }]);

      const { data: itEngineeringMap } = await admin
        .from("model_class_field_map")
        .select("interest_id")
        .eq("model_version", modelVersion)
        .eq("class_id", "IT_ENGINEERING");
      expect(new Set((itEngineeringMap ?? []).map((r) => r.interest_id))).toEqual(new Set([IT_DATA, ENGINEERING]));
    } finally {
      await cleanup(modelVersion);
    }
  });

  it("pilot-7-v1로 등록하면 DESIGN_MEDIA·HOBBY_CULTURE는 여러 후보로, CAMPUS_NOTICE는 interest_id null로 복사된다(가이드 3.6/7.3 보완)", async () => {
    const modelVersion = `test-pilot7-${Date.now()}`;
    const asAdmin = await signInAs(TEST_USERS.admin.email);
    try {
      const { error } = await asAdmin.rpc("register_classifier_model", {
        p_model_version: modelVersion,
        p_class_set_id: PILOT7_CLASS_SET_ID,
        p_labels: [
          "IT_ENGINEERING",
          "BUSINESS_PLANNING",
          "DESIGN_MEDIA",
          "SOCIAL_ENVIRONMENT",
          "LAW_POLICY",
          "CAMPUS_NOTICE",
          "HOBBY_CULTURE",
        ],
      });
      expect(error).toBeNull();

      const { data: designMediaMap } = await admin
        .from("model_class_field_map")
        .select("interest_id")
        .eq("model_version", modelVersion)
        .eq("class_id", "DESIGN_MEDIA");
      expect(new Set((designMediaMap ?? []).map((r) => r.interest_id))).toEqual(new Set([DESIGN_MEDIA, ARTS_PERFORMANCE]));

      const { data: hobbyCultureMap } = await admin
        .from("model_class_field_map")
        .select("interest_id")
        .eq("model_version", modelVersion)
        .eq("class_id", "HOBBY_CULTURE");
      expect(new Set((hobbyCultureMap ?? []).map((r) => r.interest_id))).toEqual(
        new Set([SPORTS, ARTS_PERFORMANCE, HUMANITIES_CULTURE])
      );

      const { data: campusNoticeMap } = await admin
        .from("model_class_field_map")
        .select("interest_id")
        .eq("model_version", modelVersion)
        .eq("class_id", "CAMPUS_NOTICE");
      expect(campusNoticeMap).toEqual([{ interest_id: null }]);

      // model_class_field_map도 (model_version, class_id, interest_id)가 NULLS NOT DISTINCT라
      // 같은 null 행을 또 넣으면 막혀야 한다.
      const { error: dupError } = await admin
        .from("model_class_field_map")
        .insert({ model_version: modelVersion, class_id: "CAMPUS_NOTICE", interest_id: null });
      expect(dupError).not.toBeNull();
      expect(dupError?.message.toLowerCase()).toContain("duplicate");
    } finally {
      await cleanup(modelVersion);
    }
  });
});

describe("classifier_model_registrations — 운영자만 조회", () => {
  it("일반 사용자는 등록 기록을 조회할 수 없다", async () => {
    const asStudent1 = await signInAs(TEST_USERS.student1.email);
    const { data } = await asStudent1.from("classifier_model_registrations").select("id");
    expect(data ?? []).toHaveLength(0);
  });
});
