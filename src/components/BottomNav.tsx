"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/", label: "홈", icon: "🏠" },
  { href: "/activities", label: "활동", icon: "📋" },
  { href: "/parties", label: "파티", icon: "🧑‍🤝‍🧑" },
  { href: "/chat", label: "채팅", icon: "💬" },
  { href: "/me", label: "마이", icon: "👤" },
] as const;

function badgeLabel(count: number) {
  return count > 99 ? "99+" : String(count);
}

export function BottomNav({
  chatUnread = 0,
  notificationUnread = 0,
}: {
  chatUnread?: number;
  notificationUnread?: number;
}) {
  const pathname = usePathname();

  return (
    <nav
      aria-label="주요 메뉴"
      className="fixed inset-x-0 bottom-0 z-20 border-t border-[var(--color-border)] bg-[var(--color-surface)]"
    >
      <div className="mx-auto flex w-full max-w-xl">
        {TABS.map((tab) => {
          const isActive = tab.href === "/" ? pathname === "/" : pathname.startsWith(tab.href);
          const badgeCount = tab.href === "/chat" ? chatUnread : tab.href === "/me" ? notificationUnread : 0;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              aria-current={isActive ? "page" : undefined}
              className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-xs transition-colors ${
                isActive ? "text-[var(--color-brand-700)] font-medium" : "text-[var(--color-muted-foreground)]"
              }`}
            >
              <span className="relative text-lg leading-none" aria-hidden="true">
                {tab.icon}
                {badgeCount > 0 && (
                  <span className="absolute -right-2 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--color-danger)] px-1 text-[10px] font-semibold text-white">
                    {badgeLabel(badgeCount)}
                  </span>
                )}
              </span>
              {tab.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
