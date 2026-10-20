# 상명메이트 (비공식 데모)

상명대학교 서울캠퍼스 학생을 위한 대외활동 추천·파티 매칭 서비스 데모입니다.
**상명대학교 공식 서비스가 아닙니다.** 설계 배경은 `docs/architecture.md`, 진행 상황은
`PROGRESS.md`를 참고하세요.

## 요구 사항

- Node.js 24.x, npm
- Docker Desktop (로컬 Supabase 스택용)
- Supabase CLI는 전역 설치 없이 `npx supabase ...`로 사용합니다.

## 처음 설정

```bash
npm install
cp .env.example .env.local   # 아래 "로컬 Supabase 띄우기" 실행 후 값 채우기
npm run fetch:ai-assets      # /admin/model-lab의 OCR·문장 임베딩 미리보기에 필요한 파일을 받는다(최초 1회, docs 8.4 참고)
```

## 로컬 Supabase 띄우기

```bash
npx supabase start
```

출력된 `API_URL`, `ANON_KEY`, `SERVICE_ROLE_KEY`를 `.env.local`에 채웁니다
(`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`).
로컬 데모 키는 고정값이며 비밀값이 아닙니다.

마이그레이션 + 시드를 다시 적용하려면:

```bash
npx supabase db reset
```

스택을 끄려면 `npx supabase stop`.

### 로컬에서 로그인 메일 확인하기 (Mailpit)

이메일 매직링크/OTP 로그인이라 비밀번호가 없습니다. 로컬 환경에서는 실제 메일이 발송되지
않고 Supabase가 내장한 메일 테스트 도구인 **Mailpit**(이전 Inbucket 역할)이 가로챕니다.

1. 앱의 `/login`에서 `name@smu.ac.kr` 형태의 이메일로 "매직링크 보내기"를 누릅니다.
2. 브라우저에서 **http://127.0.0.1:54324** (Mailpit 웹 UI, `supabase start` 출력의
   `MAILPIT_URL`/`INBUCKET_URL`과 동일)를 엽니다.
3. 방금 받은 메일을 열고 "로그인하기" 링크를 클릭하면 로그인됩니다.

개발용 인증 우회 코드는 없습니다 — 로컬에서도 실제 매직링크 플로우를 그대로 거칩니다.

## 앱 실행

```bash
npm run dev     # 개발 서버 (Turbopack), 평소 개발은 이걸로
npm run build && npm run start   # 프로덕션 빌드로 실행 (배포 전 최종 확인용)
```

http://127.0.0.1:3000 에서 접속합니다.

> **참고(해결됨):** 한때 `next dev`가 `localhost`가 아닌 호스트(`127.0.0.1` 등)에서 오는
> `_next/*` 자산 요청을 403으로 막아 클라이언트 번들이 부트스트랩되지 않고(로그인 폼 등
> 자바스크립트 상호작용이 전혀 반응하지 않음) 하이드레이션이 되지 않는 문제가 있었습니다.
> `next.config.ts`의 `allowedDevOrigins: ["127.0.0.1", "localhost"]`로 해결했고, 지금은
> `npm run dev`로도 정상적으로 하이드레이션됩니다. Playwright E2E는 여전히 프로덕션 빌드
> (`npm run build && npm run start`)를 대상으로 합니다(`playwright.config.ts` 참고) — 배포
> 산출물과 동일한 환경에서 검증하기 위함이며, 더 이상 dev 서버의 제약을 피하기 위한 것은
> 아닙니다.

## 테스트 계정 (시드 데이터)

`supabase/seed.sql`이 만드는 계정입니다. 비밀번호가 없으므로 `/login`에서 아래 이메일로
매직링크를 요청하고 Mailpit에서 링크를 클릭해 로그인합니다.

| 이메일 | 닉네임 | 역할 |
|---|---|---|
| `admin@smu.ac.kr` | 운영자데모 | 관리자(`user_roles.role = 'admin'`) |
| `student1@smu.ac.kr` | 기획러민지 | 일반 사용자, 온보딩 완료 |
| `student2@smu.ac.kr` | 개발자준호 | 일반 사용자, 온보딩 완료 |
| `student3@smu.ac.kr` | 디자이너소은 | 일반 사용자, 온보딩 완료 |
| `student4@smu.ac.kr` | 마케터하늘 | 일반 사용자, 온보딩 완료 |

