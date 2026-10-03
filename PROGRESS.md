# PROGRESS

## 완료 범위

- **1단계(설계) 완료 + 설계 수정 반영 + 2-A단계(뼈대+DB) 완료.** 2-B(UI 화면)는 아직 착수하지 않았다. 3~5단계(핵심/매칭·소통/운영·검증)도 아직이다.
- 1단계 승인 후 사용자 피드백에 따라 `docs/architecture.md`를 3건 수정(채팅방 생성 시점, 매칭 팀 통합, 엔티티 보완) — 문서 끝 변경 이력 참조.
- 2-A 산출물:
  - Next.js 16.3.8 + TypeScript + Tailwind CSS 4 프로젝트 (`src/app`), ESLint(`eslint.config.mjs`), Vitest(`vitest.config.ts`), Playwright(`playwright.config.ts`)
  - `supabase/migrations/` 8개 파일: 지시서 24개 엔티티 + `majors`/`app_settings`/`user_roles`/`profile_majors`(복수전공 브릿지) = 28개 테이블, FK/UNIQUE/CHECK/인덱스, 데이터 정합성 트리거(역할 슬롯 정원, 활동당 확정 팀 1개, 파티 생성 시 채팅방 자동 생성), 모든 테이블 RLS
  - `supabase/seed.sql`: 테스트 계정 5명(운영자 1 + 학생 4, 서로 다른 역할·가능 시간), 전공/관심사/기술 참조 데이터, 활동 22개(상대 날짜로 모집중/마감임박/접수예정/마감 혼합), 수동 파티 2건(모집중 1 + 확정 1) + 빠른 매칭 확정 1건(채팅방·메시지 포함), 알림/차단/신고 샘플
  - `tests/rls/`: Vitest 기반 RLS 자동 테스트 17건 (비로그인/다른 사용자/일반 사용자의 관리자 권한 쓰기 시도 + DB 핵심 불변식)
  - `.env.example`, `.gitignore`(Next.js/Supabase/Ruflo 항목 병합)
- 활동 CRUD·탐색/상세, 로그인 UI 등 **화면은 아직 만들지 않았다**(2-B 범위, 지시서 7장 A 참조). DB·RLS만 구현됨.
- 매칭 제안을 `matched`로 전환하는 실제 워커/함수는 아직 없다(4단계 범위). 시드는 그 결과물(확정된 `parties`+`chat_rooms`)을 직접 구성해 스키마가 요구를 충족하는지만 검증했다.

## 실제 실행한 검증과 결과 (2026-10-03)

### 환경 점검
| 명령 | 결과 |
|---|---|
| `docker -v` | 성공 — Docker version 29.8.1, build 4a63305 (1단계 때는 미설치였으나 이번에 설치되어 있음을 확인) |
| `docker info` | 성공 — 데몬 정상 동작 확인 |
| `npx supabase start` | **성공.** 최초 1회는 이미지 다운로드 중 `is_admin()`이 `user_roles` 생성 전에 정의되어 `MigrationApplyError`로 실패 → 마이그레이션 순서 수정 후 재시도 성공. 그 다음엔 시드 내 활동 선택 쿼리가 동점(tie) 때문에 같은 활동을 두 번 골라 `party_members_one_confirmed_per_activity` 유니크 위반 → `order by id`로 수정 후 성공 |
| `npx supabase db reset` (완료 기준 명령) | **성공, 오류 없음.** 마이그레이션 8개 전부 적용 + 시드 적용 완료 |
| `npm run lint` | **성공.** 최초 실행 시 `.claude/helpers/*.cjs` 등 Ruflo 툴링 파일이 걸려 87개 문제(30 error) 발생 → `eslint.config.mjs`에 `.claude/**`,`.claude-flow/**`,`.swarm/**` 무시 추가 후 0 problems |
| `npm run typecheck` (`next typegen && tsc --noEmit`) | **성공.** 최초 실행 시 `LayoutProps<"/">` 미해석 에러(Next 16 타입드 라우트는 `.next/types` 생성이 선행되어야 함) → `next typegen`을 typecheck 스크립트에 포함해 해결 |
| `npm run test:rls` (Vitest, 17 tests / 4 files) | **17/17 통과.** 중간에 발견/수정한 버그 2건: (1) `party_members` SELECT 정책이 자기 테이블을 다시 조회해 `infinite recursion detected in policy`(42P17) 발생 → 공동 멤버 상호 조회 분기 제거(본인/파티장/운영자만으로 축소, 아래 "알려진 제한" 참조) (2) 같은 이메일로 매직링크를 병렬 생성하면 `auth.rate_limit`의 `max_frequency=1s`에 걸려 토큰이 재사용되어 `Email link is invalid or expired` 발생 → `vitest.config.ts`에 `fileParallelism: false` 적용 |
| `npm run build` (추가 확인, 완료 기준 외) | 성공 — `next build`로 정적 페이지 생성까지 확인 |

