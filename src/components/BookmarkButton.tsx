"use client";

import { useState, useTransition } from "react";
import { toggleBookmark } from "@/app/activities/bookmark-actions";

export function BookmarkButton({
  activityId,
  initialBookmarked,
}: {
  activityId: string;
  initialBookmarked: boolean;
}) {
  const [bookmarked, setBookmarked] = useState(initialBookmarked);
  const [isPending, startTransition] = useTransition();

  function handleClick() {
    const next = !bookmarked;
    setBookmarked(next); // 낙관적 업데이트
    startTransition(async () => {
      const result = await toggleBookmark(activityId);
      if (!result.ok) {
        setBookmarked(!next); // 실패 시 되돌림
      } else {
        setBookmarked(result.bookmarked);
      }
    });
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isPending}
      aria-pressed={bookmarked}
      className={`shrink-0 rounded-md border px-3 py-1.5 text-sm font-medium ${
        bookmarked
          ? "border-[var(--color-brand-300)] bg-[var(--color-brand-50)] text-[var(--color-brand-700)]"
          : "border-[var(--color-border)] text-[var(--color-muted-foreground)]"
      }`}
    >
      {bookmarked ? "★ 북마크됨" : "☆ 북마크"}
    </button>
  );
}
