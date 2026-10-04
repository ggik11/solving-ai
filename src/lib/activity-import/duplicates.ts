/** 기존 활동과 URL·제목·주최기관으로 중복 후보를 찾는 순수 함수. */
import { dedupeKeyOf } from "./url-normalize";

export type DuplicateMatchReason = "url" | "title" | "org";

export interface DuplicateCandidate {
  id: string;
  title: string;
  orgName: string | null;
  sourceUrl: string | null;
  matchedBy: DuplicateMatchReason[];
}

export interface ExistingActivityForDuplicateCheck {
  id: string;
  title: string;
  orgName: string | null;
  sourceUrl: string | null;
}

function normalizeForCompare(value: string | null | undefined): string {
  return (value ?? "")
    .toLowerCase()
    .replace(/[\s\-_·,./()[\]]+/g, "")
    .trim();
}

export function findDuplicateCandidates(
  input: { dedupeKey: string | null; title: string; orgName: string | null },
  existing: ExistingActivityForDuplicateCheck[]
): DuplicateCandidate[] {
  const normalizedTitle = normalizeForCompare(input.title);
  const normalizedOrg = normalizeForCompare(input.orgName);

  const candidates: DuplicateCandidate[] = [];
  for (const activity of existing) {
    const matchedBy: DuplicateMatchReason[] = [];

    const activityKey = dedupeKeyOf(activity.sourceUrl);
    if (input.dedupeKey && activityKey && activityKey === input.dedupeKey) {
      matchedBy.push("url");
    }

    const titleMatches = normalizedTitle.length > 0 && normalizeForCompare(activity.title) === normalizedTitle;
    if (titleMatches) matchedBy.push("title");

    const orgMatches = normalizedOrg.length > 0 && normalizeForCompare(activity.orgName) === normalizedOrg;
    // 주최기관만 같은 것은 신호가 약해(흔한 기관명) 제목까지 같이 맞을 때만 근거로 쓴다.
    if (orgMatches && titleMatches) matchedBy.push("org");

    if (matchedBy.length > 0) {
      candidates.push({ id: activity.id, title: activity.title, orgName: activity.orgName, sourceUrl: activity.sourceUrl, matchedBy });
    }
  }
  return candidates;
}
