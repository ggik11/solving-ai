# PROGRESS

## 현재 상태 (2026-10-03 기준)

- **완료:** 1단계(설계) + 설계 수정 3건, 2-A(뼈대+DB), 2-B(화면: 로그인/온보딩/활동 탐색·상세/관리자 CRUD·CSV 가져오기)
- **미착수:** 3단계(추천·파티), 4단계(매칭 워커·채팅), 5단계(운영·검증)
- 실행 방법·테스트 계정·접속 주소는 `README.md` 참조. 설계 배경은 `docs/architecture.md` 참조.

## 2-B 산출물

- **인증:** `/login`(이메일 매직링크, 비밀번호 없음) → `/auth/confirm`(token_hash 교환, 서버 세션 쿠키) → 온보딩 완료 여부로 분기. 개발용 인증 우회 없음.
- **온보딩/프로필:** `/onboarding`(닉네임만 필수, 나머지 8단계는 건너뛰기 가능) / `/me/edit`(같은 폼, 단일 페이지). 지시서 4장 전 항목(소속·복수전공, 관심분야, 희망 활동, 역할, 참여조건, 가능한 시간, 선택정보, 공개설정) 반영.
- **활동 탐색/상세:** `/activities`(키워드·유형·모집상태·진행방식·팀참여·지역 필터 — 순수 GET 폼이라 URL에 자동 반영, 페이지네이션 10건) / `/activities/[id]`(자격·KST 일정·원문 링크·"원문 확인 필요"/데모 배지, 추천·파티 섹션은 3~4단계 자리만 확보).
- **관리자:** `/admin`(user_roles 기반 접근 제어, 비관리자는 403 컴포넌트) / `/admin/activities`(공개·비공개·마감 전환) / `/admin/activities/new`,`/[id]/edit` / `/admin/activities/import`(CSV 업로드 → 행별 오류·중복 미리보기 → 선택 확인 후 비공개로 일괄 등록).
- **공통 UI:** 하단 탭(홈/활동/파티/채팅/마이), 파티·채팅은 "준비 중" 빈 상태, 로딩/빈 상태/오류+재시도/권한없음 공통 컴포넌트(`src/components/states.tsx`), 차분한 블루 톤(학교 상징색과 별개로 직접 정의).
- **스키마 보완(2-A 이후 발견분):** `activity_types`+`profile_preferred_activity_types`(희망 활동), `activities`에 `summary/eligibility/participation_mode/team_min_size/team_max_size/benefit/last_verified_at` 추가, `profiles`에 `academic_status/preferred_location_type/preferred_region/weekly_available_hours/experience/matching_opt_in/notifications_enabled` 추가 + 닉네임 유니크 인덱스. 마이그레이션 `20261003130100`, `20261003130200`.
- **party_members 상호 조회 재귀 버그 수정(요청 사항):** `public.is_party_member(party_id)` SECURITY DEFINER 헬퍼 추가(마이그레이션 `20261003130000`) — 함수가 테이블 소유자 권한으로 내부 조회를 수행해 RLS를 다시 평가하지 않으므로 재귀가 끊긴다. `party_members`/`chat_rooms`/`chat_messages`/`chat_read_states` 정책을 이 헬퍼로 재작성. `tests/rls/cross_user.test.ts`에 "같은 파티원은 서로 조회 가능, 다른 파티원은 불가" 케이스 추가, 통과.

## 실제 실행한 검증과 결과

| 명령 | 결과 |
|---|---|
| `npx supabase db reset` | 성공, 오류 없음 (마이그레이션 11개 전체 적용 + 시드) |
| `npm run lint` | 성공, 0 problems |
| `npm run typecheck` (`next typegen && tsc --noEmit`) | 성공 |
| `npm test` (Vitest: 단위 15건 + RLS 18건) | **33/33 통과** |
| `npm run build` | 성공 |
| `npx playwright test` (E2E 3건) | **3/3 통과** — 아래 "발견·수정한 버그" 참조 |
| 360px/1440px 스크린샷 확인 (홈/활동탐색/활동상세/로그인) | 가로 스크롤 없음, 필터·카드·폼이 레이아웃 깨짐 없이 축소·중앙정렬됨 |

## 2-B 작업 중 발견하고 고친 버그 (실제 영향이 있던 것들)

