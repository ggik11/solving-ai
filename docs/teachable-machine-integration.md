# 티처블 머신 연동 개발 가이드라인 (상명메이트)

작성일: 2026-10-13
적용 대상: 현재 저장소(`ee3ae0d` 기준). Next.js 16 + Supabase, 추천 로직 `src/lib/recommend.ts`, 활동 등록 `src/app/admin/activities/ActivityForm.tsx`, 사용자 제보 `src/app/activities/submit/SubmitActivityForm.tsx`.
설계 근거: `docs/tm-design-guidelines-original.md`(2026-10-13 작성 설계 가이드라인). 이 문서는 그 설계를 **현재 코드에 가장 적은 변경으로 붙이는 구현 기준**이다. 두 문서가 다르면 이 문서를 따르고, 차이는 11장에 기록한다.

---

## 0. 핵심 원칙

1. **티처블 머신은 포스터에서 "분야 후보"만 제안한다.** 확정은 관리자가 한다. 마감일, 지원 자격, 진행 방식, 팀 조건은 이미지로 판단하지 않는다(기존 URL 가져오기·원문 검증 체계를 그대로 쓴다).
2. **12개 서비스 분야를 공통 어휘로 쓴다.** 사용자 관심분야, 활동 분야 태그, 전공 연결표, 모델 후보 연결표가 모두 같은 분야 ID를 가리킨다. 그래야 모델 결과 → 관리자 확정 → 추천 계산이 추가 변환 없이 이어진다.
3. **모델이 없어도 서비스는 완전히 동작한다.** 모델 미설치, 로딩 실패, 불확실한 결과는 모두 "관리자 수동 선택"으로 자연스럽게 넘어간다. 가짜 모델이나 임의의 예측값은 만들지 않는다.
4. **학습과 서비스는 같은 전처리 코드를 쓴다.** 학습용 이미지 변환도 서비스와 같은 브라우저 코드로 한다.
5. **포스터 이미지는 서버로 보내거나 저장하지 않는다.** 분석은 브라우저에서 하고, 결과(점수·해시·버전)만 저장한다.
6. **기존 규칙을 지킨다.** 기존 마이그레이션은 수정하지 않고 새 마이그레이션으로 추가한다. 새 테이블은 RLS, 새 함수는 EXECUTE 허용 목록 가드 테스트(`tests/rls/execute_privileges.test.ts`)를 통과해야 한다.

---

## 1. 결합 구조

```
[관리자/제보자] 포스터 선택 (파일)
      │  브라우저 안에서만 처리
      ▼
전처리 v1 (정사각형 여백 채우기 → 224px)
      ▼
티처블 머신 모델 (예비 4클래스) → 전체 클래스 점수
      ▼
판정: suggested / needs_review / failed  ──►  poster_analyses 저장(점수·해시·버전)
      ▼
모델 클래스 → 서비스 분야 "후보" (model_class_field_map, 모델 버전별)
      ▼
관리자가 원문 확인 후 대표 분야 1개 + 부가 분야 확정  ──►  activity_fields (source 기록)
      ▼
추천 계산(recommend.ts): 사용자 관심분야·전공 연결표·추천 모드와 비교
      ▼
추천 카드 + 실제 근거("선택한 IT·AI·데이터 관심분야와 일치", "전기공학전공과 연결된 공학 분야")
```

티처블 머신의 효과는 두 가지로 설명한다. ① 분야 입력 시간 절감(후보 제안), ② 분야 태그가 채워진 활동이 늘어 추천 근거가 풍부해짐. 추천 정확도 자체는 관리자가 확정한 분야로 계산된다.

---

## 2. 현재 코드 기준 변경 지점

