# PROGRESS

## 현재 상태 (2026-10-03 기준)

- **완료:** 1단계(설계) + 설계 수정 3건, 2-A(뼈대+DB), 2-B(화면: 로그인/온보딩/활동 탐색·상세/관리자 CRUD·CSV 가져오기), 3단계(추천·북마크·파티), 3단계 보완(역할 슬롯/활동당 가입 규칙/파티 정보 수정), 4-A(팀 채팅 + 앱 내 알림)
- **진행 중:** 4-B(빠른 매칭 워커) — 이번 4-A 작업에서는 건드리지 않음
- **미착수:** 5단계(운영·검증)
- 실행 방법·테스트 계정·접속 주소는 `README.md` 참조. 설계 배경은 `docs/architecture.md` 참조.

## 3단계 진행 상황

- **추천 계산 (커밋 `d9d60be`):** `src/lib/recommend.ts`에 architecture.md 7장 가중치 공식을 순수 함수로 구현(`app_settings.recommendation_weights` 사용). 비교 불가 항목은 "미상"으로 제외 후 재정규화하며, `duration_time_fit`은 활동에 비교 가능한 필드(주당 필요 시간 등)가 아직 없어 항상 미상 처리한다(아래 "알려진 제한" 참조). 유효 가중치 합이 임계값 미만이면 탐색(디스커버리) 카드로 전환하고 활동 유형별로 섞어 노출한다. 단위 테스트 9건(`tests/unit/recommend.test.ts`) 통과. 홈 "맞춤 추천"·활동 상세 "추천 근거" 플레이스홀더를 실제 값으로 교체했고, "숨기기"/"관심 없음"은 새 테이블 `activity_feedback`(RLS: 본인만)에 영구 저장된다.
- **북마크 (커밋 `8cae5c0`):** `bookmarks` 테이블은 2-A부터 있었으나 화면이 없었다. 활동 상세에 낙관적 업데이트 토글 버튼을 추가하고(`src/components/BookmarkButton.tsx` + 서버 액션 `toggleBookmark`), `/me`에 최근 북마크 5건을 표시한다.
- **파티 DB 함수 (커밋 `8927f05`, 마이그레이션 `20261003140100`):** 생성/지원/취소/승인/거절/탈퇴/위임/해산/확정/재모집 10개를 SECURITY DEFINER 함수로 구현. `approve_application`은 `parties` 행을 `FOR UPDATE`로 잠가 마지막 자리 동시 승인을 직렬화하고, `confirm_party`는 멤버별로 `is_confirmed` 갱신을 시도해 `party_members_one_confirmed_per_activity` 유니크 위반(동일 활동 다른 파티에 이미 확정됨)을 개별적으로 잡아 그 멤버만 자동 제외(`removed`)한 뒤 승자의 다른 대기 지원을 `superseded`로 정리한다(둘 다 에러로 중단되지 않고 완료됨). `leave_party`는 팀장이 다른 멤버가 있으면 위임 없이 탈퇴를 거부한다. `app_settings.party_rate_limits`로 생성/지원 빈도를 제한하고, 모든 이벤트에서 `notifications`를 `dedupe_key` upsert로 적재한다. `parties`/`party_members`/`party_applications`의 INSERT/UPDATE RLS를 운영자 전용으로 좁혀 일반 사용자는 반드시 이 함수들을 거치도록 강제했다. 통합 테스트(`tests/rls/party_lifecycle.test.ts`, 실제 로그인 클라이언트 + `Promise.all` 동시 호출) 4건 통과 — 아래 "실제 실행한 검증과 결과" 참조.
- **파티 화면 (커밋 `01d1c7c`):** `/parties`(내가 만든 파티 / 참여 중인 파티 / 지원 중), `/parties/new?activity=<id>`(생성 폼), `/parties/[id]`(멤버 목록, 팀장이면 지원 승인·거절, 상태·역할별 액션 패널: 지원하기/지원 취소/탈퇴/팀 확정/재모집/팀장 위임/해산). 활동 상세의 "관련 파티" 플레이스홀더를 실제 목록 + 만들기 링크로 교체했다. DB 함수 에러 메시지('CODE: 설명')에서 설명만 사용자에게 노출한다. E2E(`tests/e2e/party-flow.spec.ts`)로 student1 파티 생성 → student2 지원 → student1 승인 → 양쪽 `/parties` 반영을 실제 프로덕션 빌드 대상으로 검증했다. Playwright가 `.env.local`을 읽지 못하던 문제(vitest는 Vite가 자동 주입하지만 Playwright는 아님)를 `playwright.config.ts`에 `dotenv` 로딩을 추가해 고쳤다.

