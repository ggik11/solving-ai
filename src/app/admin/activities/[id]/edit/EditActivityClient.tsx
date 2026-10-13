"use client";

import { useState } from "react";
import { ActivityForm } from "../../ActivityForm";
import { ActivityFieldsManager, type ActivityFieldSummary, type InterestOption, type PendingFieldCandidate } from "./ActivityFieldsManager";
import { MatchTemplatesManager, type MatchTemplateSummary } from "./MatchTemplatesManager";
import type { Activity } from "@/lib/supabase/types";
import type { PosterClassifierConfig } from "@/lib/poster/classifier";

/**
 * ActivityForm(포스터 분석 패널을 품고 있음)과 ActivityFieldsManager(분야 확정 UI)는 레이아웃상
 * 서로 다른 섹션에 있는 별개의 클라이언트 컴포넌트라, 둘 사이에 "분야 후보 클릭" 상태를 전달하려면
 * 공통 부모가 필요하다 — 이 컴포넌트가 그 역할만 한다(가이드 5.4 4번).
 */
export function EditActivityClient({
  activity,
  activityTypes,
  majors,
  interests,
  templates,
  fields,
  posterConfig,
}: {
  activity: Activity;
  activityTypes: { id: string; name: string }[];
  majors: { id: string; name: string; department: string }[];
  interests: InterestOption[];
  templates: MatchTemplateSummary[];
  fields: ActivityFieldSummary[];
  posterConfig: PosterClassifierConfig;
}) {
  const [pendingCandidate, setPendingCandidate] = useState<PendingFieldCandidate | null>(null);

  return (
    <>
      <ActivityForm
        mode="edit"
        activityId={activity.id}
        activityTypes={activityTypes}
        majors={majors}
        initial={activity}
        posterConfig={posterConfig}
        interests={interests}
        onFieldCandidateAccept={(interestId) => setPendingCandidate({ interestId, nonce: Date.now() })}
      />

      <div className="mt-6">
        <ActivityFieldsManager activityId={activity.id} interests={interests} initialFields={fields} pendingCandidate={pendingCandidate} />
      </div>

      <div className="mt-6">
        <MatchTemplatesManager activityId={activity.id} templates={templates} />
      </div>
    </>
  );
}
