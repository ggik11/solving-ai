"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Badge } from "@/components/Badge";
import { formatKst } from "@/lib/format";
import { markAllNotificationsReadAction, markNotificationReadAction } from "./actions";

export interface NotificationItem {
  id: string;
  title: string;
  body: string | null;
  read_at: string | null;
  created_at: string;
  href: string | null;
}

export function NotificationList({ notifications }: { notifications: NotificationItem[] }) {
  const router = useRouter();
  const [items, setItems] = useState(notifications);
  const [isPending, startTransition] = useTransition();
  const unreadCount = items.filter((n) => !n.read_at).length;

  function handleMarkAll() {
    startTransition(async () => {
      const result = await markAllNotificationsReadAction();
      if (result.ok) {
        const now = new Date().toISOString();
        setItems((prev) => prev.map((n) => ({ ...n, read_at: n.read_at ?? now })));
        router.refresh();
      }
    });
  }

  function handleOpen(notification: NotificationItem) {
    if (notification.read_at) return;
    startTransition(async () => {
      const result = await markNotificationReadAction(notification.id);
      if (result.ok) {
        const now = new Date().toISOString();
        setItems((prev) => prev.map((n) => (n.id === notification.id ? { ...n, read_at: now } : n)));
        router.refresh();
      }
    });
  }

  return (
    <div className="flex flex-col gap-3">
      {unreadCount > 0 && (
        <button
          type="button"
          disabled={isPending}
          onClick={handleMarkAll}
          className="self-end rounded-md border border-[var(--color-border)] px-3 py-1.5 text-xs font-medium disabled:opacity-60"
        >
          모두 읽음으로 표시
        </button>
      )}

      <ul className="flex flex-col gap-2">
        {items.map((n) => {
          const card = (
            <div
              className={`flex flex-col gap-0.5 rounded-lg border px-4 py-3 text-sm ${
                n.read_at
                  ? "border-[var(--color-border)] bg-[var(--color-surface)]"
                  : "border-[var(--color-brand-300)] bg-[var(--color-brand-50)]"
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="font-medium">{n.title}</p>
                {!n.read_at && <Badge variant="info">안 읽음</Badge>}
              </div>
              {n.body && <p className="text-[var(--color-muted-foreground)]">{n.body}</p>}
              <p className="text-xs text-[var(--color-muted-foreground)]">{formatKst(n.created_at)}</p>
            </div>
          );

          return (
            <li key={n.id} onClick={() => handleOpen(n)}>
              {n.href ? (
                <Link href={n.href} className="block">
                  {card}
                </Link>
              ) : (
                card
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
