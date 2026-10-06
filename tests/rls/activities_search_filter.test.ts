import { describe, expect, it } from "vitest";
import { createAnonClient } from "./helpers";
import { queryActivities, type ActivityFilters } from "@/app/activities/queries";

// 코드 검수(에러 유발 #1)에서 PostgREST or() 필터 주입을 막은 수정이 실제 서버를 상대로도
// 에러 없이 동작하는지 확인한다(구조적 안전성은 tests/unit/activities-search-filter.test.ts가
// 이미 커버하므로, 여기서는 "실제 쿼리가 깨지지 않는다"만 확인한다).

function baseFilters(q: string): ActivityFilters {
  return { q, typeId: "", region: "", mode: "all", team: "all", status: "all", page: 1 };
}

describe("queryActivities — 검색어에 PostgREST 예약 문자가 섞여도 쿼리가 깨지지 않는다", () => {
  it.each([
    "a,is_public.eq.false",
    "%",
    "()",
    '" OR 1=1 --',
    "동아리",
  ])("검색어 %p 로도 에러 없이 조회된다", async (q) => {
    const supabase = createAnonClient();
    const result = await queryActivities(supabase, baseFilters(q));
    expect(result.error).toBeNull();
    expect(Array.isArray(result.data)).toBe(true);
  });
});
