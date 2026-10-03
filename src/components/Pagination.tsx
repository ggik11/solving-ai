export function Pagination({
  page,
  totalPages,
  buildHref,
}: {
  page: number;
  totalPages: number;
  buildHref: (page: number) => string;
}) {
  if (totalPages <= 1) return null;

  return (
    <nav aria-label="페이지 이동" className="mt-4 flex items-center justify-center gap-2">
      <a
        href={buildHref(Math.max(1, page - 1))}
        aria-disabled={page <= 1}
        className={`rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm ${
          page <= 1 ? "pointer-events-none opacity-40" : ""
        }`}
      >
        이전
      </a>
      <span className="text-sm text-[var(--color-muted-foreground)]">
        {page} / {totalPages}
      </span>
      <a
        href={buildHref(Math.min(totalPages, page + 1))}
        aria-disabled={page >= totalPages}
        className={`rounded-md border border-[var(--color-border)] px-3 py-1.5 text-sm ${
          page >= totalPages ? "pointer-events-none opacity-40" : ""
        }`}
      >
        다음
      </a>
    </nav>
  );
}