| 현재 | 변경 | 이유 |
|---|---|---|
| `interests`(이름만, 데모 6개) | 서비스 분야 12개로 교체, `code`·`sort_order`·`is_active` 추가 | 새 테이블을 만드는 대신 기존 FK(`profile_interests`)를 그대로 재사용 |
| `activity_tags`(자유 문자열)로 관심분야 매칭 | 새 `activity_fields`(분야 ID, 대표/부가, 출처, 확정 정보)로 매칭. `activity_tags`는 자유 키워드로만 남김 | 문자열 비교 → ID 비교로 오타·표기 차이 제거 |
| `majors`(데모 5개, `is_demo`) | 서울캠퍼스 공식 목록으로 교체, `code`·`is_active`·`source_url`·`verified_at` 추가 | 가이드라인 8.1 |
| 전공 관련성 = 전공 키워드가 활동 제목·태그에 포함되는지 | `major_field_weights`(전공→분야 1.0/0.5) 기반 계산 | 키워드 매칭은 근거가 약하고 오탐이 많음 |
| `profile_majors`(구분 없음) | `kind`(primary/double/minor), `use_for_recommendation`, `weight` 추가 | 복수전공·부전공 반영 |
| 추천 가중치 `recommendation_weights`(100점 척도 5항목) | `recommendation_modes`(모드별, 합계 1) | 가이드라인 8.5 |
| `duration_time_fit` 항상 미상 | `activities.weekly_hours` 추가로 계산 가능 | 그동안 비어 있던 항목 해소 |
| 지원 자격 = `eligibility` 텍스트 | `eligibility_scope`, `eligible_major_ids`, `eligibility_verified_at` 추가 | 추천용 전공 관련성과 지원 자격 분리 |
| (없음) | `poster_analyses`, `model_class_field_map`, `app_settings.poster_classifier` | 모델 결과 저장과 후보 연결 |
| `UrlImportPanel` | 옆에 `PosterClassifierPanel` 추가(같은 두 화면) | 등록 흐름 한 곳에서 처리 |

---

## 3. 데이터 모델

### 3.1 서비스 분야 (`interests` 재사용)

| code | 표시명 |
|---|---|
| IT_DATA | IT·AI·데이터 |
| ENGINEERING | 전기·전자·제조·공학 |
| BUSINESS_FINANCE | 경영·마케팅·금융 |
| HUMANITIES_CULTURE | 인문·역사·문화콘텐츠 |
| LAW_POLICY | 법·지식재산·정책·안보 |
| EDUCATION | 교육·멘토링 |
| SOCIAL_WELFARE | 복지·지역사회·사회공헌 |
| BIO_FOOD_HEALTH | 바이오·식품·영양·보건 |
| ENERGY_ENVIRONMENT | 에너지·소재·환경·도시 |
| DESIGN_MEDIA | 디자인·영상·애니메이션·게임콘텐츠 |
| ARTS_PERFORMANCE | 미술·음악·공연·무용 |
| SPORTS | 스포츠·운동·건강관리 |

- `interests`에 `code text unique not null`, `sort_order`, `is_active`를 추가한다. 표시명은 `name`.
- 기존 데모 관심분야의 이전: 환경→ENERGY_ENVIRONMENT, IT/테크→IT_DATA, 교육→EDUCATION, 마케팅→BUSINESS_FINANCE, 디자인→DESIGN_MEDIA, 사회공헌→SOCIAL_WELFARE. 이 6개는 대응이 명확하므로 자동 이전한다. 앞으로 대응이 애매한 항목이 생기면 자동으로 정하지 않고 프로필 화면에서 다시 고르게 한다.
- `profile_interests`에 `priority smallint`(1=가장 관심, null=균등)를 추가한다.
- 시드의 활동 데이터도 새 분야로 다시 작성한다.

### 3.2 활동 분야 (`activity_fields`, 신규)

| 컬럼 | 설명 |
|---|---|
| activity_id | FK, on delete cascade |
| interest_id | FK → interests (서비스 분야) |
| role | `primary` / `secondary`. 활동당 primary는 최대 1개(부분 UNIQUE) |
| source | `manual` / `teachable_machine` / `import`. 최종 확정값을 누가 처음 제안했는지 |
| analysis_id | 모델 후보를 수락한 경우 `poster_analyses.id`, 아니면 null |
| confirmed_by, confirmed_at | 확정한 관리자와 시각 |

- **추천에는 `activity_fields`만 쓴다.** 확정되지 않은 모델 후보는 추천에 쓰지 않는다.
- 분야가 하나도 없는 활동도 목록·검색에는 그대로 나오고 "분야 미확정"으로 표시한다(숨기지 않음).
- 쓰기는 관리자 전용 함수로만 한다. 사용자 제보는 제보 단계에서 후보만 남기고, 관리자 승인 때 확정한다.

### 3.3 전공