활동 22건(모집중/마감임박/접수예정/마감 혼합), 수동 파티 2건, 빠른 매칭 확정 1건이 함께
시드됩니다. 전부 `is_demo = true`로 표시되는 샘플 데이터입니다.

## 화면 지도 (5-A 기준, 전체)

| 경로 | 설명 |
|---|---|
| `/` | 홈 — 마감임박 활동, 맞춤 추천, 모집 중인 파티, 내 매칭 상태 |
| `/activities` | 활동 탐색 — 키워드·유형·모집상태·진행방식·팀참여·지역 필터, URL에 반영, 페이지네이션 |
| `/activities/[id]` | 활동 상세 — 자격, KST 일정, 원문 링크, 추천 근거, 관련 파티, 빠른 매칭 진입 |
| `/activities/submit` | 활동 제보 (로그인 사용자) — 운영자 승인 후 공개 |
| `/login` → Mailpit → `/auth/confirm` | 매직링크 로그인 |
| `/onboarding` | 첫 로그인 시 프로필 온보딩 (닉네임만 필수, 나머지는 건너뛰기 가능) |
| `/me`, `/me/edit` | 마이 페이지(북마크·매칭 이력·알림 배지), 프로필 수정 |
| `/me/blocked` | 차단 목록 — 해제 가능 |
| `/me/withdraw` | 회원 탈퇴 — 팀장으로 있는 파티가 있으면 먼저 위임/해산 안내 |
| `/parties`, `/parties/new`, `/parties/[id]`, `/parties/[id]/edit` | 파티 생성·지원·승인·탈퇴·위임·해산·확정·재모집, 정보 수정 |
| `/match/[activityId]` | 빠른 매칭 — 참가 전/대기 중/제안 받음 상태 전환 |
| `/chat`, `/chat/[roomId]` | 팀 채팅 목록/상세 — 실시간 수신, 읽음 처리, 차단·신고 |
| `/notifications` | 앱 내 알림 |
| `/admin` | 관리자 홈 (`user_roles` 기반 접근 제어, 일반 사용자는 403) |
| `/admin/activities`, `/new`, `/[id]/edit`, `/import` | 활동 CRUD, CSV 가져오기 |
| `/admin/submissions` | 사용자 활동 제보 검토 — 승인(공개)/거절 |
| `/admin/reports` | 신고 관리 — 상태 변경, 신고된 메시지는 전후 3개만 열람 |
| `/admin/accounts` | 계정 관리 — 닉네임 검색, 정지/해제 |
| `/admin/audit-logs` | 감사 로그 — 운영자 조치 이력 |
| `/admin/model-lab` | 실험 도구 — 학습 이미지 변환, 데이터 목록 검사, 모델 평가, 모델 등록 |

## 매칭 워커 실행

빠른 매칭 제안 편성·만료 처리는 `run_match_worker()` DB 함수가 한다. 로컬 스택은 `pg_cron`
확장으로 **매분 자동 실행**되도록 이미 등록돼 있다(`supabase/migrations/20261003170100_...sql`
끝부분). 즉시 확인하고 싶거나 pg_cron 없이 수동으로 돌리고 싶으면:

```bash
npm run worker:match
```

(`scripts/run-match-worker.mjs`, service-role 키로 같은 RPC를 직접 호출합니다.)

## 활동 URL 가져오기 / 링크 정기 점검

`/admin/activities/new`·`/admin/activities/[id]/edit`·`/activities/submit` 화면의 "URL로
가져오기"는 주최기관 공고 페이지 1개를 안전하게(SSRF 방어 포함) 가져와 제목·날짜 후보·근거
문장을 미리보기로 보여줍니다. 아무것도 자동으로 저장되지 않고, 운영자/사용자가 "적용"을 눌러야
폼에 반영됩니다. 설계는 `docs/architecture.md` 14장 참조.

