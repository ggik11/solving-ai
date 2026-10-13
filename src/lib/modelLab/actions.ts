"use server";

import { createClient } from "@/lib/supabase/server";
import { friendlyError } from "@/lib/errors";

/** 모델 등록(가이드 3.6 보완) — labels가 선택한 클래스 구성과 일치하는지는 DB 함수가 다시 검증한다
 * (버튼 비활성화는 UX일 뿐, 실제 가드는 register_classifier_model 안의 LABELS_MISMATCH 체크다). */
export async function registerClassifierModelAction(args: {
  modelVersion: string;
  classSetId: string;
  labels: string[];
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("register_classifier_model", {
    p_model_version: args.modelVersion,
    p_class_set_id: args.classSetId,
    p_labels: args.labels,
  });
  if (error) return { ok: false, error: friendlyError(error, "모델 등록에 실패했습니다.") };
  return { ok: true };
}
