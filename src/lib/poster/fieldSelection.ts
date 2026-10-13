/**
 * 분야 선택 상태를 모델 후보 칩 클릭에 맞춰 갱신하는 순수 함수(가이드 5.4 4번). 등록 화면
 * (ActivityForm 생성 모드), 제보 화면(SubmitActivityForm), 수정 화면(ActivityFieldsManager)이
 * 모두 같은 규칙을 쓴다 — 대표가 비어 있으면 대표로, 아니면 이미 선택돼 있지 않을 때만 부가로.
 */

export interface FieldSelectionState {
  primary: string | null;
  secondary: string[];
}

export function applyCandidateSelection(state: FieldSelectionState, interestId: string): FieldSelectionState {
  if (!state.primary) {
    return { ...state, primary: interestId };
  }
  if (state.primary !== interestId && !state.secondary.includes(interestId)) {
    return { ...state, secondary: [...state.secondary, interestId] };
  }
  return state;
}

/** 저장 직전 정리 — 대표와 같은 분야는 부가 목록에서 빼고, 중복을 없앤다. */
export function resolveSecondarySelection(primary: string | null, secondary: string[]): string[] {
  return [...new Set(secondary.filter((id) => id !== primary))];
}
