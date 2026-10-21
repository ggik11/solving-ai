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

**보완(7.3 데이터 현실화): 파일럿 클래스 구성을 4개에서 6개로(`pilot-6-v1`).** 마이그레이션
`20261020010000_classifier_class_set_pilot6.sql`이 `pilot-4-v1`은 지우지 않고 비활성으로 남긴
채 새 활성 구성 `pilot-6-v1`을 추가한다.

| class_id | interest_id(후보) |
|---|---|
| IT_ENGINEERING | IT_DATA, ENGINEERING |
| BUSINESS_PLANNING | BUSINESS_FINANCE |
| DESIGN_MEDIA | DESIGN_MEDIA |
| SOCIAL_ENVIRONMENT | SOCIAL_WELFARE, ENERGY_ENVIRONMENT |
| LAW_POLICY | LAW_POLICY |
| CAMPUS_NOTICE | (없음 — 서비스 분야 없음) |

- `CAMPUS_NOTICE`는 이어지는 서비스 분야가 없는 클래스다. `classifier_class_set_classes`/
  `model_class_field_map`의 `interest_id`를 `null`로 둬 "아직 매핑을 못 채운 버그"와 구분한다
  (두 테이블 모두 이 마이그레이션에서 `interest_id`를 nullable로 바꿨다). 분석 로직
  (`src/lib/poster/classifier.ts`의 `classHasNoServiceField`, `analyze.ts`)이 이 클래스가 1위여도
  점수와 무관하게 `suggested`로 올리지 않고 `needs_review`로 남긴다 — 화면은 "교내 행정 공지로
  보여요"로 안내한다.
- `/admin/model-lab`의 "6.2 데이터 목록 검사"·"6.1 학습 이미지 변환"·"모델 등록" 섹션 모두
  `pilot-4-v1`/`pilot-6-v1` 중 검사·내보내기·등록에 쓸 클래스 구성을 고를 수 있다(화면마다 기본값은
  활성 구성).

**보완(7.3 데이터 현실화): 파일럿 클래스 구성을 6개에서 7개로(`pilot-7-v1`).** 마이그레이션
`20261020020000_classifier_class_set_pilot7.sql`이 `pilot-4-v1`/`pilot-6-v1`은 지우지 않고
둘 다 비활성으로 남긴 채 새 활성 구성 `pilot-7-v1`을 추가한다. `HOBBY_CULTURE`(취미·문화생활)
클래스가 새로 생겼고, `DESIGN_MEDIA`는 순수 미술·문학 공모를 포함하도록 후보를 넓혔다.

| class_id | interest_id(후보) |
|---|---|
| IT_ENGINEERING | IT_DATA, ENGINEERING |
| BUSINESS_PLANNING | BUSINESS_FINANCE |
| DESIGN_MEDIA | DESIGN_MEDIA, ARTS_PERFORMANCE |
| SOCIAL_ENVIRONMENT | SOCIAL_WELFARE, ENERGY_ENVIRONMENT |
| LAW_POLICY | LAW_POLICY |
| CAMPUS_NOTICE | (없음 — 서비스 분야 없음) |
| HOBBY_CULTURE | SPORTS, ARTS_PERFORMANCE, HUMANITIES_CULTURE |

- `DESIGN_MEDIA`에 `ARTS_PERFORMANCE`(미술·음악·공연·무용)를 후보로 추가했다 — pilot-6-v1까지는
  순수 미술·문학 공모를 `ood`로 뒀지만(7.1/7.3), 실제로는 이런 공모가 꾸준히 들어와 디자인·미디어
  신청과 섞이는 것을 보고 `DESIGN_MEDIA` 클래스 자체의 서비스 분야 후보를 넓혔다(라벨은 여전히
  `DESIGN_MEDIA` 하나로 수집하고, 서비스 분야 후보만 둘로 늘린 것 — 가이드 7.3의 최신 라벨 규칙
  참고).
- `HOBBY_CULTURE`는 운동·취미·문화 동아리, 공연·축제·인문학 행사처럼 특정 실무 분야로 보기 어려운
  활동을 모은 새 클래스다. 서비스 분야 후보 셋(SPORTS/ARTS_PERFORMANCE/HUMANITIES_CULTURE) 중
  관리자가 원문을 보고 고른다.