- `majors`에 `code text unique`(서비스 내부 고정 ID, 학교 학사 코드라고 주장하지 않음), `campus text default 'SMU_SEOUL'`, `is_active`, `sort_order`, `source_url`, `verified_at`를 추가한다.
- 원 설계 가이드라인 8.1의 서울캠퍼스 목록을 등록한다. **등록 전에 공식 페이지(https://www.smu.ac.kr/kor/edu/seoul01.do)를 다시 확인**하고, 목록과 다르면 임의로 고치지 말고 보고한다. 기존 데모 전공은 `is_active=false`로 둔다.
- `major_field_weights`(major_id, interest_id, weight ∈ {1.0, 0.5}, mapping_version, reason)를 만들고 원 가이드라인 8.3 연결표를 `mapping_version='v1'`로 넣는다. **모든 활성 전공이 1.0 연결을 최소 1개 갖는지** 테스트한다.
- `profile_majors`에 `kind`(primary/double/minor), `use_for_recommendation boolean default true`, `weight numeric`(null=균등)를 추가한다. primary는 사용자당 최대 1개.
- `profiles`에 `major_status`(assigned / exploring / unlisted / not_provided, 기본 not_provided)와 `recommendation_mode`(balanced / major_focus / interest_expand, 기본 balanced)를 추가한다.
- 기존 사용자의 전공을 추측해서 채우지 않는다.

### 3.4 활동 필드 추가

| 컬럼 | 설명 |
|---|---|
| weekly_hours | 주당 예상 투입 시간(원문에 있을 때만), 불명확하면 null |
| eligibility_scope | `any`(전공 무관) / `restricted`(지정 전공) / `unknown`(확인 필요, 기본) |
| eligible_major_ids | `restricted`일 때 원문에 명시된 전공 |
| eligibility_verified_at | 지원 자격을 원문으로 확인한 시각 |

활동 기간은 기존 `activity_start_at`/`activity_end_at`을 쓴다. 기존 `eligibility` 텍스트는 원문 조건 문장으로 유지한다.

### 3.5 포스터 분석 (`poster_analyses`, 신규)

| 컬럼 | 설명 |
|---|---|
| id, activity_id | 활동 등록 전 분석이면 activity_id null, 등록 시 연결 |
| submission_id | 사용자 제보에서 분석한 경우 |
| poster_hash | 브라우저에서 계산한 SHA-256 |
| model_version | `metadata.json`에서 읽은 값(예: timeStamp 기반) |
| preprocessing_version | 예: `pad-square-v1` |
| scores | jsonb, **전체 클래스 ID와 점수** |
| top_class, top_score, margin | 1위 클래스, 1위 점수, 1위−2위 차이 |
| status | `suggested` / `needs_review` / `failed` |
| failure_reason | `model_missing` / `model_load_error` / `image_decode_error` 등 |
| analyzed_by, created_at | |

- 같은 `poster_hash + model_version + preprocessing_version`이 있으면 다시 분석하지 않고 기존 결과를 쓴다(UNIQUE 또는 조회로 처리).
- 실패를 점수 0이나 특정 분야로 저장하지 않는다.
- 재분석이나 모델 교체가 `activity_fields`의 확정값을 바꾸지 않는다.
- RLS: 관리자는 전체 조회, 제보자는 자신의 제보에 연결된 행만 조회. 쓰기는 함수로만.

### 3.6 모델 클래스 → 서비스 분야 후보 (`model_class_field_map`, 신규)

| model_version | class_id | interest_id(후보) |
|---|---|---|
| (예비 모델) | IT_DATA | IT_DATA |
| | BUSINESS_PLANNING | BUSINESS_FINANCE |
| | DESIGN_MEDIA | DESIGN_MEDIA |
| | SOCIAL_ENVIRONMENT | SOCIAL_WELFARE, ENERGY_ENVIRONMENT |

- 한 클래스가 여러 후보로 연결될 수 있다(SOCIAL_ENVIRONMENT). 이 경우 관리자가 원문을 보고 고른다.
- 모델을 교체하면 새 `model_version` 행을 추가한다. 매핑이 없는 모델 버전이 로드되면 "연결표 없음" 경고를 띄우고 후보 제안을 하지 않는다.

**보완(G3 이후): 클래스 구성과 모델 버전 연결의 분리.** 위 표는 "어떤 class_id가 유효하고
어떤 분야 후보로 이어지는가"(클래스 구성)와 "실제 배포된 모델이 그 구성과 맞는가"(모델 버전
연결)를 한 테이블에 섞어 두고 있었다. 모델이 배포되기 전까지 `model_class_field_map`이 비어
있으면 manifest 라벨 검사(6.2)가 기준 없이 건너뛰는 문제가 있어, 둘을 분리했다:
- `classifier_class_sets`/`classifier_class_set_classes`(신규, 마이그레이션 `20261013060000`)가
  클래스 구성을 정의한다. 예비 구성 `pilot-4-v1`(위 표 그대로)을 마이그레이션으로 등록해 모델이
  없어도 manifest 검사·클래스 ID 유효성 확인이 항상 가능하다. `classifier_class_sets.is_active`로
  한 번에 하나의 구성만 활성화한다.
