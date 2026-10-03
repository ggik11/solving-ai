import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActivityWithType } from "@/lib/supabase/types";

export const PAGE_SIZE = 10;
export const CLOSING_SOON_HOURS = 48;

export type StatusFilter = "all" | "open" | "closing_soon" | "upcoming" | "closed";
export type TeamFilter = "all" | "solo_ok" | "team_ok";

export interface ActivityFilters {
  q: string;
  typeId: string;
  region: string;
  mode: "all" | "online" | "offline" | "hybrid";
  team: TeamFilter;
  status: StatusFilter;
  page: number;
}

export function parseFilters(searchParams: Record<string, string | string[] | undefined>): ActivityFilters {
  const get = (key: string) => {
    const v = searchParams[key];
    return Array.isArray(v) ? v[0] ?? "" : v ?? "";
  };
  const pageRaw = Number(get("page"));
  return {
    q: get("q").trim(),
    typeId: get("type"),
    region: get("region").trim(),
    mode: (["online", "offline", "hybrid"].includes(get("mode")) ? get("mode") : "all") as ActivityFilters["mode"],
    team: (["solo_ok", "team_ok"].includes(get("team")) ? get("team") : "all") as TeamFilter,
    status: (["open", "closing_soon", "upcoming", "closed"].includes(get("status")) ? get("status") : "all") as StatusFilter,
    page: Number.isFinite(pageRaw) && pageRaw > 0 ? Math.floor(pageRaw) : 1,
  };
}

export function filtersToSearchParams(filters: ActivityFilters, overrides: Partial<ActivityFilters> = {}): string {
  const merged = { ...filters, ...overrides };
  const params = new URLSearchParams();
  if (merged.q) params.set("q", merged.q);
  if (merged.typeId) params.set("type", merged.typeId);
  if (merged.region) params.set("region", merged.region);
  if (merged.mode !== "all") params.set("mode", merged.mode);
  if (merged.team !== "all") params.set("team", merged.team);
  if (merged.status !== "all") params.set("status", merged.status);
  if (merged.page > 1) params.set("page", String(merged.page));
  return params.toString();
}

export async function queryActivities(supabase: SupabaseClient, filters: ActivityFilters) {
  const nowIso = new Date().toISOString();
  const closingSoonThresholdIso = new Date(Date.now() + CLOSING_SOON_HOURS * 60 * 60 * 1000).toISOString();

  let query = supabase
    .from("activities")
    .select("*, activity_types(id, name)", { count: "exact" })
    .eq("status", "published");

  if (filters.q) {
    query = query.or(`title.ilike.%${filters.q}%,org_name.ilike.%${filters.q}%`);
  }
  if (filters.typeId) {
    query = query.eq("activity_type_id", filters.typeId);
  }
  if (filters.region) {
    query = query.ilike("region", `%${filters.region}%`);
  }
  if (filters.mode !== "all") {
    query = query.eq("location_type", filters.mode);
  }
  if (filters.team === "solo_ok") {
    query = query.in("participation_mode", ["solo", "both"]);
  } else if (filters.team === "team_ok") {
    query = query.in("participation_mode", ["team", "both"]);
  }

  switch (filters.status) {
    case "upcoming":
      query = query.gt("apply_start_at", nowIso);
      break;
    case "closed":
      // published 활동만 보고 있으므로 "마감"은 마감일이 지난 경우로 판단한다.
      query = query.lt("apply_end_at", nowIso);
      break;
    case "closing_soon":
      query = query
        .or(`apply_start_at.is.null,apply_start_at.lte.${nowIso}`)
        .not("apply_end_at", "is", null)
        .gte("apply_end_at", nowIso)
        .lte("apply_end_at", closingSoonThresholdIso);
      break;
    case "open":
      query = query
        .or(`apply_start_at.is.null,apply_start_at.lte.${nowIso}`)
        .or(`apply_end_at.is.null,apply_end_at.gt.${closingSoonThresholdIso}`);
      break;
    default:
      break;
  }

  const from = (filters.page - 1) * PAGE_SIZE;
  const to = from + PAGE_SIZE - 1;

  const { data, count, error } = await query
    .order("apply_end_at", { ascending: true, nullsFirst: false })
    .range(from, to)
    .returns<ActivityWithType[]>();

  return { data: data ?? [], count: count ?? 0, error };
}