- `CAMPUS_NOTICE`는 pilot-6-v1과 같은 방식으로 처리한다(서비스 분야 없음, `interest_id` null,
  1위여도 `needs_review`로 남김).
- 이 마이그레이션은 `classifier_class_set_classes`/`model_class_field_map`의
  `(..., class_id, interest_id)` 유니크 제약을 `NULLS NOT DISTINCT`로 바꿨다(PostgreSQL 15+) —
  `interest_id`가 `null`인 행(예: `CAMPUS_NOTICE`)이 같은 class_set/model_version·class_id에
  중복으로 쌓이는 것을 DB가 직접 막는다. 이전에는 표준 NULL 비교 규칙상 `on conflict`가 null
  행의 중복을 잡지 못해 `not exists` 가드로 우회했었다(`20261020010000` 참고) — 이제는 필요 없다.
- `/admin/model-lab`의 클래스 구성 선택 드롭다운에 `pilot-7-v1`이 추가되고, 기본값(활성 구성)도
  자동으로 `pilot-7-v1`이 된다(화면 코드는 바뀌지 않았다 — DB의 클래스 구성 목록을 그대로 읽는다).

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

### 7.3 데이터 현실화

실제로 확보한 자료는 7.1의 "클래스당 40장(train 40 / test 10)" 목표에 못 미친다. 목표치를 더 모으려 하지 않고, **확보한 185장으로 소규모 파일럿 1회 실험만** 진행한다.

클래스 구성도 4개(`pilot-4-v1`)에서 6개(`pilot-6-v1`, `supabase/migrations/20261020010000_classifier_class_set_pilot6.sql`)로 바꿨다 — IT·공학을 하나로 합치고, 법·정책과 교내 행정 공지를 분리해 별도 클래스로 둔다.

| 분야 | train | test | 합계 |
|---|---|---|---|
| IT_ENGINEERING | 30 | 7 | 37 |
| BUSINESS_PLANNING | 17 | 5 | 22 |
| DESIGN_MEDIA | 22 | 6 | 28 |
| SOCIAL_ENVIRONMENT | 29 | 6 | 35 |
| LAW_POLICY | 6 | 2 | 8 |
| CAMPUS_NOTICE | 6 | 2 | 8 |
| `ood` | — | — | 41 |
| 보류(라벨 미확정, 미사용) | — | — | 6 |
| **합계** | | | **185** |

절차상 차이(7.1과 비교):
- **dev split을 두지 않는다.** Teachable Machine 기본 설정(기본 epoch/batch/learning rate)으로 **한 번만** 학습하고, test로 **한 번만** 평가한다. 설정을 바꿔가며 dev로 비교하는 과정 자체를 생략한다.
- test 결과를 본 뒤에는 재학습하지 않는다 — test를 보고 설정을 고치면 그 test는 더 이상 test가 아니라 사실상 dev가 되어 최종 수치가 과대평가되기 때문이다(7.2의 "test를 보고 다시 고쳤다면 새 test를 확보한다" 원칙과 같은 이유로, 여기서는 애초에 재학습을 하지 않는 쪽을 택한다).
- 개수를 맞추려고 이미지를 복제하거나 증강(회전·크롭·색 보정 등)하지 않는다 — 복제·증강으로 늘린 장수는 실제로는 같은 정보의 반복이라 평가를 왜곡한다.
- 같은 시리즈(동일 행사의 여러 공고 변형본)의 포스터는 7.1의 원칙대로 같은 split에 둔다. train과 test에 같은 시리즈가 섞이지 않도록 manifest의 `series_id`로 확인한다.