- `model_class_field_map`은 그대로 "모델 버전별 실제 연결표" 역할을 유지한다. 관리자가
  `/admin/model-lab`에서 모델을 **등록**(`register_classifier_model()`)하면, labels가 선택한
  클래스 구성과 정확히 일치하는지 검증한 뒤 그 구성의 행을 복사해 채운다 — 손으로 입력하지
  않는다.
- manifest 라벨 검사(6.2)는 이제 `model_class_field_map`이 아니라 **활성 클래스 구성**의
  class_id 집합을 기준으로 한다 — 모델 등록 여부와 무관하게 항상 검사할 수 있다.

### 3.7 설정 (`app_settings`)

```json
"poster_classifier": {
  "enabled": true,
  "suggest_min_top_score": 0.80,
  "suggest_min_margin": 0.20,
  "model_path": "/models/poster-classifier/"
}
"recommendation_modes": {
  "version": "v1",
  "balanced":        { "interest": 0.30, "major": 0.25, "activity_type": 0.15, "participation": 0.10, "time": 0.10, "goal": 0.10 },
  "major_focus":     { "interest": 0.15, "major": 0.40, "activity_type": 0.15, "participation": 0.10, "time": 0.10, "goal": 0.10 },
  "interest_expand": { "interest": 0.45, "major": 0.10, "activity_type": 0.15, "participation": 0.10, "time": 0.10, "goal": 0.10 },
  "no_major":        { "interest": 0.55, "major": 0.00, "activity_type": 0.15, "participation": 0.10, "time": 0.10, "goal": 0.10 }
}
```

각 모드의 합이 1인지 테스트한다. 기존 `recommendation_weights`는 남겨 두되 더 이상 읽지 않는다고 주석으로 표시한다.

---

## 4. 추천 로직 변경 (`src/lib/recommend.ts`)

기존 구조(순수 함수, 미상 항목 제외 후 정규화, 탐색 카드, 근거 2~3개)는 유지하고 항목만 바꾼다.

| 항목 | 계산 | 미상 조건 |
|---|---|---|
| interest | 사용자 관심분야 우선순위를 합 1로 정규화한 뒤, 활동 확정 분야(대표+부가)와 겹치는 가중치 합 | 사용자 관심분야 없음 또는 활동 분야 미확정 |
| major | 전공별로 활동 확정 분야 중 연결표 최대값 r(m,a). 추천 반영 전공이 여러 개면 Σ q(m)·r(m,a), q는 정규화한 weight(기본 균등) | 아래 참조 |
| activity_type | 희망 활동 유형과 일치 1/0 | 희망 유형 없음 또는 활동 유형 없음 |
| participation | 기존 `region_mode`(온라인/오프라인/혼합, 지역) 계산 재사용 | 기존과 같음 |
| time | `weekly_hours`가 사용자 `weekly_available_hours` 이하면 1, 초과 비율에 따라 감소 | 둘 중 하나라도 null |
| goal | 이번 범위에서 구현하지 않음 → 항상 미상 | 항상 |

**모드 선택:** 사용자의 `recommendation_mode`를 쓴다. 추천 반영 전공이 하나도 없거나 `major_status`가 exploring/unlisted/not_provided면 `no_major`를 쓴다.

**전공 항목의 특별 규칙(원 가이드라인 8.5):** 전공은 있는데 활동 분야가 미확정이면 major를 0.5(중립)로 계산하고, 카드에 "분야 정보 부족"을 표시한다. 이때 전공 관련 근거 문장은 만들지 않는다.

**그 밖의 미상 항목:** 기존 규칙대로 계산에서 빼고 유효 가중치 합으로 정규화한다. 그래서 goal을 구현하지 않아도 점수가 왜곡되지 않는다.

