type BadgeVariant = "neutral" | "info" | "warning" | "danger" | "success";

const VARIANT_CLASS: Record<BadgeVariant, string> = {
  neutral: "bg-[var(--color-surface-muted)] text-[var(--color-muted-foreground)]",
  info: "bg-[var(--color-brand-100)] text-[var(--color-brand-700)]",
  warning: "bg-amber-100 text-amber-800",
  danger: "bg-[var(--color-danger-bg)] text-[var(--color-danger)]",
  success: "bg-[var(--color-success-bg)] text-[var(--color-success)]",
};

export function Badge({ children, variant = "neutral" }: { children: React.ReactNode; variant?: BadgeVariant }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${VARIANT_CLASS[variant]}`}>
      {children}
    </span>
  );
}