라벨 규칙 보완:
- 순수 미술 공모(회화·조각·캘리그라피 등 작가 공모)는 `DESIGN_MEDIA`가 아니라 `ood`로 둔다. `DESIGN_MEDIA`는 디자인·미디어 **실무·제작** 과업(홍보물 디자인, 영상·콘텐츠 제작 등)을 대상으로 하며, 순수 예술 창작 공모는 그 과업 범위 밖이므로 학습 범위 밖 이미지로 분류한다.
- 단순 참관(발표회·설명회·행사 관람 등 결과물 제출이 없는) 행사는 주제가 가장 가까운 분야로 분류한다 — "참관"이라는 형식만으로 보류하거나 `ood`로 두지 않는다.
- 공학(전자·기계·제조 등)은 더 이상 별도 클래스를 두지 않고 `IT_ENGINEERING`에 통합한다 — IT와 공학을 가르는 경계가 애매한 포스터가 많고, 둘 다 표본이 적어 따로 두면 각 클래스가 더 희소해지기 때문이다.
- `CAMPUS_NOTICE`(교내 행정 공지: 수강신청·학사일정·시설 공지 등 특정 서비스 분야로 보기 어려운 공지)는 이어지는 서비스 분야가 없다 — 모델이 이 클래스를 1위로 예측해도 분야를 제안하지 않고 `needs_review`로 남겨 관리자가 직접 판단한다(`classifier_class_set_classes`/`model_class_field_map`에 `interest_id`를 명시적으로 비워 표시한다).

**보고 범위:** 이 실험은 분야당 표본이 적은 **소규모 파일럿**이며, 7.2의 본 실험을 대체하지 않는다. 특히 `LAW_POLICY`와 `CAMPUS_NOTICE`는 표본이 8장씩(train 6 / test 2)뿐이라 다른 네 분야보다도 결과 해석의 한계가 크다 — test 2장의 정오로 정밀도·재현율이 0%나 100%로 요동칠 수 있으므로, 이 두 분야의 지표는 "추세 참고용"으로만 쓰고 단독으로 판단 근거로 삼지 않는다. `docs/model-evaluation.md`에 결과를 적을 때도 "소규모 파일럿(분야별 8~37장, dev 없이 1회 학습·1회 평가)"이라고 명시하고, 클래스별 표본 수가 적어 지표(특히 F1·혼동행렬)가 불안정할 수 있다는 한계를 함께 적는다.

**보완: 클래스를 6개에서 7개로(`pilot-7-v1`, `supabase/migrations/20261020020000_classifier_class_set_pilot7.sql`).** 더 모은 자료를 다시 분류하면서 취미·문화생활 활동을 묶는 `HOBBY_CULTURE` 클래스를 새로 만들고, 순수 미술·문학 공모를 `DESIGN_MEDIA`로 흡수했다(라벨 규칙 갱신, 아래). `pilot-6-v1`은 지우지 않고 비활성으로 남겼다.

| 분야 | train | test | 합계 |
|---|---|---|---|
| IT_ENGINEERING | 33 | 7 | 40 |
| BUSINESS_PLANNING | 17 | 5 | 22 |
| DESIGN_MEDIA | 30 | 8 | 38 |
| SOCIAL_ENVIRONMENT | 32 | 7 | 39 |
| LAW_POLICY | 6 | 2 | 8 |
| CAMPUS_NOTICE | 6 | 2 | 8 |
| HOBBY_CULTURE | 20 | 4 | 24 |
| `ood` | — | — | 1 |
| **합계** | | | **180** |

라벨 규칙 갱신(위 7.3 본문의 규칙을 대체):
- 운동·취미·문화 동아리, 공연·축제·인문학 행사는 `DESIGN_MEDIA`가 아니라 `HOBBY_CULTURE`로 분류한다 — 결과물 제작·실무가 중심이 아니라 참여·향유가 중심인 활동이기 때문이다.
- 순수 미술·캘리그라피·문학 공모는 더 이상 `ood`가 아니라 `DESIGN_MEDIA`로 분류한다(3.6 보완 참고 — `DESIGN_MEDIA`의 서비스 분야 후보에 `ARTS_PERFORMANCE`를 추가해 반영했다). 위 7.3 본문의 "순수 미술 공모는 ood" 규칙은 `pilot-7-v1`부터 더 이상 적용하지 않는다.
- 어학(외국어 회화·스터디) 동아리는 기존 4개 서비스 분야 중 어디에도 맞지 않아 `ood`로 둔다.
- `IT_ENGINEERING`/`LAW_POLICY`/`CAMPUS_NOTICE` 규칙은 `pilot-6-v1`과 동일하게 유지한다.

