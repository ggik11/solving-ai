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
npm run dev     # 개발 서버 (Turbopack)
npm run build && npm run start   # 프로덕션 빌드로 실행
```

http://127.0.0.1:3000 에서 접속합니다.

> **참고:** 이 환경(샌드박스)에서는 `next dev`의 HMR 웹소켓 핸드셰이크가 실패해 클라이언트
> 하이드레이션이 되지 않는 문제가 있었습니다. 로그인 폼처럼 자바스크립트 상호작용이 필요한
> 화면이 반응하지 않으면 `npm run build && npm run start`(프로덕션 모드, HMR 없음)로
> 실행해 보세요. Playwright E2E 테스트도 이 때문에 프로덕션 빌드를 대상으로 합니다
> (`playwright.config.ts` 참고). 다른 환경(일반 로컬 PC)에서는 `npm run dev`가 정상 동작할
> 가능성이 높습니다.

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

## 화면 지도 (2-B 기준)

| 경로 | 설명 |
|---|---|
| `/` | 홈 — 마감임박 활동, 맞춤추천/파티·매칭은 "준비 중" |
| `/activities` | 활동 탐색 — 키워드·유형·모집상태·진행방식·팀참여·지역 필터, URL에 반영, 페이지네이션 |
| `/activities/[id]` | 활동 상세 — 자격, KST 일정, 원문 링크, "원문 확인 필요"/데모 배지 |
| `/login` → Mailpit → `/auth/confirm` | 매직링크 로그인 |
| `/onboarding` | 첫 로그인 시 프로필 온보딩 (닉네임만 필수, 나머지는 건너뛰기 가능) |
| `/me`, `/me/edit` | 마이 페이지, 프로필 수정 |
| `/parties`, `/chat` | "준비 중" 빈 상태 (3~4단계 범위) |
| `/admin` | 관리자 홈 (user_roles 기반 접근 제어, 일반 사용자는 403) |
| `/admin/activities` | 활동 목록, 공개/비공개/마감 전환 |
| `/admin/activities/new`, `/admin/activities/[id]/edit` | 활동 등록/수정 |
| `/admin/activities/import` | CSV 가져오기 — 행별 오류/중복 미리보기 → 선택 등록(비공개로 생성) |

## 테스트

```bash
npm run lint
npm run typecheck
npm test            # 단위 테스트 + RLS 테스트 (로컬 Supabase가 떠 있어야 함)
npm run test:rls     # RLS 테스트만
npm run test:e2e     # Playwright E2E (내부적으로 build && start 실행)
```

RLS 테스트는 `.env.local`의 `SUPABASE_SERVICE_ROLE_KEY`가 필요합니다.

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

## 알려진 제한

`PROGRESS.md`의 "알려진 제한 / 다음 단계로 미룬 것" 참조.