**지원 자격(필수 조건):** 마감·비공개 제외는 기존과 같다. 추가로 `eligibility_scope='restricted'`이고 사용자의 추천 반영 전공이 `eligible_major_ids`에 없으면 추천에서 제외한다. 단 복수전공·부전공 인정 여부는 원문을 따른다는 안내를 표시한다. `unknown`은 제외하지 않고 "지원 자격 확인 필요"로 표시한다. **전공 연결표로 지원 가능 여부를 판단하지 않는다.**

**근거 문장:** 실제 반영된 항목만 쓴다. 예: "선택한 IT·AI·데이터 관심분야와 일치", "컴퓨터과학전공과 연결된 IT·AI·데이터 분야", "온라인 참여 가능". 모델 점수를 근거나 적합도로 표시하지 않는다.

**필수 테스트:** 원 가이드라인의 전기공학전공 94점 예시 재현(goal을 1.0으로 넣은 케이스와 미상 케이스 둘 다), 전공 미배정, 복수전공 가중 평균, 분야 미확정 활동, 지정 전공 제한, 모드별 가중치 합 1.

---

## 5. 티처블 머신 연동

### 5.1 모델 파일

```
public/models/poster-classifier/
  model.json
  metadata.json   ← labels(클래스 이름), 버전 정보
  weights.bin
```

- 티처블 머신에서 **Export → TensorFlow.js → Download**로 받은 세 파일을 그대로 넣는다. `model.json`이 참조하는 가중치 파일 이름을 바꾸지 않는다.
- 클래스 이름은 **고정 ID**(IT_DATA, BUSINESS_PLANNING, DESIGN_MEDIA, SOCIAL_ENVIRONMENT)로 학습한다. 로더는 `metadata.json`의 labels가 `model_class_field_map`의 class_id와 일치하는지 검사하고, 다르면 후보 제안을 끈다.
- `model_version`은 `metadata.json`에서 읽는다(필드 이름은 실제 파일을 보고 확정하고 문서에 기록).
- 모델 파일은 커밋해도 된다. 학습 이미지는 커밋하지 않는다.

### 5.2 라이브러리

- 1순위: 공식 `@teachablemachine/image`와 그 라이브러리가 요구하는 `@tensorflow/tfjs` 버전을 확인해 **정확한 버전으로 고정**한다. 해당 화면에서만 동적 import 해서 다른 페이지 번들에 들어가지 않게 한다.
- 공식 라이브러리가 Next.js 16 / React 19 환경에서 빌드되지 않으면: 최신 `@tensorflow/tfjs`의 `loadLayersModel`로 직접 불러오고, 공식 라이브러리 소스(`custom-mobilenet.ts`)의 입력 크기와 정규화를 그대로 재현한다. 이 경우 실제 모델이 생긴 뒤 **같은 이미지 몇 장으로 티처블 머신 웹 미리보기 결과와 점수를 비교**해 일치를 확인하고 결과를 기록한다.
- 어느 쪽을 택했는지와 이유를 `docs/architecture.md`에 적는다.

### 5.3 전처리 v1 (`src/lib/poster/preprocess.ts`)