**한계(갱신):** `ood`가 1장뿐이라 이번 파일럿에서는 "범위 밖 포스터를 얼마나 잘 걸러내는지"는 평가하지 않는다 — test 1장으로는 재현율·정밀도가 의미 있는 수치가 되지 않는다. `LAW_POLICY`·`CAMPUS_NOTICE`는 여전히 8장씩(train 6 / test 2)이라 위에서 적은 해석 한계가 그대로 적용된다. `docs/model-evaluation.md`에는 "소규모 파일럿(분야별 8~40장, ood 1장으로 범위 밖 거르기는 평가 제외, dev 없이 1회 학습·1회 평가)"이라고 명시한다.

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

**이번 범위에서 의도적으로 뺀 것(필요해지면 추가):** 전공 이전 명칭 이력(`major_aliases`), 활동 목표(goal) 입력, 활동 유형 분류 모델, OCR(12장 P1에서 브라우저 OCR 기반을 추가했다), 포스터 이미지 저장과 일괄 재분석, 서버 측 추론.

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

---

## 12. 2차 후처리

> 번호 메모: 이 절의 원래 요청 번호는 "8장"이었다. 그러나 이 문서의 8장(완료 체크리스트)·9장(구현
> 작업 단위, G1~G4)은 마이그레이션·테스트·PROGRESS.md 전역에서 "9장 G1"/"8장 체크리스트"
> 형태로 수십 곳에 인용되고 있어(예: `supabase/migrations/20261013010000_service_fields_and_majors.sql`,
> `tests/unit/poster-analyze.test.ts`), 기존 장 번호를 밀어내면 그 인용들이 전부 틀어진다. 기존
> 번호는 그대로 두고 이 절을 새 장 12로 추가했다 — 내용은 요청한 8.0~8.4 구성 그대로다.

### 12.0 배경

G4(6장, 실험 도구)로 돌린 파일럿 결과(`pilot-7-v1`, 분야별 표본 8~40장)는 **정확도 31%, macro-F1
0.214**였다 — 다수 클래스 기준선과 비슷하거나 못한 수준이다. 원인은 모델이 보는 정보 자체가
부족하다는 데 있다: 포스터는 **분야를 글자(제목·부제·주최·활동 내용 설명)로 전달**하는데,
티처블 머신 이미지 모델은 레이아웃·색·사진 같은 **겉모습만** 본다. 공모전·해커톤·강연처럼 형식이
비슷한 포스터는 분야가 달라도 이미지만으로는 거의 구분되지 않는다 — 글자를 읽지 않는 한 이
한계는 표본을 더 모아도 크게 나아지지 않는다.

### 12.1 설계

이미지 모델(TM) 하나에 의존하지 않고, 네 신호를 결합한다.

1. **TM (1차, 이미지)** — 기존 `/models/poster-classifier/` 모델. 겉모습 기반 후보.
2. **OCR (글자 추출)** — 포스터 원본 이미지에서 글자를 읽는다(12.4의 tesseract.js). 활동 제목·
   설명(사용자가 이미 입력한 텍스트)도 같은 입력에 합친다 — 포스터에 없거나 OCR이 놓친 정보를
   보완한다.
3. **2-A 키워드 규칙** — OCR·제목·설명 텍스트에서 분야별 키워드 사전과의 일치를 본다(사전 자체는
   이번 P1 범위가 아니다, 12.2 참고).
4. **2-B 임베딩 (브라우저 AI)** — 같은 텍스트를 문장 임베딩으로 바꿔, 분야별 대표 문장(또는
   학습 자료 평균 벡터)과의 코사인 유사도를 본다(12.4의 Xenova/multilingual-e5-small).

결합 비율은 **TM 0.3 / 키워드 0.35 / 임베딩 0.35**로 고정한다(평가 전에 고정 — 12.3 공정성
원칙). 세 신호(TM/키워드/임베딩) 중 **2개 이상이 같은 분야를 가리킬 때만** 자동 제안
(`suggested`)하고, 1개만 일치하거나 셋 다 다르면 기존처럼 `needs_review`로 남겨 관리자가
원문을 보고 고른다 — "모델이 혼자 틀리면 혼자 확정한다"를 막는 장치다.

### 12.2 단계 계획 (P1~P6)