## 3단계 보완 (역할 슬롯 / 활동당 가입 규칙 / 파티 정보 수정)

3단계 완료 시점의 "알려진 제한" 2·3·4번(아래 참조)으로 남겨뒀던 범위를 마저 구현했다.

- **역할 슬롯 필수화(커밋 `6764f17`, `1be437d`, 마이그레이션 `20261003150000`):** `create_party`가 `p_role_slots`(역할명+인원 배열)와 `p_leader_role_name`을 받아 `party_role_slots`를 실제로 채운다. 팀장도 역할 하나를 차지하고, 역할별 인원의 합이 파티 전체 정원이 된다(기존 `p_capacity` 파라미터는 제거). `apply_to_party`는 `p_role_slot_id`를 필수로 받고, 이미 정원이 찬 역할은 (지원 시점 기준으로) 거부한다. `approve_application`은 지원서에 저장된 `role_slot_id`로 `party_role_slots` 행을 잠그고 그 역할의 실제 정원을 재검사한 뒤 멤버를 추가한다. `party_role_slots`의 INSERT/UPDATE/DELETE RLS도 운영자 전용으로 좁혀, 일반 사용자가 직접 테이블을 써서 이 검증을 우회할 수 없게 했다. 화면 쪽은 파티 생성 폼에 역할 입력 행(추가/삭제) + 팀장 역할 선택을 추가했고, 지원 화면은 빈 슬롯이 있는 역할만 고를 수 있게 제한했다. 파티 목록·상세에 "역할명 N/M · 역할명 N/M" 형식의 현황과(`formatRoleSlotSummary`), 모집 중일 때 부족한 역할 목록을 표시한다.
- **활동당 가입 규칙 변경(같은 마이그레이션):** 부분 UNIQUE 인덱스를 `WHERE is_confirmed = true`에서 `WHERE status = 'active'`로 바꿔, "같은 활동에서는 활성 멤버(승인된 멤버)가 한 파티에만 있을 수 있다"는 제약을 확정(confirm) 시점이 아니라 **승인(approve_application) 시점**에 강제하도록 앞당겼다. 승인되는 즉시 같은 활동의 다른 `pending` 지원은 자동으로 `superseded` 처리되고, 지원자가 이미 다른 파티의 활성 멤버라면 승인 자체가 `ALREADY_ACTIVE_IN_ACTIVITY`로 거부된다. 이 제약이 승인 시점에 이미 보장되므로 `confirm_party`는 더 이상 "동일 활동 다른 파티에 이미 확정됨" 충돌을 처리할 필요가 없어졌고, 기존의 멤버 자동 제외(`removed`) + `jsonb` 반환 로직을 제거해 단순화했다(반환 타입 `jsonb` → `void`). **동시성 설계:** 두 팀장이 같은 지원자를 동시에 승인하는 경쟁에서 서로 다른 행(지원서 A, 지원서 B)을 잠근 두 트랜잭션이 서로를 기다리며 교착하지 않도록, `lock_activity_membership(activity_id, profile_id)` advisory lock을 그 어떤 `FOR UPDATE` 행 잠금보다도 먼저 건다(`create_party`/`approve_application` 공통). `docs/architecture.md` 4장 핵심 불변식 1, 5.2절을 이 설계에 맞게 갱신했다.
- **파티 정보 수정(같은 마이그레이션 + 커밋 `1be437d`):** `update_party_details()` DB 함수(팀장 또는 운영자만, 종료된 파티는 거부)와 `/parties/[id]/edit` 화면을 추가했다. 제목(목표)·소개·모임 방식·모집 마감·공통 시간(자유 형식 텍스트 → `{"note": text}` jsonb)을 수정할 수 있고, 역할별 정원도 함께 조정할 수 있다(단, **현재 그 역할의 인원(`filled_count`)보다 적게 줄이는 것은 거부**). 전체 정원(`parties.capacity`)은 역할별 정원의 합으로 자동 재계산되며, 늘려서 `full` 상태였던 파티가 다시 `recruiting`으로 바뀌는 경우도 처리한다. **의도적으로 범위에서 뺀 것:** 역할 자체의 추가/삭제나 역할 이름 변경은 이번 수정 화면에 포함하지 않았다(기존 역할의 인원 조정만 지원) — 요청 범위("역할별 정원 조정" 뉘앙스)를 벗어나는 추가 복잡도(역할 삭제 시 이미 배정된 멤버 처리 등)를 피하기 위한 선택이며, 필요해지면 별도 작업으로 확장한다.
- **검증:** `tests/rls/party_lifecycle.test.ts`를 새 함수 시그니처·시나리오로 다시 작성했다(7건) — 같은 역할 마지막 슬롯 동시 승인 2건 중 1명만 성공, 같은 활동 두 파티 동시 승인 시 한 곳만 성공하고 나머지 지원은 `superseded`, 정원이 찬 역할 지원 거부, 팀장이 아닌 사용자의 승인·위임·수정 거부, 탈퇴 시 멤버십 즉시 상실, 역할 정원 축소/확대 규칙. `tests/rls/invariants.test.ts`의 기존 유니크 제약 테스트는 그대로 통과한다(활성 멤버 기준으로 바뀌어도 테스트가 쓰는 기본 `status='active'` 멤버에는 동일하게 적용되므로). E2E(`tests/e2e/party-flow.spec.ts`)를 역할 선택 포함 흐름으로 갱신했다. `/parties`, `/parties/new`, `/parties/[id]`, `/parties/[id]/edit`를 360px/1440px로 스크린샷 확인 — 가로 스크롤 없음, 역할 현황·부족한 역할 표시가 레이아웃 깨짐 없이 보임.

