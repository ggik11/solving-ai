// 공통 상태 화면: 빈 상태 / 로딩 / 오류+재시도 / 권한 없음.
// 각 화면은 지시서 9장이 요구하는 네 가지 상태를 일관된 모습으로 제공한다.

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-10 text-center">
      <p className="font-medium text-[var(--foreground)]">{title}</p>
      {description && <p className="text-sm text-[var(--color-muted-foreground)]">{description}</p>}
      {action}
    </div>
  );
}

export function LoadingState({ label = "불러오는 중입니다..." }: { label?: string }) {
  return (
    <div role="status" className="flex flex-col items-center gap-3 py-10 text-center">
      <span
        aria-hidden="true"
        className="h-6 w-6 animate-spin rounded-full border-2 border-[var(--color-brand-200)] border-t-[var(--color-brand-600)]"
      />
      <p className="text-sm text-[var(--color-muted-foreground)]">{label}</p>
    </div>
  );
}

export function ErrorRetry({
  message = "문제가 발생했습니다. 잠시 후 다시 시도해 주세요.",
  onRetry,
  retryHref,
}: {
  message?: string;
  onRetry?: () => void;
  retryHref?: string;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-3 rounded-lg border border-[var(--color-danger)]/30 bg-[var(--color-danger-bg)] px-6 py-8 text-center"
    >
      <p className="text-sm font-medium text-[var(--color-danger)]">{message}</p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-md bg-[var(--color-danger)] px-4 py-2 text-sm font-medium text-white"
        >
          다시 시도
        </button>
      )}
      {retryHref && (
        <a href={retryHref} className="rounded-md bg-[var(--color-danger)] px-4 py-2 text-sm font-medium text-white">
          다시 시도
        </a>
      )}
    </div>
  );
}

export function ForbiddenState({
  message = "이 페이지에 접근할 권한이 없습니다.",
}: {
  message?: string;
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] px-6 py-10 text-center">
      <span aria-hidden="true" className="text-2xl">
        🔒
      </span>
      <p className="font-medium text-[var(--foreground)]">권한 없음</p>
      <p className="text-sm text-[var(--color-muted-foreground)]">{message}</p>
    </div>
  );
}