| 단계 | 범위 | 상태 |
|---|---|---|
| **P1. 기반** | OCR(tesseract.js)·문장 임베딩(Transformers.js) 모델/언어 파일 준비 스크립트, 두 모듈을 브라우저에서 돌리는 최소 기능(`ocr.ts`/`textEmbedding.ts`/`textNormalize.ts`), `/admin/model-lab` 미리보기 화면. 키워드 사전·점수 결합·DB 변경은 하지 않는다. | **완료** |
| **P2. 키워드 사전** | 학습(train) 이미지의 OCR·제목·설명만으로 분야별 키워드 사전을 만든다(12.3 공정성 원칙 — test 이미지는 쓰지 않는다). 2-A 규칙 함수(순수 함수, 단위 테스트)를 추가한다. | **완료(12.5)** |
| **P3. 임베딩 기준 벡터** | 분야별 학습 자료 임베딩 평균(또는 대표 문장 임베딩)을 만들고, 코사인 유사도로 분야 후보를 매기는 순수 함수를 추가한다. | **완료(12.5)** |
| **P4. 결합·합의 규칙** | TM 0.3/키워드 0.35/임베딩 0.35 가중합과 "2개 이상 일치" 합의 규칙을 구현하고(순수 함수), 기존 `judgePosterClassification`과의 관계를 정리한다. | **완료(이 절, 12.5)** |
| **P5. 저장·화면 연결** | `poster_analyses`에 OCR·키워드·임베딩 신호를 남길 컬럼(또는 별도 테이블)을 새 마이그레이션으로 추가하고, `PosterClassifierPanel`/관리자 검토 화면에 "어떤 신호가 일치했는지" 보여준다. | **완료(P4와 함께 진행, 12.6)** |
| **P6. 평가·전환** | 결합 모델을 같은 test 자료로 재평가해 TM 단독(31%/0.214)과 비교하고, 개선이 확인되면 기본 판정 경로를 결합 모델로 전환한다(`docs/model-evaluation.md` 기록). | **비교 도구 완료(12.7, A~D 단계별 비교)** — "전환"은 결과를 보고 사람이 판단할 일이라 아직 하지 않았다. 다만 `PosterClassifierPanel`(가이드 12.6, P4/P5)은 이미 결합 결과를 기본으로 쓰고 있다 — 이 비교 도구로 그 선택이 TM 단독보다 나은지 사후에도 확인할 수 있다. |

### 12.3 공정성 원칙

- **test 이미지는 키워드 사전·임베딩 기준·결합 비율을 만드는 데 쓰지 않는다.** 전부 train
  이미지(와 train의 OCR·제목·설명)에서만 만든다 — 7.1/7.3의 "test를 보고 다시 고치면 사실상
  dev가 된다"는 원칙을 사전·기준 제작에도 그대로 적용한 것이다. test는 P6에서 **한 번만** 최종
  평가에 쓴다.
- **비율·규칙은 평가 전에 고정한다.** 위 "TM 0.3 / 키워드 0.35 / 임베딩 0.35"와 "2개 이상 일치"
  규칙은 P4 구현 시점에 고정하고, P6 평가 결과를 보고 끼워 맞추듯 바꾸지 않는다. 바꿔야 할
  이유가 생기면(예: 특정 분야가 계속 과소 제안) 이유를 문서에 적고 **다음 파일럿**에서 바꾼다.

### 12.4 OCR·임베딩 파일과 버전

- **OCR — tesseract.js `7.0.0`** (Apache-2.0). worker(`dist/worker.min.js`)와 코어
  (`tesseract.js-core@7.0.0`의 LSTM 계열 3종: plain/simd/relaxedsimd — 레거시 엔진용 파일은
  받지 않는다), 언어 데이터는 `@tesseract.js-data/eng@1.0.0`·`@tesseract.js-data/kor@1.0.0`
  (`4.0.0_best_int`, LSTM 전용 경량판)을 쓴다. 전부 npm 패키지라 `package.json`/
  `package-lock.json`이 버전을 고정하고, `npm run fetch:ai-assets`는 이미 받아진
  `node_modules`에서 `public/ocr/`로 **복사**만 한다(새로 CDN에서 받지 않는다).