공개 중인 활동의 원문 링크는 **하루 1회** `/api/cron/link-check`가 점검합니다(응답이 비정상이거나
저장해 둔 마감일 문구를 더 이상 찾을 수 없으면 "원문 확인 필요"로 표시 + 운영자 알림). 매칭
워커와 달리 이 점검은 실제 외부 HTTP 요청이 필요해 pg_cron이 직접 할 수 없으므로, **외부
스케줄러가 이 엔드포인트를 하루 1회 호출하도록 등록해야 합니다**(Vercel Cron Job, OS cron,
GitHub Actions scheduled workflow 등 — 이 저장소에서 실제로 등록하지는 않았습니다). 엔드포인트는
`CRON_SECRET` 환경변수(아래 "환경변수" 절)로 보호되며, 그 값이 없으면 모든 요청을 거부합니다.

즉시 확인하거나 로컬에서 수동으로 돌리고 싶으면(개발 서버가 떠 있어야 함):

```bash
npm run worker:link-check
```

(`scripts/run-link-check-worker.mjs`, `/api/cron/link-check`를 직접 호출합니다.)

## 포스터 분류 모델 교체 절차

`docs/teachable-machine-integration.md` 3.6/5.1, 9장 G3/G4 참조. 모델을 새로 학습하거나 교체할 때:

1. 티처블 머신 Image Project에서 클래스 이름을 **고정 ID**(현재 활성 구성은 `pilot-7-v1`의
   `IT_ENGINEERING`/`BUSINESS_PLANNING`/`DESIGN_MEDIA`/`SOCIAL_ENVIRONMENT`/`LAW_POLICY`/
   `CAMPUS_NOTICE`/`HOBBY_CULTURE` — 이전 구성 `pilot-4-v1`/`pilot-6-v1`도 지우지 않고 비활성으로
   남아 있습니다)로 학습했는지 확인합니다. 클래스 구성 자체를 바꾸고 싶으면(분야 추가/제거) 먼저 새 마이그레이션으로
   `classifier_class_sets`/`classifier_class_set_classes`에 새 구성을 추가해야 합니다 — 운영
   환경에도 반영되어야 하므로 시드가 아니라 마이그레이션으로 추가합니다(`supabase/migrations/
   20261013060000_classifier_class_sets.sql`이 예시).
2. 내보낸 `model.json`/`metadata.json`/`weights.bin`을 `public/models/poster-classifier/`에
   그대로 덮어씁니다(가중치 파일 이름을 바꾸지 않습니다). 학습 이미지는 커밋하지 않습니다.
3. 배포 후 `/admin/model-lab`의 **"모델 등록"** 섹션을 엽니다. metadata.json에서 읽은 모델
   버전과 labels가 표시됩니다 — 모델 파일이 아직 없으면 "모델 미설치"만 보입니다.
4. labels와 **정확히 일치하는** 클래스 구성을 선택합니다(일치하지 않으면 등록 버튼이
   비활성화됩니다). "등록"을 누르면 그 모델 버전의 `model_class_field_map` 행이 선택한 구성에서
   복사되어 후보 제안이 켜집니다. 등록 시각과 등록자가 함께 기록되고, 같은 버전을 다시 등록해도
   중복되지 않습니다(재등록 = 갱신).
5. 등록 후에는 같은 화면의 "6.3 모델 평가"가 기본적으로 "이미지 + manifest로 모델 실행" 모드로
   열립니다 — test/ood 자료로 실제 모델을 돌려 정확도·macro-F1·임계값 통과율을 확인하고
   `docs/model-evaluation.md`에 기록합니다(가이드 6.3).
6. 운영 중인 `app_settings.poster_classifier`의 `suggest_min_top_score`/`suggest_min_margin`을
   평가 결과에 맞춰 조정합니다(운영자 전용 쓰기, `docs/operations.md` 참고).

구 모델 버전의 `model_class_field_map` 행은 지우지 않습니다 — 과거에 그 버전으로 분석된
`poster_analyses` 기록이 재분석 없이도 여전히 해석 가능해야 하기 때문입니다(가이드 체크리스트
8번, "재분석이 확정값을 바꾸지 않는다").

## 테스트

```bash
npm run lint
npm run typecheck
npm test            # 단위 테스트 + RLS 테스트 (로컬 Supabase가 떠 있어야 함)
npm run test:rls     # RLS 테스트만
npm run test:e2e     # Playwright E2E (내부적으로 build && start 실행)
```

