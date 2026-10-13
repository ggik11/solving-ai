import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * 클래스 구성(가이드 3.6 보완) — model_class_field_map(모델별 연결표)과 분리된, "어떤 class_id가
 * 유효하고 어떤 서비스 분야 후보로 이어지는지"의 기준. manifest 라벨 검사(6.2)와 모델 등록 화면이
 * 둘 다 이 데이터를 쓴다.
 */
export interface ClassifierClassSet {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  /** 이 구성에 속한 class_id의 중복 제거·정렬된 집합. */
  classIds: string[];
}

interface ClassSetRowDb {
  id: string;
  code: string;
  name: string;
  is_active: boolean;
}

interface ClassSetClassRowDb {
  class_set_id: string;
  class_id: string;
}

export async function loadClassifierClassSets(supabase: SupabaseClient): Promise<ClassifierClassSet[]> {
  const [{ data: sets }, { data: classes }] = await Promise.all([
    supabase.from("classifier_class_sets").select("id, code, name, is_active").returns<ClassSetRowDb[]>(),
    supabase.from("classifier_class_set_classes").select("class_set_id, class_id").returns<ClassSetClassRowDb[]>(),
  ]);

  const classIdsBySet = new Map<string, Set<string>>();
  for (const row of classes ?? []) {
    const set = classIdsBySet.get(row.class_set_id) ?? new Set<string>();
    set.add(row.class_id);
    classIdsBySet.set(row.class_set_id, set);
  }

  return (sets ?? []).map((s) => ({
    id: s.id,
    code: s.code,
    name: s.name,
    isActive: s.is_active,
    classIds: [...(classIdsBySet.get(s.id) ?? [])].sort(),
  }));
}

/** 활성 클래스 구성의 class_id 집합(manifest 라벨 검사 기준, 가이드 6.2 보완). 활성 구성이 없으면 빈 배열. */
export function activeClassIds(classSets: ClassifierClassSet[]): string[] {
  return classSets.find((s) => s.isActive)?.classIds ?? [];
}

/** metadata.json의 labels가 어떤 클래스 구성과 "정확히" 일치하는지(순서 무관, 중복 제거 후 비교). */
export function labelsMatchClassSet(labels: string[], classIds: string[]): boolean {
  const a = [...new Set(labels)].sort();
  const b = [...new Set(classIds)].sort();
  return a.length === b.length && a.every((v, i) => v === b[i]);
}