- **문장 임베딩 — `Xenova/multilingual-e5-small`** (quantized ONNX, `dtype: "q8"`).
  **고른 이유:** 원 모델 `intfloat/multilingual-e5-small`이 한국어를 포함한 100여 개 언어를
  지원하고, 질의·문서 임베딩을 위한 검색·유사도 특화 모델이라 "포스터 텍스트와 분야 대표
  문장이 얼마나 비슷한가"를 보는 이번 쓰임에 맞는다. 입력 앞에 `"query: "` 접두어를 붙여야
  하는 e5 규칙을 `textEmbedding.ts`가 따른다.
  **라이선스:** MIT(원 모델·Xenova 변환본 모두). **파일 크기:** `onnx/model_quantized.onnx`
  약 112.8MB + `tokenizer.json` 약 16.3MB + 설정 파일 소량 ≈ 약 129.2MB. 비교 후보였던
  `Xenova/paraphrase-multilingual-MiniLM-L12-v2`(Apache-2.0, 양자화 ONNX 크기 거의 동일,
  약 112.8MB)도 한국어를 지원해 라이선스·용량 모두 쓸 수 있었지만, 검색·유사도 특화로 설계된
  e5 계열을 우선했다. `@huggingface/transformers` `4.3.0`로 돈다. 커밋 고정
  (`761b726dd34fb83930e26aab4e9ac3899aa1fa78`, main 브랜치 추적 아님)으로 Hugging Face Hub에서
  받고, 받은 뒤 SHA-256을 검증한다.
- **onnxruntime-web(런타임) — `@huggingface/transformers`의 전이 의존성 버전.**
  `env.backends.onnx.wasm.wasmPaths`를 설정하지 않으면 라이브러리가 기본값으로 jsDelivr CDN을
  쓰려고 하므로(`node_modules/@huggingface/transformers/src/backends/onnx.js`), SIMD+threaded
  WASM 런타임 파일(`ort-wasm-simd-threaded.mjs`/`.wasm`)을 `node_modules`에서 복사해 로컬
  경로로 고정한다(구형 Safari용 asyncify 빌드는 약 27MB가 더 필요해 이번 범위에서는 받지
  않는다 — 실제 평가·개선은 P2 이후에서 브라우저 지원 범위를 다시 본다).
- 받는 파일 전체 용량과 로딩·처리 시간 실측치는 `PROGRESS.md`의 "포스터 2차 후처리 P1" 절에
  기록한다(환경마다 달라질 수 있어 이 설계 문서에는 고정값을 적지 않는다).

### 12.5 키워드(2-A)·임베딩(2-B) 규칙과 버전 (P2~P4)

**아래 규칙·비율·가중치는 test 사진을 보기 전에 고정했다.** `datasets/keyword-review.md`에
적은 대로 학습용 사진 144장의 OCR 결과와 라벨 규칙만 보고 만들었고(2026-10-21 확정), test
폴더는 열어 보지 않았다. P6(평가) 전까지는 바꾸지 않는다(12.3 공정성 원칙).

- **키워드 사전 — `keywords-v1`** (`src/lib/poster/keywordRules.ts`, `datasets/keywords-v1.json`
  그대로). 분야 7개(`IT_ENGINEERING`/`BUSINESS_PLANNING`/`DESIGN_MEDIA`/`SOCIAL_ENVIRONMENT`/
  `LAW_POLICY`/`CAMPUS_NOTICE`/`HOBBY_CULTURE`) × 가중치 3단계(강함 3/보통 2/약함 1), 총
  239개 단어. 한글은 공백을 뺀 텍스트(`textNormalize`의 matchKey)에서 부분 문자열로 찾고,
  영문·숫자는 소문자로 바꾼 뒤 단어 경계(`\b`)로 찾는다("AI"가 "mail" 안쪽에는 걸리지 않게).
  같은 단어는 문서당 1번만 센다. 분야별 가중치 합을 전체 합으로 나눈 분포와 걸린 단어 목록을
  돌려주고, 걸린 게 없으면 null — 그러면 2-A 신호 없이 TM·2-B만으로 결합한다.