RLS 테스트는 `.env.local`의 `SUPABASE_SERVICE_ROLE_KEY`가 필요합니다. `npm test`는 실행 전에
로컬 Postgres(`SUPABASE_DB_URL`, 기본값은 `supabase start`의 표준 로컬 포트)에 직접 연결해
`match-worker` pg_cron 작업을 잠시 내려두고 스위트가 끝나면 복원합니다(`tests/global-setup.ts`)
— 백그라운드 워커와 테스트의 수동 호출이 겹쳐 결과가 흔들리는 것을 막기 위함입니다.

## 데이터베이스 함수 권한 규칙 (개발 규칙)

`supabase/migrations/`에 `public` 스키마 함수를 새로 추가할 때는 아래 규칙을 지킵니다
(배경·근거는 `docs/architecture.md` 13장 참조 — Supabase가 함수 생성 시점에
`anon`/`authenticated`에게 EXECUTE를 자동으로 주던 문제를 고친 내용입니다):

- **기본값은 이미 "닫힘"입니다.** 마이그레이션 `20261004070000`이 `postgres` 역할의 함수
  기본 권한에서 `anon`/`authenticated`를 제거해 뒀으므로, 새로 만드는 함수는 아무것도 하지
  않아도 `anon`/`authenticated`가 호출할 수 없습니다.
- **로그인 사용자가 RPC로 직접 호출해야 하는 함수만** 명시적으로 엽니다: `grant execute on
  function public.새함수(...) to authenticated;`. `anon`(비로그인)에게도 열어야 하는 경우는
  거의 없습니다 — anon도 조회 가능한 테이블의 RLS 정책에서 쓰는 헬퍼(`is_admin()`,
  `is_party_member(uuid)`처럼)가 아니면 `authenticated`에만 둡니다.
- **`revoke all on function ... from public`만으로는 막히지 않습니다.** `anon`/`authenticated`를
  반드시 이름으로 지정해서 revoke해야 합니다(`from public, anon, authenticated`). `from
  public`만 쓰는 과거 패턴은 되돌아가지 않도록 주의합니다.
- 기준 시각 등을 받는 **워커 함수**(`run_match_worker`처럼 pg_cron이 호출하는 함수)는
  `service_role`에게만 열고 `anon`/`authenticated`에게는 절대 열지 않습니다.
- `tests/rls/execute_privileges.test.ts`가 위 규칙을 자동으로 가드합니다 — `public` 스키마의
  모든 함수를 조회해 허용 목록과 비교하고, 목록에 없는 함수가 `anon`/`authenticated`에게
  EXECUTE를 갖고 있으면 테스트가 실패합니다. 새 RPC 함수를 추가하면 그 파일의 `ALLOWLIST`도
  함께 갱신하세요.

## 환경변수

`.env.example`을 복사해 `.env.local`을 만들고 값을 채웁니다. **필수** 항목이 없으면 앱이
빌드/실행 시점에 명확한 에러로 멈춥니다(조용히 잘못 동작하지 않습니다).