## 4-A단계 진행 상황 (팀 채팅 + 앱 내 알림)

빠른 매칭(4-B)은 이번 범위에서 건드리지 않았다. 설계 배경·근거는 `docs/architecture.md` 11장 참조.

- **채팅 DB·권한 (커밋 `2c33cfc`, 마이그레이션 `20261003160000`, `20261003161000`):** `send_chat_message`/`mark_chat_read`/`list_my_chat_rooms`/`mark_notification_read`/`mark_all_notifications_read` SECURITY DEFINER 함수를 추가하고, `chat_messages`/`chat_read_states`/`notifications`의 INSERT·UPDATE RLS를 운영자 전용으로 좁혀 일반 사용자는 반드시 이 함수들을 거치게 했다(기존 파티 함수와 동일한 패턴). 메시지는 `client_message_id` 기준으로 멱등 재시도되고(동시 재시도 3건을 보내도 1건만 저장 — `tests/rls/chat.test.ts`), 분당 전송 횟수를 `app_settings.chat_rate_limits`로 제한한다. 지원 승인/탈퇴/팀장 위임/팀 확정 시 기존 파티 함수(`approve_application`/`leave_party`/`delegate_leader`/`confirm_party`)가 시스템 메시지를 자동으로 남긴다. **Realtime은 처음 계획했던 "postgres_changes + private 채널"이 아니라 Broadcast-from-Database로 구현했다** — 로컬 스택에서 두 브라우저로 직접 검증하다가 `private` 채널 옵션이 Postgres Changes에는 적용되지 않는다는 사실(공식 문서)을 발견해 설계를 바꿨다. 상세 이유와 메커니즘은 `docs/architecture.md` 11.2절 참조.
- **채팅 화면 (커밋 예정, 이 커밋):** `/chat`(내 채팅방 목록 — 파티 제목, 마지막 메시지 미리보기, 안 읽은 수 배지), `/chat/[roomId]`(메시지 목록 + 역할 포함 멤버 목록 + "팀을 나가도 과거 내역은 남는다" 안내). 하단 탭 "채팅"의 "준비 중" 빈 상태를 실제 화면으로 교체했고, 하단 탭에 안 읽은 메시지 수 배지를 추가했다(`src/lib/nav-badges.ts`가 루트 레이아웃에서 집계해 `BottomNav`에 내려준다). 메시지는 전송 중/실패/재시도 상태를 보여주고(`src/app/chat/[roomId]/ChatRoomClient.tsx`), 과거 내역은 커서 기반("이전 메시지 더 보기")으로 불러온다. 메시지 본문은 항상 일반 텍스트로 렌더링하고(`dangerouslySetInnerHTML` 미사용) `http(s)://` 링크만 클릭 가능하게 바꾼다(`src/lib/chat.ts`의 `splitMessageSegments`, 단위 테스트 포함). 채팅방이 (재)연결될 때마다 마지막으로 받은 메시지 이후를 따라잡는 보강 로직을 포함한다(Broadcast는 과거 이벤트를 재생하지 않으므로).
- **탈퇴/강퇴 접근 차단:** DB/RLS 레벨에서 조회·전송·Realtime 수신이 모두 막히고(`tests/rls/chat.test.ts`), 이미 열려 있던 연결은 15초 주기 하트비트가 멤버십을 재확인해 `NOT_A_MEMBER`를 받으면 클라이언트가 스스로 구독을 끊는다. 상세는 `docs/architecture.md` 11.4절.
- **검증:** 통합 테스트(`tests/rls/chat.test.ts`, 6건) — 승인 즉시 조회/전송 가능 + 합류 시스템 메시지, 다른 팀 멤버의 조회/전송 거부(직접 테이블 INSERT 우회 시도 포함), 탈퇴 직후 조회/전송/읽음처리 거부, 동시 재전송 시 1건만 저장, 빈 메시지·길이 초과 거부, 팀장 위임·팀 확정 시스템 메시지. E2E(`tests/e2e/chat-flow.spec.ts`, 독립 브라우저 컨텍스트 2개) — student1↔student2 실시간 송수신 → 새로고침 후 내역 복구 → 안 읽은 수 증가/소멸 → student2 탈퇴 후 메시지 미수신(재방문 시 접근 거부로 확인). `/chat`, `/chat/[roomId]`를 360px/1440px로 스크린샷 확인 — 가로 스크롤 없음, 링크 렌더링·배지·멤버 요약이 레이아웃 깨짐 없이 표시됨.

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
| `npx supabase db reset` | 성공, 오류 없음 (마이그레이션 14개 전체 적용 + 시드, 3단계 보완 마이그레이션 `20261003150000` 포함) |
| `npm run lint` | 성공, 0 problems |
| `npm run typecheck` (`next typegen && tsc --noEmit`) | 성공 |
| `npm test` (Vitest: 단위 24건 + RLS/통합 38건) | **62/62 통과** (역할 슬롯·활동당 활성 멤버 1파티 동시성 테스트 7건 포함 — `tests/rls/party_lifecycle.test.ts`) |
| `npm run build` | 성공 (`/parties/[id]/edit` 라우트 포함 17개 라우트 생성) |
| `npx playwright test` (E2E, 프로덕션 빌드 대상, 4건) | **4/4 통과** — student1 역할 2개로 파티 생성(기획/개발)→student2가 개발 역할로 지원→승인 플로우 포함 |
| 360px/1440px 스크린샷 확인 (홈/활동탐색/활동상세/로그인) | 가로 스크롤 없음, 필터·카드·폼이 레이아웃 깨짐 없이 축소·중앙정렬됨 |
| 360px/1440px 스크린샷 확인 (`/parties`, `/parties/new`, `/parties/[id]`, `/parties/[id]/edit` — 3단계 보완) | 가로 스크롤 없음, 역할별 인원 입력 행·역할 현황("개발 0/2 · 기획 1/1 · 디자인 0/1")·부족한 역할 안내·정보 수정 폼이 두 뷰포트 모두에서 레이아웃 깨짐 없이 표시됨 |