- **임베딩 참조 세트 — `reference-v1`** (`public/models/text-reference/reference-v1.json`,
  `/admin/model-lab`의 "임베딩 참조 만들기" 섹션으로 만든다). 분야 설명문 7개
  (`datasets/field-descriptions-v1.json`) + 학습용 포스터 OCR 텍스트 144개(`datasets/ocr/*.csv`,
  파일명이 라벨) = 총 151개 벡터. 벡터만 저장하고 원문 텍스트는 넣지 않아 커밋해도 된다(라이선스·
  저작권 문제 없음). 만들 때 `datasets/manifest.csv`로 각 OCR 행이 실제로 `split=train`인지
  확인하고, train이 아니거나 manifest에 없는 행이 하나라도 섞여 있으면 전체를 거부한다 — test
  사진이 참조 세트에 들어가는 것을 막는 안전장치다. 임베딩 입력은 한글 2글자 이상·영문 3글자
  이상 단어만 남기고 1000자에서 자른다(`cleanTextForEmbedding`) — OCR이 섞어 내는 한 글자짜리
  잡음을 거른다. 분야별 참조 벡터와의 코사인 유사도 **상위 3개 평균**을 "원점수"로 쓰고,
  `원점수/0.05`에 softmax를 적용해 분포를 만든다 — 분모(0.05)가 작을수록 1위 분야에 점수가
  몰린다. 참조 세트 파일이 없으면 2-B 없이(TM·2-A만으로) 동작한다.
- **결합 — `postprocess-v1`** (`src/lib/poster/combine.ts`, 코드 상수로 고정). 가중치 TM 0.3 /
  키워드 0.35 / 임베딩 0.35 — 없는 신호는 빼고 남은 가중치를 합 1로 다시 맞춘다(예: 임베딩이
  없으면 TM 0.3/0.65, 키워드 0.35/0.65). `CAMPUS_NOTICE`가 최종 1위면 분야를 제안하지 않고
  `needs_review`로 둔다(서비스 분야가 없는 클래스, 가이드 3.6 보완). 그 외에는 **있는 신호 중
  2개 이상의 1위가 최종 1위와 같고, 최종 1위 점수가 0.50 이상**이어야 `suggested`다. 글자
  신호(키워드·임베딩)가 둘 다 없으면 기존 TM 단독 판정(`judgePosterClassification`,
  top≥0.80·margin≥0.20)을 그대로 쓴다 — OCR·임베딩이 실패해도 TM 결과로 저장된다.
- 활동 제목·설명이 있으면 OCR 텍스트 앞에 붙여 2-A·2-B 입력으로 함께 쓴다(`PosterClassifierPanel`).

### 12.6 DB·화면 연결 (P5)

마이그레이션 `20261021010000_poster_postprocess.sql`(신규, 기존 마이그레이션은 수정하지 않음)이
`poster_analyses`에 `postprocess_version`/`keywords_version`/`embed_version`/`tm_top_class`/
`keyword_top_class`/`embed_top_class`/`final_top_class`/`signal_agreement`/`matched_keywords`
(걸린 키워드 **단어 목록만** — OCR 원문이나 포스터 이미지는 여전히 저장하지 않는다, 가이드 0장
원칙 그대로)를 추가했다. `record_poster_analysis`/`create_activity_with_fields`/
`submit_activity` 세 함수 모두 끝에 선택 파라미터로 이 필드들을 받도록 확장했다(옛 시그니처는
명시적으로 지운 뒤 다시 만들었다 — 20261013050000이 세운 관례 그대로, EXECUTE 권한이 옛
시그니처에 남지 않는다). 날짜·지원 자격·원문 링크 같은 사실관계는 여전히 사람이 원문으로 확인한다
— 이 마이그레이션은 "분야 후보가 어떻게 나왔는지"에 대한 신호만 남긴다.

`PosterClassifierPanel`이 TM 분석 뒤 포스터 원본 이미지로 OCR을 돌리고(`applyTextPostprocess`),
결합 결과로 `status`/`topClass`/`candidateInterestIds`를 덮어쓴다. 화면에는 최종 1~3위와 점수,
신호별 1위(TM/키워드/임베딩), 일치 개수, 근거 키워드를 보여준다. 새 RPC
`lookup_org_field_history`(운영자 전용)는 같은 주최 기관(`activities.org_name`)의 활동 중 이미
확정된 분야를 건수와 함께 돌려주고, "같은 기관의 이전 확정: ○○ (2건)"으로 **참고 정보로만**
보여준다 — 점수 계산에는 쓰지 않는다. 기관 필드(`orgName`)를 넘기지 않은 화면에서는 이 부분을
그냥 생략한다.