| 변수 | 필수/선택 | 설명 |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | 필수 | Supabase 프로젝트 API URL (`supabase start` 출력의 `API_URL`, 또는 클라우드 프로젝트 설정) |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 필수 | 공개 anon 키 — 브라우저에 노출돼도 되는 값(RLS로 보호됨) |
| `SUPABASE_SERVICE_ROLE_KEY` | 필수 | **서버 전용** 비밀 키. RLS를 우회하므로 서버 액션/테스트 하네스에서만 쓰고, `NEXT_PUBLIC_` 접두사를 절대 붙이지 않습니다(클라이언트 번들에 포함되면 안 됨) |
| `NEXT_PUBLIC_SITE_URL` | 필수 | 매직링크 리다이렉트를 검증하는 허용 origin(`src/lib/url.ts`). Host 헤더를 신뢰하지 않고 이 값 기반 허용 목록으로만 리다이렉트 origin을 고릅니다 — 오픈 리다이렉트 방지 |
| `NEXT_PUBLIC_SITE_URL_ALIASES` | 선택 | 추가로 허용할 origin(쉼표 구분). 로컬에서 `127.0.0.1`과 `localhost` 둘 다 쓸 때처럼, 같은 앱에 여러 호스트명으로 접속 가능할 때만 필요 |
| `NEXT_PUBLIC_INBUCKET_URL` | 선택 | 로컬 메일 확인 도구(Mailpit) URL. Playwright E2E가 매직링크를 읽어오는 데 씁니다(로컬/CI 전용, 운영에서는 불필요) |
| `SUPABASE_DB_URL` | 선택 | 테스트 하네스가 pg_cron을 직접 제어할 때 쓰는 Postgres 접속 문자열(기본값은 로컬 표준 포트). 운영 코드 경로에서는 쓰지 않습니다 |
| `CRON_SECRET` | 정기 점검 쓰려면 필수 | `/api/cron/link-check` 호출 인증용 임의의 긴 문자열. 설정하지 않으면 이 엔드포인트는 모든 요청을 거부합니다(기본값이 "닫힘") |
| `ACTIVITY_IMPORT_LLM_API_KEY` | 선택 | URL 가져오기의 LLM 보조(제목·주최기관·태그·유형·자격 요약 **후보만** 제안, 날짜는 절대 받지 않음)를 켜는 키. 없으면 규칙 기반 추출 + 수동 입력만으로 등록이 계속 동작합니다 |
| `ACTIVITY_IMPORT_LLM_PROVIDER` | 선택 | LLM 공급자 이름(기본값 `anthropic`). 알 수 없는 값이면 꺼짐으로 안전하게 처리됩니다 |
| `ACTIVITY_IMPORT_LLM_MODEL` | 선택 | LLM 보조가 쓸 모델 이름(기본값 `claude-haiku-4-5-20251001`) |
| `ACTIVITY_IMPORT_SSRF_TEST_ALLOWLIST` | **테스트 전용, 운영에 절대 설정하지 마세요** | SSRF 차단을 건너뛸 호스트명(쉼표 구분). Playwright E2E가 로컬 픽스처 서버를 가져오기 위해 `playwright.config.ts`에만 설정합니다 |

실제 비밀값은 `.env.example`에 넣지 않습니다 — 로컬 데모 키(위 anon/service-role 키)는 고정값이라
괜찮지만, 클라우드 프로젝트로 전환하면 그 프로젝트의 실제 키로 교체해야 합니다.

## CSV 활동 가져오기 형식

`/admin/activities/import`에서 쓰는 CSV 헤더:

```
title,summary,org_name,source_url,location_type,region,activity_type,eligibility,participation_mode,team_min_size,team_max_size,benefit,apply_start_at,apply_end_at,activity_start_at,activity_end_at
```

- `location_type`: `online` | `offline` | `hybrid`
- `participation_mode`: `solo` | `team` | `both`
- 날짜는 `2026-10-15` 또는 ISO 8601(`2026-10-15T10:00:00+09:00`)
- `activity_type`은 기존 유형 이름과 정확히 일치해야 연결되고, 일치하지 않으면 유형 없이
  등록됩니다(경고로 표시).
- 가져온 행은 항상 **비공개(draft)** 로 등록되며, 운영자가 검토 후 공개로 전환합니다.

## 배포 방법 (Supabase 클라우드 + Vercel 등)

> **이 저장소에서 실제 배포를 실행하지는 않았습니다.** 아래는 배포 시 거칠 단계와, 선택한
> 호스팅에서 pg_cron·Realtime·서버 함수가 어떻게 동작하는지에 대한 설명입니다.

### 1. Supabase 프로젝트 준비 (DB + Auth + Realtime)

1. [supabase.com](https://supabase.com)에서 새 프로젝트를 만듭니다(무료 플랜은 자동 백업이
   없거나 매우 제한적입니다 — `docs/operations.md` 4절 참조).
2. 로컬에서 그 프로젝트에 연결하고 마이그레이션을 적용합니다:
   ```bash
   npx supabase link --project-ref <프로젝트 참조 ID>
   npx supabase db push
   ```
   이 저장소의 **시드(`supabase/seed.sql`)는 운영 프로젝트에 적용하지 않습니다** — 가상
   데이터이고 테스트 계정 로그인 우회가 전혀 없는 진짜 매직링크 계정이라, 실제로 그 이메일
   주소(`admin@smu.ac.kr` 등)를 제어하는 사람이면 누구나 로그인해 관리자 권한을 포함한
   시드 데이터를 쓸 수 있게 됩니다. 운영 DB는 **빈 스키마 + 운영자가 직접 지정한 첫
   관리자**로 시작해야 합니다(`docs/operations.md` 1절).