## 2-B 작업 중 발견하고 고친 버그 (실제 영향이 있던 것들)

1. **매직링크 로그인이 실제로는 깨져 있었음 (가장 중요).** `/auth/confirm`에서 리다이렉트 URL을 `new URL(request.url).origin`으로 만들었는데, Next 개발 서버가 실제 접속 호스트(`127.0.0.1:3000`)와 무관하게 `request.url`을 `localhost:3000` 기준으로 보고하는 경우가 있었다. 그 결과 세션 쿠키는 `127.0.0.1`에 설정되고 리다이렉트는 `localhost`로 가서, 쿠키가 전달되지 않아 로그인 직후 다시 로그아웃 상태로 보였다. 실제 브라우저에서도 재현되는 버그였다 — curl로 쿠키 흐름을 직접 추적해서 찾았다. **수정(현재 코드 기준):** 요청의 `Host` 헤더는 클라이언트가 보내는 값이라 조작 가능해(Host 헤더 포이즈닝 → 오픈 리다이렉트) 신뢰하지 않는다. 대신 `NEXT_PUBLIC_SITE_URL`(+ 선택적 `..._ALIASES`)로 만든 허용 목록(`src/lib/url.ts`의 `resolveAllowedOrigins`/`pickRequestOrigin`)에서만 리다이렉트 origin을 고르고, `next` 파라미터도 같은 사이트 내 상대경로일 때만 허용한다(`src/app/auth/confirm/route.ts`). 이 문서는 한동안 "Host 헤더를 그대로 쓰는 1차 수정"으로만 기록돼 있었는데, 실제로는 더 나아가 허용 목록 방식으로 교체된 상태였다 — 문서를 코드에 맞게 갱신한다.
2. **`party_members` 자기 참조 RLS 정책이 무한 재귀 오류(42P17)를 냄.** 2-A에서 발견해 "본인/파티장만" 허용으로 축소해뒀던 것을, 이번에 `is_party_member()` SECURITY DEFINER 헬퍼로 제대로 해결(위 항목 참조).
3. **(해결됨, 2026-10-03 재확인) `next dev`가 127.0.0.1 등 비-localhost 호스트의 `_next/*` 자산 요청을 403으로 막아 클라이언트 번들이 부트스트랩되지 않고 하이드레이션이 전혀 일어나지 않았다** — 로그인 폼 버튼을 눌러도 아무 반응이 없고(이벤트 핸들러가 안 붙어 있어 네이티브 GET 폼 제출만 발생), 이로 인해 Playwright E2E가 전부 실패했었다. 처음엔 HMR 웹소켓 핸드셰이크 실패로 오진했었다. **수정:** `next.config.ts`에 `allowedDevOrigins: ["127.0.0.1", "localhost"]` 추가. **검증:** `npm run dev`로 띄운 서버에서 `_next/static` 청크가 127.0.0.1 Origin으로 200 응답하는 것을 확인했고, `tests/e2e/auth-onboarding.spec.ts`를 그 dev 서버에 대해 직접 실행해 통과(로그인 폼 상호작용이 정상 동작)시켰다. README를 dev 서버 기준 사용법으로 되돌렸다. Playwright E2E는 배포 산출물 검증을 위해 계속 `build && start`를 대상으로 한다(dev 제약 회피 목적 아님).
4. **`.claude/` 상태줄 훅이 `npx @claude-flow/cli hooks statusline --json` 프로세스를 정리하지 않고 계속 쌓음.** 디버깅 중 node 프로세스 46개가 좀비로 남아있는 것을 발견(이 프로젝트와 무관한 Ruflo 툴링 문제). 정리했고, Claude Code에 피드백으로 남겨뒀다(제품 이슈이며 이 저장소 코드와는 무관).
5. (2-A에서 이미 기록) 시드 스크립트의 활동 선택 쿼리 동점 문제, 마이그레이션 함수 정의 순서 — 둘 다 2-A 때 수정 완료.

