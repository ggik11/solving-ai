import { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// 5-B 보안 리뷰 후속: `revoke all on function ... from public`로는 Supabase가 함수 생성
// 시점에 anon/authenticated 역할 이름으로 직접 거는 기본 EXECUTE grant를 전혀 지울 수 없다는
// 사실이 드러났다(20261004060000/20261004070000, docs/architecture.md 13장). "일반 사용자가
// 호출해도 되는 함수"를 아래 허용 목록으로 명시하고, public 스키마의 나머지 모든 함수가
// anon/authenticated에게 EXECUTE를 쥐고 있지 않은지 전수로 가드한다. 새 마이그레이션이
// 함수를 추가하면서 EXECUTE 정리를 빠뜨리면(혹은 Supabase 기본값이 다시 열어버리면) 이 테스트가
// 실패해야 한다 — PostgREST/Supabase-js의 `.from()`으로는 pg_catalog/information_schema를
// 조회할 수 없으므로(노출된 스키마가 아님) `tests/global-setup.ts`와 같은 방식으로 로컬
// Postgres 포트(54322)에 직접 연결해 확인한다.

const DB_URL = process.env.SUPABASE_DB_URL ?? "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

// anon이 아예 호출할 필요가 없는데도 호출 가능했던(leak) 함수는 authenticated에만 둔다.
// anon이 실제로 필요한 건 is_admin()/is_party_member(uuid) 둘뿐이다 — anon도 조회 가능한
// 테이블(activities/profiles/party_members/chat_*)의 RLS USING절이 이 두 함수를 직접 호출하기
// 때문에, anon의 EXECUTE가 없으면 그 테이블 조회 자체가 "permission denied for function"으로
// 깨진다(tests/rls/anon.test.ts가 "에러 없이 빈 배열"을 기대함).
const ALLOWLIST: Record<string, readonly ("anon" | "authenticated")[]> = {
  "is_admin()": ["anon", "authenticated"],
  "is_party_member(uuid)": ["anon", "authenticated"],

  "apply_to_party(uuid, uuid, text)": ["authenticated"],
  "approve_activity_submission(uuid, uuid, uuid[], uuid[])": ["authenticated"],
  "approve_application(uuid)": ["authenticated"],
  "cancel_application(uuid)": ["authenticated"],
  "cancel_matching_queue(uuid)": ["authenticated"],
  "check_url_fetch_rate_limit()": ["authenticated"],
  "confirm_party(uuid)": ["authenticated"],
  "create_activity_with_fields(text, text, text, text, text, text, text, uuid, text, text, integer, integer, text, timestamp with time zone, timestamp with time zone, timestamp with time zone, timestamp with time zone, text, text, text, numeric, text, uuid[], uuid, uuid[], uuid[], text, text, text, jsonb, text, numeric, numeric, text, text, text, text, text, text, text, text, text, integer, jsonb)":
    ["authenticated"],
  "create_party(uuid, text, text, text, timestamp with time zone, jsonb, text)": ["authenticated"],
  "create_report(text, uuid, text, text)": ["authenticated"],
  "delegate_leader(uuid, uuid)": ["authenticated"],
  "disband_party(uuid)": ["authenticated"],
  "find_cached_poster_analysis(uuid, text, text, text)": ["authenticated"],
  "get_reported_message_context(uuid, integer)": ["authenticated"],
  "is_match_proposal_member(uuid)": ["authenticated"],
  "join_matching_queue(uuid, uuid, text[], boolean, boolean)": ["authenticated"],
  "leave_party(uuid)": ["authenticated"],
  "list_my_chat_rooms()": ["authenticated"],
  "lookup_org_field_history(text)": ["authenticated"],
  "mark_all_notifications_read()": ["authenticated"],
  "mark_chat_read(uuid, uuid)": ["authenticated"],
  "mark_notification_read(uuid)": ["authenticated"],
  "record_poster_analysis(uuid, text, text, text, jsonb, text, numeric, numeric, text, text, text, text, text, text, text, text, text, integer, jsonb)":
    ["authenticated"],
  "register_classifier_model(text, uuid, text[])": ["authenticated"],
  "reject_activity_submission(uuid, text)": ["authenticated"],
  "reject_application(uuid)": ["authenticated"],
  "reopen_party(uuid)": ["authenticated"],
  "respond_to_match_proposal(uuid, boolean)": ["authenticated"],
  "send_chat_message(uuid, text, text)": ["authenticated"],
  "submit_activity(text, text, text, text, text, text, text, text, timestamp with time zone, timestamp with time zone, timestamp with time zone, timestamp with time zone, text, text, uuid, uuid[], uuid[], text, text, text, jsonb, text, numeric, numeric, text, text, text, text, text, text, text, text, text, integer, jsonb)":
    ["authenticated"],
  "suspend_account(uuid, text)": ["authenticated"],
  "unsuspend_account(uuid)": ["authenticated"],
  "update_party_details(uuid, text, text, text, timestamp with time zone, jsonb, jsonb)": ["authenticated"],
  "update_report_status(uuid, text, text)": ["authenticated"],
  "withdraw_account()": ["authenticated"],
};

type Grant = { name: string; args: string; grantee: "anon" | "authenticated" };

let client: Client;
let grants: Grant[];

function signatureOf(name: string, args: string): string {
  if (args.trim() === "") return `${name}()`;
  const types = args
    .split(",")
    .map((part) => part.trim().split(/\s+/).slice(1).join(" "));
  return `${name}(${types.join(", ")})`;
}

beforeAll(async () => {
  client = new Client({ connectionString: DB_URL });
  await client.connect();

  // aclexplode로 proacl을 직접 풀어낸다 — information_schema.routine_privileges는 오버로드된
  // 함수의 인자 타입을 구분해 주지 않아 시그니처 단위 검사에 부족하다.
  const { rows } = await client.query<{ name: string; args: string; grantee: string }>(`
    select
      p.proname as name,
      pg_get_function_identity_arguments(p.oid) as args,
      r.rolname as grantee
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    cross join lateral aclexplode(coalesce(p.proacl, acldefault('f', p.proowner))) a
    join pg_roles r on r.oid = a.grantee
    where n.nspname = 'public'
      and a.privilege_type = 'EXECUTE'
      and r.rolname in ('anon', 'authenticated')
    order by p.proname, r.rolname
  `);
  grants = rows as Grant[];
});

afterAll(async () => {
  await client.end();
});

describe("public 스키마 함수의 anon/authenticated EXECUTE 권한", () => {
  it("허용 목록에 없는 함수는 anon/authenticated에게 EXECUTE가 전혀 없다", () => {
    const bySignature = new Map<string, Set<string>>();
    for (const g of grants) {
      const sig = signatureOf(g.name, g.args);
      if (!bySignature.has(sig)) bySignature.set(sig, new Set());
      bySignature.get(sig)!.add(g.grantee);
    }

    const unexpected: string[] = [];
    for (const [sig, grantees] of bySignature) {
      if (!(sig in ALLOWLIST)) {
        unexpected.push(`${sig} -> ${[...grantees].sort().join(",")}`);
      }
    }

    expect(
      unexpected,
      `허용 목록 밖인데 anon/authenticated에게 열려 있는 함수:\n${unexpected.join("\n")}`
    ).toEqual([]);
  });

  it("허용 목록의 각 함수는 정확히 지정된 역할에만 열려 있다(초과·누락 모두 실패)", () => {
    const bySignature = new Map<string, Set<string>>();
    for (const g of grants) {
      const sig = signatureOf(g.name, g.args);
      if (!bySignature.has(sig)) bySignature.set(sig, new Set());
      bySignature.get(sig)!.add(g.grantee);
    }

    const mismatches: string[] = [];
    for (const [sig, expectedRoles] of Object.entries(ALLOWLIST)) {
      const actual = [...(bySignature.get(sig) ?? new Set())].sort();
      const expected = [...expectedRoles].sort();
      if (actual.join(",") !== expected.join(",")) {
        mismatches.push(`${sig}: 기대 [${expected.join(",")}], 실제 [${actual.join(",")}]`);
      }
    }

    expect(mismatches, mismatches.join("\n")).toEqual([]);
  });

  it("run_match_worker(기준 시각 워커)는 anon/authenticated 둘 다 호출할 수 없다", () => {
    const hits = grants.filter((g) => g.name === "run_match_worker");
    expect(hits).toEqual([]);
  });

  it("_로 시작하는 내부 전용 함수는 anon/authenticated 둘 다 호출할 수 없다", () => {
    const hits = grants.filter((g) => g.name.startsWith("_"));
    expect(hits).toEqual([]);
  });

  it("트리거 전용 헬퍼(create_notification 등 내부 보조 함수 포함)도 anon/authenticated에 열려 있지 않다", () => {
    const internalOnly = [
      "set_updated_at",
      "handle_new_user",
      "party_members_before_insert",
      "party_members_sync_slot_count",
      "parties_sync_confirmed_members",
      "parties_create_chat_room",
      "chat_messages_broadcast",
      "create_notification",
      "insert_system_chat_message",
      "lock_activity_membership",
      "is_admin_profile",
    ];
    const hits = grants.filter((g) => internalOnly.includes(g.name));
    expect(hits).toEqual([]);
  });
});

describe("public 스키마의 함수 기본 권한(ALTER DEFAULT PRIVILEGES)", () => {
  it("postgres 역할이 만드는 새 함수는 더 이상 anon/authenticated에게 자동으로 EXECUTE를 주지 않는다", async () => {
    const { rows } = await client.query<{ defaclacl: string[] | null; default_for_role: string }>(`
      select
        defaclacl::text[] as defaclacl,
        (select rolname from pg_roles where oid = defaclrole) as default_for_role
      from pg_default_acl
      where defaclnamespace = 'public'::regnamespace
        and defaclobjtype = 'f'
        and defaclrole = 'postgres'::regrole
    `);

    expect(rows).toHaveLength(1);
    const acl = rows[0].defaclacl ?? [];
    const grantsToAnonOrAuthenticated = acl.filter(
      (entry) => entry.startsWith("anon=") || entry.startsWith("authenticated=")
    );
    expect(grantsToAnonOrAuthenticated).toEqual([]);
  });
});