1. 이미지 파일을 브라우저에서 디코드한다(EXIF 회전 반영).
2. 종횡비를 유지한 채 정사각형 캔버스 안에 **전체 포스터**가 들어가도록 축소·배치한다(가운데 정렬).
3. 남는 공간은 **흰색(#FFFFFF)** 으로 채운다.
4. 224×224로 맞춘다.
5. 결과 캔버스를 모델에 넣는다. 정사각형이므로 라이브러리 내부의 중앙 자르기가 내용을 잘라내지 않는다.

- 버전 문자열 `pad-square-v1`. 규칙을 바꾸면 버전을 올리고 모델을 다시 학습한다.
- **이 함수 하나를 서비스 분석과 학습 이미지 변환(6장) 모두에 쓴다.**
- 화면 캡처의 브라우저 메뉴·테두리 제거는 사람이 수집 단계에서 한다(자동 자르기 없음).

### 5.4 화면: `PosterClassifierPanel`

위치: `ActivityForm.tsx`(관리자 등록·수정)와 `SubmitActivityForm.tsx`(사용자 제보), `UrlImportPanel` 바로 아래.

동작:
1. "포스터로 분야 후보 찾기" → 파일 선택(이미지만, 크기 제한).
2. 브라우저에서 해시 계산 → 같은 해시·모델·전처리 결과가 있으면 재사용.
3. 모델 로딩 → 전처리 → 예측. 로딩·분석 중·완료·실패 상태를 각각 표시.
4. 전체 클래스 점수를 막대로 보여주고, 판정 결과에 따라:
   - `suggested`: "분야 후보" 칩(연결표로 바꾼 서비스 분야)을 보여준다. 누르면 분야 선택 칸에 들어가지만 저장 전까지 확정이 아니다.
   - `needs_review`: "확신이 낮습니다. 원문을 보고 직접 선택해 주세요." 상위 2개 후보는 참고로만 보여준다.
   - `failed`/모델 미설치: "분야를 직접 선택해 주세요." 등록은 그대로 진행된다.
5. 저장 시 분석 결과(`poster_analyses`)와 확정 분야(`activity_fields`)를 함께 기록하고, 모델 후보를 그대로 수락했는지 여부를 남긴다(수락률 통계용).

분야 선택 칸은 이 패널과 별개로 항상 존재한다. 12개 분야 중 대표 1개 + 부가 여러 개를 고를 수 있다. 예비 모델이 다루지 않는 8개 분야도 같은 칸에서 수동으로 등록한다.

### 5.5 판정 규칙

```
p1 = 1위 점수, p2 = 2위 점수
p1 ≥ suggest_min_top_score(0.80) 그리고 p1 − p2 ≥ suggest_min_margin(0.20) → suggested
그 외 → needs_review
모델·이미지 문제 → failed
```

- 0.80은 정확도 80% 보장이 아니다. 실제 기준값은 7장 평가(dev 자료)로 정하고 `app_settings`만 바꾼다.
- `suggested`여도 첫 운영 버전에서는 관리자가 원문을 보고 확정한다.
- softmax 점수이므로 "IT 0.6, 디자인 0.3"을 두 분야에 각각 해당할 확률로 해석하지 않는다.

### 5.6 관리자 검토 화면

- `/admin/activities` 목록에 "분야 미확정"과 "모델 후보 대기" 필터를 추가한다.
- 활동 상세 관리 화면에 원문 링크, 포스터 분석 결과(점수·판정·모델 버전), 확정 분야를 나란히 보여준다.
- 관리자 대시보드에 모델 후보 수락률(분야별), 판정 비율(suggested/needs_review/failed)을 표시한다.

---

## 6. 실험 도구: `/admin/model-lab` (관리자 전용, 브라우저에서 실행)

Windows에서 `tfjs-node`나 `canvas` 같은 네이티브 패키지를 설치하지 않고, 서비스와 **완전히 같은 전처리·추론 코드**로 실험하기 위해 도구를 관리자 화면에 둔다. 이미지는 브라우저 밖으로 나가지 않는다.

### 6.1 학습 이미지 변환

- 이미지 여러 장(또는 폴더) 선택 → 전처리 v1 적용 → PNG로 일괄 저장(폴더 쓰기 API를 지원하면 폴더로, 아니면 zip 다운로드).
- 파일 이름은 원본을 유지하고 `_pad-square-v1` 접미사를 붙인다.
- 변환한 이미지를 티처블 머신에 업로드한다.

### 6.2 데이터 목록 검사

`datasets/manifest.csv` 양식(저장소에는 템플릿만, 실제 이미지 폴더는 `.gitignore`):

```
image_path,event_id,series_id,org_name,source_url,collected_at,label,secondary_labels,split,note
posters/IT_DATA/e001_a.png,e001,s-hackathon-x,OO재단,https://...,2026-10-20,IT_DATA,,train,
```

- `split`: `train` / `dev` / `test` / `ood`(학습 범위 밖 이미지)
- 검사 항목: 같은 `event_id`나 `series_id`가 여러 split에 섞였는지, 분야별 개수 균형, 한 분야가 특정 기관에 70% 이상 몰렸는지, 라벨이 모델 클래스 ID인지.

### 6.3 모델 평가

manifest와 이미지 폴더를 선택하면 split별로 계산하고 JSON·마크다운으로 내려받는다.

- 전체 정확도, 분야별 정밀도·재현율·F1, macro-F1, 혼동행렬
- 다수 클래스 기준선(항상 가장 많은 분야를 고를 때의 정확도)과 비교
- 임계값 통과율과 통과 자료의 정확도(여러 임계값 조합 표)
- `ood` 이미지 중 `suggested`로 판정된 비율과 목록
- 기관이 학습 자료에 없던 포스터만 따로 본 정확도
- 결과는 `docs/model-evaluation.md`에 모델 버전·전처리 버전·측정일과 함께 붙인다.

지표 계산 함수는 순수 함수로 분리해 단위 테스트한다(가짜 예측값은 지표 검증용으로만 사용).

### 6.4 추천 평가

- 테스트 프로필 15개 시드: 단과대학별 학생, 복수전공·부전공, 전공 미배정, 관심분야만 입력, 모드별.
- 스크립트(`npm run eval:recommend`)가 프로필별 상위 5개, 점수 구성, 근거를 CSV로 출력한다. 전공 항목을 끈 버전도 함께 출력한다.
- 사람이 적합 여부(1/0)를 채우면 Precision@5와 지원 자격 위반 건수를 계산한다.
- 비교: ① 분야 미확정 상태 ② 모델 후보를 그대로 확정한 상태 ③ 관리자 정답 분야.

---

## 7. 실험 절차 (사람이 하는 일)

### 7.1 예비 실험 (가능성 확인)

| 항목 | 기준 |
|---|---|
| 클래스 | IT_DATA, BUSINESS_PLANNING, DESIGN_MEDIA, SOCIAL_ENVIRONMENT |
| 자료 | 분야별 서로 다른 행사 약 50개 (행사 단위로 셈) |
| 분할 | 행사 그룹 단위로 train 40 / test 10. 같은 행사·시리즈의 변형본은 한쪽에만 |
| 범위 밖 | 학습 분야가 아닌 포스터·일반 광고 이미지 20~30장 (`ood`) |
| 출처 | 주최기관 공식 공고, 학교 공지, 교내 게시판 직접 촬영. 타 플랫폼 목록 대량 수집 금지 |
| 라벨 | 원문을 읽고 "주로 수행·제출하는 과업" 기준으로 대표 분야 1개. 색·그림만 보고 정하지 않음. 애매하면 보류 |

절차:
1. 수집하면서 manifest에 기록한다.
2. `/admin/model-lab`에서 목록 검사 → 이미지 변환.
3. 티처블 머신 Image Project(Standard)에서 클래스 이름을 고정 ID로 만들고 **train 이미지만** 업로드한다.
4. 기본 설정으로 학습하고 설정값(epochs, batch, learning rate)을 기록한다.
5. 내보내기 → `public/models/poster-classifier/`에 넣는다.
6. `/admin/model-lab`에서 test·ood 평가 → `docs/model-evaluation.md`에 기록.

**판단:** 다수 클래스 기준선보다 확실히 낫고 혼동이 특정 쌍에 몰린다면 본 실험으로 간다. 거의 구분하지 못하면 epoch를 늘리기 전에 라벨 기준 중복, 기관·색 편향, 글자 의존도를 먼저 본다. 그래도 안 되면 클래스를 줄이거나 "후보 제안" 용도로만 쓴다(이 경우에도 서비스 흐름은 그대로 동작한다).

### 7.2 본 실험 (확대)

- 분야별 150~200개 행사, 그룹 단위로 train 70% / dev 15% / test 15%.
- epoch 30·50·80처럼 **한 번에 한 설정만** 바꿔 dev로 비교하고, 임계값도 dev로 정한다.
- 설정을 확정한 뒤 test로 한 번만 최종 평가한다. test를 보고 다시 고쳤다면 그 test는 dev가 된 것이므로 새 test를 확보한다.
- 학습 프로젝트(.tm 파일), 라벨 기준, manifest, 설정값, 평가 결과를 함께 보관한다.

---

## 8. 완료 체크리스트

**모델 없이 지금 완료할 것**
- [ ] 12개 분야가 관심분야·활동 분야·전공 연결표·모델 연결표에서 같은 ID로 쓰인다.
- [ ] 서울캠퍼스 전공 목록과 확인일·출처가 등록되고, 모든 활성 전공에 1.0 연결이 있다.
- [ ] 복수전공·부전공과 추천 반영 여부, 전공 미배정 상태를 프로필에서 바꿀 수 있다.
- [ ] 추천 모드별 가중치 합이 1이고, 전공·관심·모드를 바꾸면 추천이 갱신된다.
- [ ] 전공 관련성과 지원 자격이 분리되어 있다.
- [ ] 모델 미설치 상태에서 등록·확정·추천이 모두 정상 동작한다.
- [ ] 분석 실패와 불확실한 결과가 구분되어 저장된다.
- [ ] 모델 후보와 관리자 확정값이 분리되고, 재분석이 확정값을 바꾸지 않는다.
- [ ] 학습 변환과 서비스 분석이 같은 전처리 함수를 쓴다.
- [ ] 사용자 화면에 모델 점수를 적합도처럼 보여주지 않는다.
- [ ] 예비 모델 밖 8개 분야도 수동 태그로 등록·추천된다.

**모델 학습 후 완료할 것**
- [ ] 실제 모델을 넣고 브라우저 분석이 동작한다(라이브러리 직접 구현이면 점수 일치 확인).
- [ ] 처음 보는 기관의 포스터로 평가한 결과와 범위 밖 이미지 결과가 기록되어 있다.
- [ ] 판정 임계값이 dev 결과로 정해져 있다.
- [ ] 추천 평가(Precision@5, 자격 위반 0건)가 기록되어 있다.

---

## 9. 구현 작업 단위

각 단위가 끝날 때마다 lint, typecheck, 전체 테스트, E2E, build를 실행하고 커밋, `PROGRESS.md` 갱신 후 멈춘다.

| 단위 | 범위 | 완료 기준 |
|---|---|---|
| **G1. 공통 어휘와 전공** | 3.1, 3.3, 3.4(eligibility 제외 필드는 G2에서), 프로필·온보딩 화면(단과대학→전공, 복수전공·부전공, 전공 상태, 관심분야 우선순위, 추천 모드), 시드 재작성 | 8장 체크리스트 1~3번 |
| **G2. 추천 개편과 자격 분리** | 3.2(`activity_fields`, 관리자 수동 확정 UI 포함), 3.4, 3.7의 `recommendation_modes`, 4장 전체, `recommendations/query.ts`를 `activity_fields` 기반으로 교체 | 체크리스트 4·5·11번, 4장 필수 테스트 |
| **G3. 티처블 머신 연동 골격** | 3.5, 3.6, 3.7의 `poster_classifier`, 5장 전체(모델 없이) | 체크리스트 6~10번. 예측은 테스트용 목으로 검증 |
| **G4. 실험 도구** | 6장 전체, `datasets/` 템플릿과 `.gitignore` | 지표 함수 단위 테스트, 목 예측으로 평가 화면 E2E 1건 |

**이번 범위에서 의도적으로 뺀 것(필요해지면 추가):** 전공 이전 명칭 이력(`major_aliases`), 활동 목표(goal) 입력, 활동 유형 분류 모델, OCR, 포스터 이미지 저장과 일괄 재분석, 서버 측 추론.

---

## 10. 발표 설명

> 티처블 머신으로 대외활동 포스터의 시각적 특징을 학습해 활동 분야 후보를 제시하고, 관리자가 원문으로 확정한 분야를 상명대학교 서울캠퍼스 학생의 전공·관심 분야·참여 선호와 결합해 활동을 추천합니다. 마감일과 지원 자격은 이미지가 아니라 원문 검증으로 확정합니다.

말하지 않을 것: 티처블 머신이 포스터 문장을 읽는다, 사용자 성향을 학습했다, 모델 점수가 합격·적합 확률이다.

---

## 11. 원 설계 가이드라인과의 차이

| 원 가이드라인 | 이 문서 | 이유 |
|---|---|---|
| `fields` 테이블 신설 | 기존 `interests`를 서비스 분야로 재사용 | 기존 FK·화면·추천 코드 재사용으로 변경 최소화 |
| 활동 분야 미확정 시 전공 0.5, 그 밖의 규칙은 명시 없음 | 전공 0.5 규칙은 따르고, 다른 미상 항목은 기존 "제외 후 정규화" 유지 | 기존 테스트와 설명 원칙 유지 |
| 활동 목표(goal) 항목 | 이번 범위 제외, 미상 처리 | 프로필 입력 부담과 구현량 대비 효과가 작음 |
| `major_aliases` | 이번 범위 제외 | 아직 실사용 재학생 데이터가 없음 |
| 이미지 저장 경로 마련 | 포스터 저장 안 함, 해시만 저장 | 저작권·저장 부담 회피. 재분석은 관리자가 포스터를 다시 선택 |
| 서버 일괄 처리 선택지 | 브라우저 처리만 | 네이티브 패키지 설치 문제 회피, 전처리 일치 보장 |
| `recommendation_result` 저장 | 저장하지 않고 요청 시 계산 | 현재 규모에서는 캐시 불필요. 평가 스크립트가 결과를 파일로 남김 |
