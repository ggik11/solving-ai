import type { ActivityFilters } from "./queries";

export function ActivityFilterForm({
  filters,
  activityTypes,
}: {
  filters: ActivityFilters;
  activityTypes: { id: string; name: string }[];
}) {
  return (
    <form method="get" action="/activities" className="mb-5 flex flex-col gap-3">
      <div className="flex gap-2">
        <input
          type="search"
          name="q"
          defaultValue={filters.q}
          placeholder="키워드 (제목·주최기관)"
          aria-label="키워드 검색"
          className="flex-1 rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-3 py-2 text-sm"
        />
        <button type="submit" className="rounded-md bg-[var(--color-brand-600)] px-4 py-2 text-sm font-medium text-white">
          검색
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <label className="flex flex-col gap-1 text-xs text-[var(--color-muted-foreground)]">
          유형
          <select
            name="type"
            defaultValue={filters.typeId}
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-sm text-[var(--foreground)]"
          >
            <option value="">전체</option>
            {activityTypes.map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-[var(--color-muted-foreground)]">
          모집 상태
          <select
            name="status"
            defaultValue={filters.status}
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-sm text-[var(--foreground)]"
          >
            <option value="all">전체</option>
            <option value="open">모집중</option>
            <option value="closing_soon">마감임박</option>
            <option value="upcoming">접수예정</option>
            <option value="closed">마감</option>
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-[var(--color-muted-foreground)]">
          진행 방식
          <select
            name="mode"
            defaultValue={filters.mode}
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-sm text-[var(--foreground)]"
          >
            <option value="all">전체</option>
            <option value="online">온라인</option>
            <option value="offline">오프라인</option>
            <option value="hybrid">혼합</option>
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs text-[var(--color-muted-foreground)]">
          팀 참여 여부
          <select
            name="team"
            defaultValue={filters.team}
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-sm text-[var(--foreground)]"
          >
            <option value="all">전체</option>
            <option value="solo_ok">개인 참여 가능</option>
            <option value="team_ok">팀 참여 가능</option>
          </select>
        </label>

        <label className="col-span-2 flex flex-col gap-1 text-xs text-[var(--color-muted-foreground)]">
          지역
          <input
            type="text"
            name="region"
            defaultValue={filters.region}
            placeholder="예: 서울"
            className="rounded-md border border-[var(--color-border)] bg-[var(--color-surface)] px-2 py-1.5 text-sm text-[var(--foreground)]"
          />
        </label>
      </div>
    </form>
  );
}