## 알려진 제한 / 다음 단계로 미룬 것

1. **추천 계산의 "활동기간·투입시간 적합성(duration_time_fit)" 항목은 항상 "미상"으로 처리된다.** `activities` 테이블에 "주당 필요 시간" 같은 비교 가능한 필드가 없어서다(설계상 가중치 15는 배정돼 있으나 비교 불가 데이터로 처리하는 것이 허위 정밀도보다 낫다고 판단). 실제 필드를 추가하려면 활동 등록 폼·CSV 가져오기 스키마도 함께 바꿔야 한다.
2. ~~파티 역할 슬롯 배정 UI 없음~~ → **3단계 보완에서 해결.** 위 "3단계 보완" 절 참조.
3. ~~파티 정보 수정 기능 없음~~ → **3단계 보완에서 해결** (`update_party_details()` + `/parties/[id]/edit`). 단, 역할 추가/삭제·이름 변경은 여전히 범위 밖이다(기존 역할의 인원 조정만 가능) — 위 "3단계 보완" 절의 "의도적으로 범위에서 뺀 것" 참조.
4. ~~3단계 신규 화면 스크린샷 미재확인~~ → **3단계 보완에서 해결** (`/parties`, `/parties/new`, `/parties/[id]`, `/parties/[id]/edit`를 360px/1440px로 확인). 빠른 매칭(`matching_queue`/`match_proposals`)과 채팅 UI는 여전히 4단계 범위다.
5. **매칭 확정 워커 없음** (2-A와 동일 — 아직 4단계 범위).
6. ~~파티 공동 멤버 간 상호 조회는 2-B에서 해결했지만, "채팅 참가자 목록" 같은 파생 조회 UI는 아직 없다~~ → **4-A에서 해결.** `/chat/[roomId]`가 멤버 목록(닉네임·팀장 여부·역할)을 보여준다.
7. **CSV 가져오기는 `activity_type` 이름 정확히 일치만 연결**하고 fuzzy 매칭은 하지 않는다. 운영자가 이름을 맞추거나 가져온 뒤 수정 화면에서 보정해야 한다.
8. **프로필 "다른 사용자에게 공개" 범위가 좁다.** `profile_majors`/`profile_interests`/`profile_skills`/`availability_slots`는 RLS상 본인·운영자만 조회 가능 — 추천 계산(서버에서 본인 데이터만 읽으므로 문제없음)에는 지장이 없지만, "팀원 프로필 보기" 같은 화면이 생기면 RLS 정책을 넓히거나 전용 뷰/함수가 필요하다.
9. **npm 취약점 1건(개발 의존성, high)** — `eslint-config-next`가 의존하는 `fast-glob`→`micromatch`→`braces`(GHSA-vfj7-8cjw-p6xm). `npm audit fix --force`는 Next 16과 불호환되는 `eslint-config-next@14.2.35`로 내려가므로 적용하지 않음. 런타임/배포 번들에는 포함되지 않는 린트 전용 devDependency.
10. **상명대 이메일 도메인/전공 전체 목록/에브리타임 공식 연동 미확인** — 1단계 기록 그대로. `app_settings.allowed_email_domains`와 `majors` 테이블이 운영자 편집 가능하므로 값만 갱신하면 된다.

## 다음 명령 (사용자 승인 시)

4-B(빠른 매칭): 실제 스케줄 워커(수락/만료/재대기 처리), 공통 시간 전체 교집합 계산, 전원 수락 시 팀/채팅방 1회 생성(4-A의 통합 `parties`/`chat_rooms` 구조를 그대로 재사용), 북마크 활동 마감 임박 알림(스케줄 워커 필요). 완료 기준은 `docs/architecture.md` 10장 참조.