3. **pg_cron 확장 활성화 확인** — Supabase 대시보드 **Database → Extensions**에서
   `pg_cron`이 활성화돼 있는지 확인합니다. 마이그레이션(`20261003170100_matching_functions.sql`)이
   `create extension if not exists pg_cron;`과 `cron.schedule('match-worker', '* * * * *', ...)`을
   포함하므로 `db push`로 마이그레이션을 적용하면 **보통 자동으로 등록됩니다**. 다만 프로젝트
   플랜에 따라 `pg_cron`이 기본 비활성화돼 있을 수 있으니 대시보드에서 실제로 Extensions 목록에
   있고 활성 상태인지, 그리고 **Database → Cron Jobs**(또는 `select * from cron.job;`을 SQL
   Editor에서 직접 실행)에서 `match-worker`가 매분 실행 중인지 반드시 확인합니다. **빠른 매칭
   워커는 Postgres 안에서(pg_cron으로) 돌기 때문에 Next.js를 어디에 배포하든(Vercel이든 다른
   곳이든) 영향을 받지 않습니다** — 이 점이 서버리스 호스팅(요청이 없으면 함수가 깨어나지 않는)에
   매칭 워커를 올리지 않고 DB 안에 둔 이유입니다.
4. **Realtime** — Supabase 클라우드는 Realtime이 프로젝트 생성 시 기본 활성화돼 있습니다.
   `chat_messages_broadcast` 트리거(Broadcast-from-Database, `architecture.md` 11.2절)와
   `realtime.messages` RLS 정책은 마이그레이션에 포함돼 있어 `db push`만으로 그대로 동작합니다 —
   별도 설정이 필요 없습니다.
5. **Auth 설정** — `docs/operations.md` 7절대로 Rate Limits(이메일 발송 빈도 등)와 JWT expiry를
   대시보드에서 직접 설정합니다. 커스텀 SMTP도 이 단계에서 연결합니다(기본 제공 발신 한도는
   운영 트래픽에 부족합니다).
6. **첫 관리자 지정** — `docs/operations.md` 1절.

### 2. Next.js 앱 배포 (Vercel 기준, 다른 Node 호스팅도 원리는 같음)

1. 저장소를 Vercel에 연결합니다.
2. 위 "환경변수" 표의 값을 Vercel 프로젝트 환경변수로 등록합니다 — 특히
   `SUPABASE_SERVICE_ROLE_KEY`는 **서버 전용**으로 등록하고(Vercel은 `NEXT_PUBLIC_` 접두사가
   없는 변수를 자동으로 서버 전용으로 취급합니다), `NEXT_PUBLIC_SITE_URL`은 실제 배포 도메인
   (예: `https://sangmyung-mate.vercel.app` 또는 커스텀 도메인)으로 설정합니다.
3. 서버 액션(Server Actions)은 Next.js 16 App Router의 표준 기능이라 Vercel에서 별도 설정 없이
   동작합니다. `next.config.ts`의 `allowedDevOrigins`는 **개발 서버 전용** 설정이라 프로덕션
   빌드/배포에는 영향을 주지 않습니다.
4. Supabase Auth의 **Redirect URLs** 설정(대시보드 → Authentication → URL Configuration)에
   배포 도메인의 `/auth/confirm` 경로를 추가해야 매직링크가 정상적으로 돌아옵니다.
5. 배포 후 `docs/operations.md` 7절의 방법으로 Rate Limit·jwt_expiry가 실제로 반영됐는지
   확인합니다.

### 3. 배포 후 체크리스트

- [ ] 시드 데이터가 운영 DB에 없다(위 1-2 참조).
- [ ] 첫 관리자가 지정돼 있다.
- [ ] `pg_cron`의 `match-worker`가 활성 상태로 매분 실행 중이다.
- [ ] 커스텀 SMTP가 연결돼 있어 실제 메일이 발송된다.
- [ ] `NEXT_PUBLIC_SITE_URL`이 실제 배포 도메인과 일치한다(불일치 시 매직링크 로그인이
      "허용되지 않은 origin"으로 막힐 수 있습니다 — `src/lib/url.ts`).
- [ ] Auth Rate Limits·jwt_expiry가 운영에 맞게 설정돼 있다.

## 알려진 제한

`PROGRESS.md`의 "알려진 제한 / 다음 단계로 미룬 것"과 `docs/operations.md`의 "알려진 제한"(운영
관점) 참조.