1. **매직링크 로그인이 실제로는 깨져 있었음 (가장 중요).** `/auth/confirm`에서 리다이렉트 URL을 `new URL(request.url).origin`으로 만들었는데, Next 개발 서버가 실제 접속 호스트(`127.0.0.1:3000`)와 무관하게 `request.url`을 `localhost:3000` 기준으로 보고하는 경우가 있었다. 그 결과 세션 쿠키는 `127.0.0.1`에 설정되고 리다이렉트는 `localhost`로 가서, 쿠키가 전달되지 않아 로그인 직후 다시 로그아웃 상태로 보였다. 실제 브라우저에서도 재현되는 버그였다 — curl로 쿠키 흐름을 직접 추적해서 찾았다. **수정:** 요청의 `Host` 헤더를 그대로 써서 같은 호스트로만 리다이렉트하도록 변경.
2. **`party_members` 자기 참조 RLS 정책이 무한 재귀 오류(42P17)를 냄.** 2-A에서 발견해 "본인/파티장만" 허용으로 축소해뒀던 것을, 이번에 `is_party_member()` SECURITY DEFINER 헬퍼로 제대로 해결(위 항목 참조).
3. **(해결됨, 2026-10-03 재확인) `next dev`가 127.0.0.1 등 비-localhost 호스트의 `_next/*` 자산 요청을 403으로 막아 클라이언트 번들이 부트스트랩되지 않고 하이드레이션이 전혀 일어나지 않았다** — 로그인 폼 버튼을 눌러도 아무 반응이 없고(이벤트 핸들러가 안 붙어 있어 네이티브 GET 폼 제출만 발생), 이로 인해 Playwright E2E가 전부 실패했었다. 처음엔 HMR 웹소켓 핸드셰이크 실패로 오진했었다. **수정:** `next.config.ts`에 `allowedDevOrigins: ["127.0.0.1", "localhost"]` 추가. **검증:** `npm run dev`로 띄운 서버에서 `_next/static` 청크가 127.0.0.1 Origin으로 200 응답하는 것을 확인했고, `tests/e2e/auth-onboarding.spec.ts`를 그 dev 서버에 대해 직접 실행해 통과(로그인 폼 상호작용이 정상 동작)시켰다. README를 dev 서버 기준 사용법으로 되돌렸다. Playwright E2E는 배포 산출물 검증을 위해 계속 `build && start`를 대상으로 한다(dev 제약 회피 목적 아님).
4. **`.claude/` 상태줄 훅이 `npx @claude-flow/cli hooks statusline --json` 프로세스를 정리하지 않고 계속 쌓음.** 디버깅 중 node 프로세스 46개가 좀비로 남아있는 것을 발견(이 프로젝트와 무관한 Ruflo 툴링 문제). 정리했고, Claude Code에 피드백으로 남겨뒀다(제품 이슈이며 이 저장소 코드와는 무관).
5. (2-A에서 이미 기록) 시드 스크립트의 활동 선택 쿼리 동점 문제, 마이그레이션 함수 정의 순서 — 둘 다 2-A 때 수정 완료.

## 알려진 제한 / 다음 단계로 미룬 것

1. **추천 계산 없음.** 홈/활동상세의 "맞춤 추천" 영역은 3단계 전까지 고정 안내 문구만 표시한다.
2. **파티·채팅 기능 없음.** `/parties`, `/chat`, 활동 상세의 "관련 파티·빠른 매칭" 모두 빈 상태만 표시한다(3~4단계 범위). 수동 파티 생성/지원/승인, 빠른 매칭 대기열 UI 없음 — DB 스키마와 RLS, 채팅방 자동 생성 트리거는 2-A에서 이미 구현됨.
3. **매칭 확정 워커 없음** (2-A와 동일 — 아직 4단계 범위).
4. **파티 공동 멤버 간 상호 조회는 이번에 해결했지만, "채팅 참가자 목록" 같은 파생 조회 UI는 아직 없다**(화면 자체가 없으므로).
5. **CSV 가져오기는 `activity_type` 이름 정확히 일치만 연결**하고 fuzzy 매칭은 하지 않는다. 운영자가 이름을 맞추거나 가져온 뒤 수정 화면에서 보정해야 한다.
6. **프로필 "다른 사용자에게 공개" 범위가 좁다.** `profile_majors`/`profile_interests`/`profile_skills`/`availability_slots`는 RLS상 본인·운영자만 조회 가능 — 추천 계산(3단계, 서버 함수)에는 문제없지만, "팀원 프로필 보기" 같은 화면이 생기면 RLS 정책을 넓히거나 전용 뷰/함수가 필요하다.
7. **npm 취약점 1건(개발 의존성, high)** — `eslint-config-next`가 의존하는 `fast-glob`→`micromatch`→`braces`(GHSA-vfj7-8cjw-p6xm). `npm audit fix --force`는 Next 16과 불호환되는 `eslint-config-next@14.2.35`로 내려가므로 적용하지 않음. 런타임/배포 번들에는 포함되지 않는 린트 전용 devDependency.
8. **상명대 이메일 도메인/전공 전체 목록/에브리타임 공식 연동 미확인** — 1단계 기록 그대로. `app_settings.allowed_email_domains`와 `majors` 테이블이 운영자 편집 가능하므로 값만 갱신하면 된다.

## 다음 명령 (사용자 승인 시)

3단계(핵심): 추천 함수(가중치 설정 기반, 단위 테스트 포함), 북마크 UI, 파티 생성·지원·승인·탈퇴·팀장 위임 화면, 서버 측 권한·정원·중복가입 검증. 완료 기준은 `docs/architecture.md` 10장 참조.