### RLS 테스트 시나리오 (`tests/rls/*.test.ts`, 총 17건)
- `anon.test.ts` (5): 비로그인 — 공개 활동 조회 가능 / draft·closed 비공개 / 활동 등록 쓰기 거부 / 비공개 설정 프로필 조회 거부 / 알림·채팅 전체 거부
- `cross_user.test.ts` (4): 다른 사용자 — 타인 프로필 수정 거부 / 타인 알림 조회 거부 / 미가입 파티의 채팅방·메시지 조회 거부 / **파티 활성 멤버는 `confirmed` 여부와 무관하게 채팅 접근 가능**(설계 수정 #1 검증)
- `admin_write.test.ts` (5): 일반 사용자의 관리자 권한 쓰기 시도 — 활동 등록 거부 / `user_roles` 자기 승격 거부 / `app_settings` 수정 거부 / `majors` 추가 거부 / (양성 대조) 운영자 계정은 동일 작업 성공
- `invariants.test.ts` (3, RLS 외 DB 제약): 역할 슬롯 정원 초과 삽입 거부 / 활동당 두 번째 확정 팀 생성 시 유니크 위반 / 파티 생성 시 `chat_rooms` 정확히 1개 자동 생성

## 설계 변경 반영 확인
- **채팅방 생성 시점**: seed의 `recruiting` 상태 수동 파티도 `chat_rooms`가 즉시 1개 생성됨을 DB에서 직접 확인(`chat_rooms` 3건 = `parties` 3건과 1:1). `cross_user.test.ts`의 네 번째 테스트로 "승인된 멤버는 confirmed 이전에도 채팅 가능"을 자동 검증.
- **매칭 팀 통합**: seed에서 매칭 확정 결과를 `parties(source='matching', status='confirmed')` + `party_role_slots` + `party_members`로 직접 구성해 수동 파티와 동일한 테이블·제약(활동당 확정 팀 1개 유니크 인덱스, chat_rooms 트리거)을 그대로 통과하는지 확인했다.
- **엔티티 보완**: `majors`(`is_demo` 플래그 포함), `app_settings`(허용 이메일 도메인/추천 가중치/매칭 수락 기한 시드 포함), `user_roles`, `notifications.dedupe_key` 모두 마이그레이션에 포함하고 시드로 값 삽입까지 확인.

## 알려진 제한 / 다음 단계로 미룬 것
1. **파티 공동 멤버 간 상호 조회 제한.** `party_members` SELECT RLS에서 "같은 파티의 다른 멤버가 서로를 보는" 분기를 넣으면 같은 테이블을 재귀 참조해 Postgres가 `infinite recursion detected in policy`로 거부한다. 지금은 본인/파티장/운영자만 `party_members` 행을 직접 조회할 수 있다. 채팅 UI에 필요한 "멤버 목록 보기"는 3~4단계에서 별도 SQL 함수(`security definer` RPC)나 뷰로 구현해야 한다.
2. **매칭 확정 워커 없음.** `match_proposals.status`를 `matched`로 전환하고 `parties`/`chat_rooms`를 실제로 생성하는 로직(4단계 "실제 스케줄 워커")은 아직 구현하지 않았다. 시드는 그 결과 상태만 직접 삽입해 스키마를 검증했다.
3. **npm 취약점 1건(개발 의존성, 심각도 상).** `eslint-config-next`가 의존하는 `fast-glob`→`micromatch`→`braces`(GHSA-vfj7-8cjw-p6xm, 깊은 중첩 글롭 패턴으로 인한 스택 고갈 DoS)가 `npm audit`에서 high로 표시된다. `npm audit fix --force`는 `eslint-config-next`를 14.2.35로 다운그레이드해 Next 16.3.8과 불호환되므로 적용하지 않았다. 린트 전용 devDependency이며 런타임/배포 번들에는 포함되지 않는다. 업스트림이 Next 16 호환 버전을 내면 갱신 필요.
4. **상명대 이메일 도메인/전공 전체 목록/에브리타임 공식 연동 미확인** — 1단계에서 기록한 그대로 미해결. `app_settings.allowed_email_domains`와 `majors` 테이블을 운영자가 편집 가능한 구조로 만들어 뒀으므로, 공식 확인되는 즉시 코드 변경 없이 값만 갱신하면 된다.

## 다음 명령 (사용자 승인 시)
2-B(UI 화면): 로그인(이메일 매직링크/OTP) 페이지, 온보딩 폼, 활동 탐색/상세, 운영자 CRUD·CSV 가져오기 화면 구현. 완료 기준은 `docs/architecture.md` 3장(화면 흐름)·10장(2단계 완료 기준) 참조.