### 12.7 단계별 비교 도구 (P5)

`/admin/model-lab`의 "6.3 모델 평가" 섹션에 세 번째 모드 "단계별 비교(2차 후처리)"를 추가했다
(`PostprocessComparisonSection.tsx`, 순수 계산은 `src/lib/modelLab/postprocessCompare.ts`).
manifest.csv와 이미지 여러 장을 올리면 이미지마다 TM·OCR·키워드·임베딩 신호를 **한 번씩만**
계산하고, 그 신호로 아래 네 방식을 전부 계산해 같은 표에 나란히 보여준다 — **keywordRules
(keywords-v1)·embeddingClassifier(embed-v1, reference-v1)·combine(postprocess-v1)의 규칙·
가중치·사전·참조 파일은 이 도구에서도 전혀 바꾸지 않는다.**

| 방식 | 구성 |
|---|---|
| A | TM만(1차, 기존 top≥0.80·margin≥0.20 판정) |
| B | TM + 키워드(`combinePosterSignals`에 `embedding: null`로 넘김 — 재정규화·판정 규칙은 그대로) |
| C | TM + 임베딩(`keyword: null`로 넘김) |
| D | TM + 키워드 + 임베딩 + 합의 규칙(`postprocess-v1` 그대로) |

**실행 방식:** split=test 행만 평가한다. 업로드한 이미지 중 manifest에서 `split=train`으로
확인되는 파일이 있으면 평가하지 않고 "train split 이미지 N개는 평가하지 않았어요: 파일명..."
경고로만 보여준다(dev/ood나 manifest에 없는 파일도 평가하지 않지만 따로 경고하지는 않는다).
실행 버튼을 누르면 `window.confirm`으로 "평가용 사진은 한 번만 평가합니다. 결과를 보고 규칙을
바꾸지 않습니다"를 띄우고, 취소하면 실행하지 않는다.

**보여주는 결과(A~D 같은 표):** 정확도, macro-F1, 분야별 정밀도·재현율·F1·혼동행렬(방식별
접은 상세), 자동 제안 비율과 자동 제안 중 정확도(각 방식 자신의 판정 규칙 기준 — A는
top/margin 임계값, B·C·D는 `combinePosterSignals`가 돌려주는 `status`), 처음 보는 기관
정확도(가이드 6.3과 같은 방식 — manifest의 train 행 기관을 "본 기관"으로 센다). 그 옆에
참고 정보로 **글자 신호 없음 비율**(OCR 실패 또는 키워드·임베딩 둘 다 없음)과 **신호별 단독
1위 정확도**(결합 없이 TM만/키워드만/임베딩만 봤을 때 — 신호가 없는 이미지는 예측 없음으로
처리해 오답으로 센다)를 보여준다.

**내보내기:** JSON·마크다운에 A~D 결과 전체와 모델 버전·전처리(`pad-square-v1`)·`keywords-v1`·
`embed-v1`·`postprocess-v1` 버전·측정 시각을 담는다. 이미지별 CSV(`filename,label,tm_top,
keyword_top,embed_top,final_top_A,final_top_B,final_top_C,final_top_D,signal_agreement,
matched_keywords`)도 따로 내려받을 수 있다 — `matched_keywords`는 단어만 세미콜론으로 이어
붙이고, OCR 원문이나 포스터 이미지는 어떤 내보내기에도 넣지 않는다.

**실제 데이터로 확인:** Playwright로 실제 관리자 화면을 띄워 `datasets/manifest.csv`와
`pictures/`의 실제 test·train 이미지로 돌려 봤다 — train 이미지 경고가 정확히 떴고, A~D가
서로 다른(때로는 더 낫고 때로는 같은) 결과를 냈으며, CSV 내보내기도 기대한 컬럼 그대로
나왔다. 실제 성능 비교(TM 단독 31%/0.214 대비 결합 모델이 더 나은지)는 이 도구로 전체
test 자료를 한 번 돌려야 알 수 있다 — 그 실행과 "전환" 판단은 사람이 다음 단계에서 한다.
