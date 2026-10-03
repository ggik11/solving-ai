"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Badge } from "@/components/Badge";
import { dismissRecommendation } from "@/app/activities/recommendation-actions";

export function RecommendationCard({
  activityId,
  title,
  score,
  isDiscovery,
  reasons,
}: {
  activityId: string;
  title: string;
  score: number | null;
  isDiscovery: boolean;
  reasons: string[];
}) {
  const [isPending, startTransition] = useTransition();
  const [dismissed, setDismissed] = useState(false);

  function handleDismiss(feedback: "hidden" | "not_interested") {
    startTransition(async () => {
      const result = await dismissRecommendation(activityId, feedback);
      if (result.ok) setDismissed(true);
    });
  }

  if (dismissed) return null;

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-[var(--color-border)] bg-[var(--color-surface)] p-3">
      <div className="flex items-start justify-between gap-2">
        <Link href={`/activities/${activityId}`} className="font-medium">
          {title}
        </Link>
        {!isDiscovery && score !== null && <Badge variant="info">{Math.round(score)}점</Badge>}
        {isDiscovery && <Badge variant="neutral">새로운 분야</Badge>}
      </div>

      {reasons.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {reasons.map((reason) => (
            <li key={reason} className="rounded-full bg-[var(--color-surface-muted)] px-2 py-0.5 text-xs text-[var(--color-muted-foreground)]">
              {reason}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-xs text-[var(--color-muted-foreground)]">
          아직 추천 근거가 충분하지 않아 새로운 분야로 소개해 드려요.
        </p>
      )}

      <div className="flex gap-3 text-xs text-[var(--color-muted-foreground)]">
        <button type="button" disabled={isPending} onClick={() => handleDismiss("not_interested")} className="underline">
          관심 없음
        </button>
        <button type="button" disabled={isPending} onClick={() => handleDismiss("hidden")} className="underline">
          숨기기
        </button>
      </div>
    </div>
  );
}
