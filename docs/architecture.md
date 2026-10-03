# 상명메이트 — 아키텍처 설계 (초안, 1단계: 설계)

> 상태: **초안 / 1단계(설계) 완료 산출물**. 코드는 아직 작성되지 않았다. 본 문서는 `Claude_상명대_대외활동_플랫폼_개발프롬프트.md` 12장 1단계가 요구하는 6개 항목(실행 환경, 요구사항/범위, 화면흐름·ERD·상태전이·권한표, 기술 버전, 상명대/에브리타임 공식 정보, 작업 분할)을 다룬다. 명칭 "상명메이트"는 가칭이며 설정으로 변경 가능하다. 본 서비스는 상명대학교 공식 운영 서비스가 아니다.
>
> 확인일 표기가 있는 항목은 모두 **2026-10-03** 기준이다.

## 0. 참고 — 미확인/부분확인 항목 요약

아래 항목은 공식 자료로 완전히 확인하지 못했다. 추측이나 단정 대신 "미확인"으로 표시하고, 운영자 설정값/확장 가능한 구조로 설계한다. 상세 근거는 5장 참조.

- 상명대 재학생 웹메일의 정확한 발급 정책과 도메인 형식 (기관 도메인 `smu.ac.kr` 사용은 확인, 학생 발급 정책 문서는 미확보)
- 서울캠퍼스 22개 전공의 전체 개별 명칭 목록 (단과대학·학부(과) 수는 확인, 전공 풀 리스트는 미확보)
- 에브리타임의 공식 개발자 API/OAuth 연동 지원 여부 (존재하지 않는다는 확정이 아님)

---

## 1. 실행 환경 확인 결과

| 항목 | 결과 | 비고 |
|---|---|---|
| OS | Windows 11 (10.0.26200) | PowerShell 기본, Git Bash 병행 사용 가능 |
| Node.js | v24.19.0 | 사용 가능 |
| npm | 11.17.0 | 사용 가능 |
| Git | 2.55.0.windows.5 | 사용 가능 |
| Docker | **미설치** (`docker` 명령 없음) | Supabase 로컬 스택(`supabase start`)은 Docker Desktop이 필요. 2단계(기반) 착수 전 설치 필요 — 외부 설정 항목으로 `PROGRESS.md`에 기록 |
| Supabase CLI | 전역 미설치, `npx supabase` 경유로 2.119.0 즉시 실행 확인 | npx 경유 사용 가능, 전역 설치는 선택 |
| 저장소 상태 | 그린필드 | `package.json`, `src/`, `supabase/`, `docs/`, `README.md`, `PROGRESS.md`, `.env.example` 없음. `.claude/`, `.claude-flow/`, `.swarm/`, `.mcp.json`, `CLAUDE.md`, 지시서 md만 존재 |

---

## 2. 요구사항 요약과 MVP / 후속 범위

### 핵심 사용자 흐름
가입 → 전공·관심사·역할·가능 시간 설정(온보딩) → 활동 추천 → 파티 탐색 또는 빠른 매칭 → 상호 수락 → 팀 채팅 → 실제 활동 지원(원문 사이트 안내).

플랫폼 내 "팀 합류"와 주최기관의 "활동 지원·선발"은 별개다. 활동 지원 자체는 원문 사이트로 안내하며 플랫폼이 대행하지 않는다.

### MVP 필수 범위 (지시서 2장 그대로 채택, 임의 축소 없음)
1. 기본 로그인(이메일 매직링크/OTP)과 프로필 온보딩
2. 활동 목록·검색·필터·상세·북마크, 운영자 활동 등록
3. 설명 가능한 규칙 기반 개인화 추천
4. 활동별 파티 모집·지원·승인·탈퇴·팀장 위임
5. 빠른 매칭 대기열과 전원 수락에 의한 팀 생성
6. 팀 단위 실시간 텍스트 채팅과 읽지 않은 메시지 표시
7. 앱 내 알림, 신고·차단, 최소 관리자 화면
8. DB 마이그레이션·시드·권한 정책·핵심 테스트·실행 문서

### 후속 확장 (MVP 범위 아님, MVP 핵심 흐름은 이것 없이도 끝까지 동작해야 함)
공식 에브리타임 연동, 허가된 외부 데이터 자동 수집, 추천 임베딩/LLM, 개인 간 DM, 파일·이미지 전송, 푸시 알림, 캘린더 연동, 타 대학 확장.

### 인증·소속 확인 원칙
- 로그인(이메일 매직링크/OTP)과 "학교 이메일 소유 확인"은 기능적으로 분리한다. 이메일 인증만으로 재학 여부·서울캠퍼스 소속이 증명된 것으로 표시하지 않는다.
- 대학·캠퍼스·전공은 기본적으로 **사용자 입력(자기기입)** 정보다. `email_verified`, `affiliation_self_declared`, `campus_verified`를 별도 플래그로 관리한다.
- MVP는 "서울캠퍼스 소속으로 자기기입한 사용자"를 기본 대상으로 하며, 미검증 소속은 자기기입임을 UI에 표시한다. 더 강한 재학생 인증(학생증/재학증명서 등)은 MVP 범위가 아니며 후속 도입 조건으로만 문서화한다.
- 닉네임을 사용하고 이메일·학번·실명은 공개하지 않는다. 학번·전화번호는 필수 수집하지 않는다.

### 에브리타임 연동 원칙
공식 지원이 확인되기 전까지 기본 로그인으로 개발한다. 에브리타임 자격증명을 사용자로부터 받아 대리 로그인하지 않으며, 비공개 API·인증 우회·트래픽 역공학을 쓰지 않는다. 작동하는 것처럼 보이는 가짜 버튼을 만들지 않는다. 인증 공급자 확장이 가능한 구조로만 설계한다 (5장 참조).

---

## 3. 화면 흐름

```
[비회원]
  홈(공개) → 활동 탐색 → 활동 상세(원문 링크만, 파티/매칭 참여 불가)

[로그인 후 최초]
  온보딩: 닉네임 → 소속(대학/캠퍼스/전공, 복수전공 가능) → 학년(선택) →
          관심분야(다중) → 희망 활동(다중) → 가능한 역할(다중) →
          참여 조건(온/오프/혼합, 지역, 주당 시간) → 가능한 시간(요일·시간 구간) →
          선택 정보(자기소개/포트폴리오/경험) → 공개 설정

[로그인 후 일상 흐름]
  홈(맞춤 추천 / 마감 임박 / 모집 중인 파티 / 내 매칭 상태)
    → 활동 탐색(검색·필터·정렬·북마크)
    → 활동 상세(자격·일정·원문 링크·추천 근거·관련 파티·빠른 매칭 진입)
        → 파티 탐색/상세: 역할 슬롯 확인 → 지원(역할+메시지) → [팀장 승인/거절 대기]
        → 빠른 매칭: 템플릿/역할/시간 조건 선택 → 대기열 참가 → 제안 수신 → 수락/거절
    → (전원 수락 또는 팀장 승인 완료) → 채팅방 자동 생성(1회) → 팀 채팅
  내 활동: 북마크 / 지원 현황 / 참여 팀 / 매칭 이력
  프로필/설정: 전공·관심사·가능 시간 수정(→ 추천 재계산) / 공개 범위 / 차단 / 탈퇴

[운영자]
  관리자: 활동 CRUD·CSV 가져오기 / 사용자 제보 승인 / 신고 처리 / 계정 상태 관리 / 감사 로그 열람

하단 탭(모바일): 홈 / 활동 / 파티 / 채팅 / 마이
```

각 화면은 빈 상태, 로딩, 실패·재시도, 권한 없음, 마감·삭제된 활동 상태를 별도로 설계한다(9장 참조는 추후 구현 단계에서 상세화).

---

## 4. 데이터 모델 (ERD)

지시서 11장이 명시한 24개 엔티티(`profiles`, `affiliation_verifications`, `interests`, `profile_interests`, `skills`, `profile_skills`, `availability_slots`, `activities`, `activity_tags`, `bookmarks`, `parties`, `party_role_slots`, `party_members`, `party_applications`, `matching_queue`, `match_proposals`, `match_proposal_members`, `chat_rooms`, `chat_messages`, `chat_read_states`, `notifications`, `blocks`, `reports`, `audit_logs`)를 전부 쓴다(이전 초안의 "22개"는 집계 오류였음). 여기에 운영상 필요한 3개 테이블 `majors`, `app_settings`, `user_roles`를 추가한다(아래 "운영/설정" 그룹). 실제 컬럼/제약/인덱스/RLS 정책은 2단계(기반)에서 마이그레이션으로 구체화하며, 여기서는 관계와 핵심 불변식만 정의한다.

### 엔티티 그룹과 관계

**프로필/소속**
- `profiles` 1─1 `affiliation_verifications` (검증 이력을 쌓을 경우 1─N으로 확장 가능)
- `profiles` 1─N `profile_interests` N─1 `interests`
- `profiles` 1─N `profile_skills` N─1 `skills`
- `profiles` 1─N `availability_slots` (요일·시간 구간, Asia/Seoul 기준)

**활동**
- `activities` 1─N `activity_tags`
- `profiles` N─N `activities` (조인 테이블 `bookmarks`)

**수동 파티 / 매칭 팀 (통합 테이블)**
- `parties`에 `source` 컬럼(`manual` | `matching`)을 두어 두 경로가 같은 테이블 구조를 공유한다.
  - `source = 'manual'`: 사용자가 활동 상세에서 직접 만든 파티. 생성 시 상태는 `recruiting`에서 시작한다.
  - `source = 'matching'`: 빠른 매칭 제안이 `matched`로 전환되는 순간 생성되는 파티. 생성과 동시에 상태는 `confirmed`이며 `recruiting`/`full`을 거치지 않는다(5.4절 참조).
- `activities` 1─N `parties`
- `parties` 1─N `party_role_slots` (역할별 정원). 매칭 경로는 `matched` 전환 시 제안에 쓰인 템플릿의 역할 구성을 그대로 복제해 생성한다.
- `parties` 1─N `party_members` (profiles N─N parties, `role_slot_id` FK로 슬롯 점유). `activity_id`를 `parties.activity_id`에서 비정규화해 보유하고, 파티가 `confirmed`로 전환되는 트랜잭션에서 해당 멤버 행의 `is_confirmed`(또는 `confirmed_at`)를 함께 설정한다. 매칭 경로는 파티 생성 시점에 이미 `confirmed`이므로 생성과 동시에 설정된다.
- `parties` 1─N `party_applications` (profiles N─N parties, 지원 상태 보유). `source = 'matching'` 파티에는 생성되지 않는다(매칭은 대기열·제안 경로로 지원을 대체).

**빠른 매칭**
- `activities` 1─N `matching_queue` (profiles N─N activities, 템플릿·가능 역할·시간 조건 포함)
- `matching_queue` 항목은 `match_proposal_members`를 통해 `match_proposals`에 N─1 연결
- `match_proposals` 1─N `match_proposal_members`
- `match_proposals.status`가 `matched`로 전환되는 단일 트랜잭션에서 `parties`(`source='matching'`, `status='confirmed'`) 1행 + `party_role_slots` + `party_members`를 함께 생성한다(`match_proposals`에 생성된 `party_id`를 멱등 키로 보관해 재실행 시 중복 생성을 방지).

**채팅**
- `chat_rooms`는 `parties`에 1─1로만 연결한다(`chat_rooms.party_id UNIQUE NOT NULL REFERENCES parties`). 매칭 경로도 `matched` 전환 시 통합 `parties` 행이 먼저 생기므로 채팅방 FK가 단일 경로로 단순화된다.
- **생성 시점(수동 파티):** 파티가 생성될 때(또는 첫 승인 시점) `chat_rooms`를 1개 생성한다. `parties.status`가 `confirmed`인지는 생성 조건이 아니다 — 지시서 7장 A "승인 즉시 팀원과 채팅 권한 부여"에 따라 팀장이 지원을 승인하면 그 즉시 해당 멤버가 채팅에 참여한다. `confirmed`는 팀이 최종 확정되었음을 나타내는 상태일 뿐, 채팅 가능 여부의 조건이 아니다.
- **생성 시점(매칭):** `matched` 전환과 동시에 생성되는 `parties` 행에 묶여 1개 생성된다(매칭 경로는 팀 자체가 그 시점에 비로소 존재하므로 이전 시점에 만들 수 없다).
- `chat_rooms` 1─N `chat_messages`
- (`chat_rooms`, `profiles`) 1─N `chat_read_states` (사용자별 마지막 읽은 메시지 위치)
- 채팅 접근 권한은 "해당 파티에 승인된 멤버인가"로 판정하며, 파티의 `confirmed` 여부와는 독립적으로 재검증한다(RLS 정책에서 `party_members` 존재 여부만 확인).

**알림/신뢰·안전**
- `profiles` 1─N `notifications`. 이벤트 중복 발송 방지를 위해 `dedupe_key`(예: `event_type + target_type + target_id + profile_id` 조합의 해시 또는 복합 유니크 제약)를 두고, 동일 키로는 `UNIQUE` 제약 위반 시 무시(upsert on conflict do nothing) 처리한다. 스케줄 워커가 중복 실행되어도 중복 알림이 쌓이지 않도록 한다.
- `profiles` N─N `profiles` (자기참조 `blocks`: blocker_id, blocked_id)
- `reports` (reporter_id FK + target_type/target_id 다형성 참조 + status)
- `audit_logs` (actor_id FK + action + target_type/target_id + 타임스탬프, 신고 처리 등 운영자 행위 기록)

**운영/설정 (지시서 24개 엔티티 외 추가)**
- `majors` — 전공 참조 테이블. 고정 enum이 아닌 운영자가 CRUD로 편집 가능한 테이블이며, 9장에서 설명한 "전공 전체 명칭 미확보" 문제에 대응해 `is_demo`(데모/샘플 표시 여부) 플래그를 둔다. `profiles`/`profile_majors`(복수전공 허용 시 N─N) 또는 `profiles.major_id`에서 참조한다.
- `app_settings` — 운영자가 조정하는 설정값 저장소(키-값 또는 구조화 테이블 1행). 최소한 다음을 포함한다: 허용 이메일 도메인 목록(9장 "허용 이메일 도메인은... 운영자가 편집 가능한 설정 목록"을 구체화), 추천 가중치(7장의 관심분야 35/선호 활동 유형 20/전공 관련성 15/지역·방식 15/활동기간·투입시간 적합성 15 기본값), 매칭 수락 기한(기본 24시간, 5.4절·지시서 7장 B 항목 7의 설정 가능한 기한을 구체화).
- `user_roles` — 관리자 권한을 `profiles`의 자기수정 가능한 입력값과 분리해서 저장하는 테이블(`profile_id` FK + `role` enum 등). 6장 권한표의 "관리자 권한은... 분리된 필드/테이블로 관리" 원칙을 구현한다. 일반 사용자는 이 테이블에 쓰기 권한이 없다(RLS로 서버/운영자만 변경).

### 핵심 불변식

1. **활동당 사용자별 활성 팀은 1개(3단계 보완: confirmed 기준 → active 기준으로 앞당김).** `party_members`에 `activity_id`(비정규화)와 `status` 상태를 두고 `UNIQUE(activity_id, profile_id) WHERE status = 'active'` 부분 인덱스로 DB 레벨 보장한다. `parties.source`가 `manual`이든 `matching`이든 같은 `party_members` 테이블·같은 인덱스를 거치므로 두 경로 모두 동일하게 보장된다. 이 제약은 더 이상 "확정(confirmed)" 시점이 아니라 "지원 승인(approve_application)" 시점에 걸린다 — 승인되는 즉시 같은 활동의 다른 `pending` 지원은 `superseded`로 자동 정리되고, 지원자가 이미 같은 활동의 다른 파티에서 활성 멤버라면 승인 자체가 거부된다(5.2절). 따라서 확정(`confirm_party`) 시점에는 이미 활동당 활성 멤버가 유일함이 보장되어 있어, 확정 트랜잭션이 별도로 충돌을 처리할 필요가 없다.
2. **파티 정원 초과 금지.** 마지막 슬롯에 대한 동시 승인 요청은 DB 트랜잭션(행 잠금 또는 조건부 UPDATE)으로 직렬화하여 1건만 성공시킨다.
3. **매칭 제안의 팀/파티/채팅방 생성은 멱등적으로 1회만.** 전원 수락 완료를 감지한 워커(또는 마지막 수락 트랜잭션)가 `match_proposals`에 보관된 `party_id`(생성되었다면)와 유니크 제약으로 중복 생성을 방지한다.
4. **차단 관계**는 신규 추천·자동 매칭·신규 초대 후보 집합에서 상호 제외하되, 이미 같은 팀에 속한 기존 멤버십은 차단만으로 강제 해제하지 않는다.
5. **채팅 접근은 승인 시점부터, confirmed 여부와 무관.** 수동 파티는 지원이 승인되는 즉시(= `party_members` 행 생성 즉시) 채팅 접근 권한이 생기며, 이는 `parties.status`가 `confirmed`로 바뀌는 것과 별개의 이벤트다.

상세 컬럼 정의, CHECK 제약, RLS 정책 문서는 2단계(기반)에서 `supabase/migrations/`와 함께 본 문서를 갱신하여 채운다.

---

## 5. 상태 전이

### 5.1 파티(`parties.status`)

```
recruiting ──(정원 충족)──> full
full ──(이탈로 슬롯 재오픈, 팀장 재모집 결정)──> recruiting
recruiting/full ──(팀장 명시적 확정 액션)──> confirmed
confirmed ──(활동 종료 처리)──> completed
recruiting/full/confirmed ──(팀장 해산 또는 활동 마감)──> cancelled
```

`full`(정원 충족)과 `confirmed`(팀 확정)는 별개 상태다. 정원이 찼다고 자동으로 확정되지 않으며, 팀원 이탈 시 재모집 여부는 팀장이 결정한다.

위 상태 전이는 `parties.source = 'manual'`(수동 파티)에 적용된다. `source = 'matching'` 파티는 `match_proposals`가 `matched`로 전환되는 트랜잭션에서 곧바로 `confirmed` 상태로 생성되며 `recruiting`/`full`을 거치지 않는다(5.4절).

**채팅방 생성·채팅 권한은 이 상태 전이와 별개다.** 수동 파티는 파티가 생성될 때(또는 첫 승인 시점) `chat_rooms`가 1개 생성되고, 지원이 승인된 멤버는 파티가 `recruiting`/`full` 상태여도 즉시 채팅에 참여한다(지시서 7장 A). `confirmed` 전환은 채팅 가능 여부에 영향을 주지 않는다.

### 5.2 파티 지원(`party_applications.status`)

```
pending ──(팀장 승인)──> approved
pending ──(팀장 거절)──> rejected
pending ──(지원자 취소)──> cancelled
pending ──(동일 사용자가 같은 활동의 다른 파티에 먼저 승인됨)──> superseded (자동)
```

지원은 역할 슬롯(`party_role_slots`) 단위로 이루어진다 — 지원자는 빈 슬롯이 있는 역할만 선택할 수 있고(`apply_to_party`), 승인(`approve_application`)은 그 지원서에 저장된 `role_slot_id`의 정원을 행 잠금으로 재검사한 뒤 멤버를 추가한다. 팀장 본인도 파티 생성 시 역할 슬롯 하나를 차지하며, 역할별 정원의 합이 파티 전체 정원(`parties.capacity`)이 된다(지시서 7장 A, 3단계 보완).

`approved`로 전환되는 즉시(= `party_members` 행 생성 즉시) 해당 사용자는 그 파티의 `chat_rooms`에 대한 읽기·쓰기 권한을 받는다. 이는 `parties.status`가 아직 `recruiting`/`full`이어도 적용되며, `confirmed` 전환을 기다리지 않는다(지시서 7장 A, 4장 5번 핵심 불변식).

같은 활동에 여러 파티에 `pending` 지원은 허용한다(확정 전까지는 여러 곳에 지원해 둘 수 있다). 다만 **승인은 활동당 한 번만 유효하다** — 한 지원이 승인되어 지원자가 활성 멤버가 되는 즉시, 같은 활동의 다른 `pending` 지원은 자동으로 `superseded` 처리되고, 지원자가 이미 다른 파티의 활성 멤버라면 애초에 승인이 `ALREADY_ACTIVE_IN_ACTIVITY` 오류로 거부된다(4장 핵심 불변식 1). 두 파티의 팀장이 같은 지원자를 동시에 승인하는 경쟁 상황은 활동+사용자 단위 advisory lock(`lock_activity_membership`)으로 직렬화되어, 한쪽만 성공하고 나머지는 거부되거나(`APPLICATION_SUPERSEDED`) 그 자리에서 superseded로 정리된다 — 서로 다른 행을 잠그는 두 트랜잭션이 교착하지 않도록 이 lock은 다른 어떤 행 잠금보다 먼저 걸린다.

### 5.3 빠른 매칭 대기열(`matching_queue.status`)

```
waiting ──(제안 편성)──> (match_proposal_members에 참조됨, 대기열 자체는 'proposed'로 표기)
proposed ──(해당 제안이 matched)──> matched
proposed ──(해당 제안이 expired/cancelled, 사전 "계속 찾기" 동의)──> waiting (재편입)
proposed ──(해당 제안이 expired/cancelled, 재동의 없음)──> cancelled
waiting ──(사용자 취소)──> cancelled
```

제안 중인 사용자는 동일 활동의 다른 제안에 중복 배치하지 않는다.

### 5.4 매칭 제안(`match_proposals.status`)

```
proposed ──(전원 수락, 설정 가능한 기본 24시간 이내 — 기한은 `app_settings`에서 운영자가 조정)──> matched
proposed ──(수락 기한 초과)──> expired
proposed ──(1명 이상 거절)──> cancelled
```

`matched` 전환은 단일 트랜잭션에서 다음을 멱등적으로 수행한다: `parties`(`source='matching'`, `status='confirmed'`) 1행 생성 → 제안 템플릿의 역할 구성을 복제한 `party_role_slots` 생성 → 제안 멤버를 `party_members`로 복제(이 시점에 `is_confirmed=true`) → 그 `parties` 행에 묶인 `chat_rooms` 1개 생성. 이렇게 수동 파티와 동일한 테이블 구조·동일한 채팅방 FK 경로를 거치므로 "활동당 확정 팀 1개" 제약과 채팅 접근 로직을 두 경로에서 중복 구현하지 않는다(4장 참조).

팀장 역할은 대기열 참가 시 사전 동의한 후보에게만 배정하며, 동의한 후보가 없으면 자동 지정하지 않는다(수동 파티 대안 안내).

### 5.5 매칭 알고리즘 설계 요지 (지시서 7장 B 기준)

1. 활동별 정원·역할 구성 템플릿을 정의하고, 사용자는 템플릿·수행 가능 역할·시간 조건을 선택해 명시적으로 대기열에 참가한다(매칭 동의 필수). "역할 구성 템플릿"은 수동 파티가 이미 쓰는 `party_role_slots`의 `{role_name, capacity}` 형태를 그대로 재사용할 수 있도록 설계한다(3단계에서 `create_party`가 받는 `p_role_slots` 입력과 동일한 모양) — `matched` 전환 시 이 템플릿을 그대로 복제해 `party_role_slots`를 생성하므로(5.4절), 4단계에서 별도의 템플릿 테이블을 새로 만들 필요 없이 매칭 전용 템플릿 정의(예: `matching_queue`/활동 설정에 둘 역할 구성 목록)만 이 모양에 맞추면 된다.
2. 필수 조건(동일 활동·호환 템플릿, 정원, 역할 슬롯, 캠퍼스 정책, 차단 관계, 공통 시간 최소 기준)을 만족하는 후보만 추린다.
3. **전체 공통 시간 교집합**을 계산한다 — 두 사람씩만 겹치는 것으로 전체 팀이 맞는다고 판단하지 않는다("겹침의 함정" 방지). 일정 미입력자는 빠른 매칭 참가 전 설정을 안내받는다.
4. 필수 조건 통과 후보 중 역할 충족·공통 시간·협업 선호도를 고려해 조합을 고른다. 소규모 MVP는 제한된 후보 집합 + 탐욕/백트래킹으로 충분하며, 계산량 상한과 재시도 간격을 설정값으로 둔다. 최적해를 보장한다고 주장하지 않는다. 동점 시 대기 시간이 긴 사용자를 우선하는 등 결정적 규칙을 사용한다.
5. 실행은 **실제 스케줄 워커**(DB 함수 + Supabase 스케줄/Cron 등)로 수행하며, 브라우저 타이머에 의존하지 않는다. 복수 워커 동시 실행, 마지막 자리 동시 수락에도 데이터 정합성이 깨지지 않도록 트랜잭션·멱등 키를 사용한다.
6. 후보가 부족하면 대기 인원·부족 역할과 수동 파티 대안을 보여주고, 동의 없이 일정·소속 조건을 완화하지 않는다.

---

## 6. 권한표

| 리소스 / 액션 | 비회원 | 로그인 사용자 | 파티장(해당 파티) | 운영자 |
|---|---|---|---|---|
| 활동 조회 | O (공개만) | O | O | O |
| 활동 등록/수정/삭제, CSV 가져오기 | X | X | X | O |
| 북마크 생성/삭제 | X | O (본인) | O | O |
| 파티 생성 / 지원 | X | O | O | O |
| 파티 승인/거절/해산/팀장 위임 | X | X | O (본인 파티) | O (중재/예외 처리) |
| 파티 정보 수정(제목/소개/모임 방식/모집 마감/공통 시간/역할별 정원, `update_party_details`) | X | X | O (본인 파티, 역할 정원은 현재 인원 미만으로 축소 불가) | O |
| 빠른 매칭 참가/취소 | X | O (명시적 동의자) | 해당 없음 | O |
| 팀 채팅 조회/전송 | X | X | O (해당 파티의 승인된 멤버 — `parties.status`가 `confirmed`인지와 무관) | X (신고 처리 최소 범위 제외) |
| 신고/차단 생성 | X | O | O | O |
| 신고 처리/계정 제재 | X | X | X | O |
| 감사 로그 열람 | X | X | X | O |

모든 항목은 서버(DB 함수·RLS)에서 재검증하며, 클라이언트 화면에서 버튼을 숨기는 것으로 접근 통제를 대체하지 않는다. 관리자 권한은 사용자가 수정 가능한 프로필 입력값과 분리된 필드/테이블로 관리한다.

---

## 7. 추천 계산 (지시서 6장 규칙, 설정값으로 관리)

```
score = 100 × Σ(weight_i × compatibility_i) / Σ(valid_weight_i)
```

- 기본 가중치: 관심분야 35, 선호 활동 유형 20, 전공 관련성 15, 지역·방식 15, 활동기간·투입시간 적합성 15 (합계 100, 설정 파일로 관리)
- 각 `compatibility_i`는 0~1로 계산, 비교 불가(데이터 없음)한 항목은 "미상"으로 제외하고 유효 가중치 합으로 정규화한다.
- 근거가 너무 적으면 점수 대신 탐색(디스커버리) 추천으로 대체한다.
- 명백히 지원 불가·마감·비공개인 활동은 제외하고, 자격 불명확 시 "확인 필요"로 남긴다.
- 노출 근거는 실제 계산에 쓰인 항목만 2~3개 표시("관심분야: 환경과 일치" 등)하며, 미입력 일정을 맞는다고 표시하지 않는다.
- 점수를 합격 가능성/성공 확률로 표현하지 않는다.
- 동점 시 마감 임박·최근 확인일 등 명시된 기준으로 정렬하고, 특정 분야 편중을 막기 위해 탐색 카드를 일부 섞는다.
- 신규 사용자(데이터 희소)는 모집 중인 활동을 분야별로 분산 노출한다.
- 가중치는 단위 테스트로 계산 정확성을 검증한다(3단계에서 구현).

---

## 8. 기술 구성 및 버전 확인 결과

기본 스택(지시서 10장): Next.js + TypeScript, Tailwind CSS, 접근성 있는 UI 컴포넌트, Supabase(PostgreSQL/Auth/Realtime), Zod, Vitest, Playwright. 이 조합은 개발 방향이며 특정 버전의 기능 지원을 단정하는 정보가 아니다.

| 구성 요소 | 확인된 안정 버전 | 출처 | 확인일 |
|---|---|---|---|
| Next.js | 16.3.8 (App Router 기본) | https://nextjs.org/docs | 2026-10-03 |
| @supabase/supabase-js | 2.117.2 (2026-09-25 릴리스) | https://github.com/supabase/supabase-js/releases | 2026-10-03 |
| Supabase CLI | 2.119.0 (로컬 `npx supabase --version` 실행으로 직접 확인) | 로컬 실행 결과 | 2026-10-03 |

2단계(기반) 착수 시점에 버전을 재확인하고 `package-lock.json`(또는 선택한 패키지 매니저의 lockfile)으로 고정한다. 외부 AI API·별도 검색엔진·벡터 DB·Redis는 초기 필수 의존성으로 추가하지 않는다.

---

## 9. 상명대 공식 정보 확인 결과

상세 출처·확인 방법은 `docs/data-sources.md`에 별도 기록한다(2단계 이후 지속 갱신). 요지:

- **이메일 도메인**: `smu.ac.kr`이 상명대학교 공식 기관 도메인으로 다수 학과 페이지의 공식 연락처에 사용됨을 확인(2026-10-03). 재학생에게 발급되는 학생 웹메일의 정확한 도메인 형식·발급 정책을 명시한 공식 안내 페이지 본문은 이번 조사에서 확보하지 못했다 (시도한 URL들은 학과별 "이메일 무단수집 거부" 상용구 페이지로 확인됨). → **미확인**. 허용 이메일 도메인은 하드코딩하지 않고 운영자가 편집 가능한 설정 목록(기본 시드값 `smu.ac.kr`)으로 구현한다.
- **서울캠퍼스 전공 목록**: 서울캠퍼스는 5개 단과대학(인문사회과학대학, 사범대학, 경영경제대학, 융합공과대학, 문화예술대학), 20개 학부(과), 22개 전공으로 구성됨을 공식 편제 현황 페이지에서 확인(출처: https://www.smu.ac.kr/ko/intro/collegeStatus.do , 2026-10-03). 22개 전공의 전체 개별 명칭은 단과대학별 하위 페이지에 분산되어 있어 이번 조사에서 전부 확보하지 못했다. → **부분 확인**. 전공은 고정 enum이 아닌 운영자 편집 가능한 참조 테이블로 설계하고, MVP 시드 데이터는 "데모/샘플, 운영자 확인 필요"로 명시 표시한다.
- **에브리타임 공식 연동**: 공개 웹 검색으로 에브리타임의 공식 개발자 API/OAuth 문서를 찾지 못했다(2026-10-03 기준, 지시서 부록의 동일 기준일 확인 내용과 일치). 이는 공식 연동이 존재하지 않는다는 확정이 아니다. → **미확인**. 기본 로그인(이메일 매직링크/OTP)으로 MVP를 개발하고, 인증 공급자를 교체·추가할 수 있는 추상화만 설계하며 구현 완료로 처리하지 않는다. 향후 연결 시에도 로그인된 사용자의 명시적 연결 동의와 공급자 계정 확인을 거치고, 닉네임 동일을 이유로 계정을 병합하지 않는다.

---

## 10. 2~5단계 작업 분할 계획과 완료 기준

| 단계 | 범위 | 완료 기준 |
|---|---|---|
| 2. 기반 | Next.js+TS 프로젝트 초기화, `.env.example`, Supabase 마이그레이션(지시서 24개 엔티티 + `majors`/`app_settings`/`user_roles` 3개 + RLS), 이메일 OTP/매직링크 로그인, 프로필 온보딩, 개발 시드(가상 활동 20개 이상 + 테스트 사용자/파티/매칭 사례), 활동 관리자 CRUD·CSV 가져오기, 활동 탐색/상세 | 마이그레이션이 로컬 Supabase에 오류 없이 적용됨, RLS 정책으로 비소유자의 쓰기 시도가 거부됨(수동 검증), 온보딩 입력값이 새로고침 후에도 유지됨, 검색·필터 조합과 페이지네이션·URL 복원이 동작함, `lint`/타입체크 통과 |
| 3. 핵심 | 추천 함수(가중치 설정 기반, 단위 테스트 포함), 북마크, 파티 생성·지원·승인·탈퇴·팀장 위임, 서버 측 권한·정원·중복가입 검증 | 추천 가중치 계산 단위 테스트 통과, "파티 마지막 자리 동시 승인" 시나리오에서 정원 초과 없이 1명만 확정, "동일 활동 두 파티 동시 확정 시도" 시나리오에서 1개만 확정되고 나머지 자동 정리, DB 레벨 유니크 제약으로 활동당 확정 팀 1개 보장 |
| 4. 매칭·소통 | 실제 스케줄 워커(수락/만료/재대기 처리), 공통 시간 전체 교집합 계산, 전원 수락 시 팀/채팅방 1회 생성, 팀 채팅(DB 영구 저장 + Realtime 전달 + 읽음 상태), 앱 내 알림(이벤트 중복 발송 방지) | 워커를 중복 실행해도 중복 제안·팀·알림이 생기지 않음, "두 명씩만 시간이 맞고 전체 교집합은 없는" 케이스에서 팀이 생성되지 않음, 독립된 두 세션 간 실시간 수신·새로고침 복구·전송 실패 재시도 시 메시지 중복 없음 |
| 5. 운영·검증 | 신고·차단, 최소 관리자 화면(신고 처리 최소 범위 접근 + 감사 기록), 경쟁조건/접근통제 테스트, 반응형(360px/768px/1440px) 확인, `README.md`/`docs/architecture.md`/`docs/data-sources.md`/`docs/operations.md`/`PROGRESS.md` 완성 | 권한 위조 및 채팅 접근 공격 시나리오가 서버/DB 레벨에서 거부됨, 차단된 사용자가 신규 자동 매칭에서 제외됨, `lint`·타입체크·테스트·프로덕션 빌드를 모두 실행하고 결과를 기록, 실행하지 못한 검증은 이유와 재현 명령을 명시 |

각 단계 착수 시 `guidance_brain`/`memory_search`로 라우팅을 재확인하고, 다중 모듈을 동시에 건드리는 시점(2단계 이후)부터는 hierarchical 스웜 + 에이전트별 격리 worktree + 파일 소유권 분리를 적용한다. `package.json`/lockfile/마이그레이션은 리드(조율 담당)만 수정한다.

---

## 11. 4-A단계: 팀 채팅 · 앱 내 알림 구현

### 11.1 쓰기 경로 — 모두 DB 함수를 거친다

3단계 파티 함수와 같은 원칙을 그대로 따른다: `chat_messages`/`chat_read_states`/`notifications`의 INSERT·UPDATE RLS를 운영자 전용으로 좁히고, 일반 사용자는 반드시 다음 SECURITY DEFINER 함수를 거치게 한다.

- `send_chat_message(chat_room_id, client_message_id, body)` — 활성 멤버인지 확인, 본문 1~2000자 검증, 분당 전송 빈도 제한(`app_settings.chat_rate_limits`), `client_message_id` 기준 멱등 재시도(이미 저장된 메시지가 있으면 새로 만들지 않고 그 id를 그대로 반환 — 동시 재시도 경쟁도 `on conflict ... do nothing` + 재조회로 안전하게 처리), 전송 성공 시 같은 파티의 다른 활성 멤버에게 "방 단위" 알림을 upsert(11.3절 참고).
- `mark_chat_read(chat_room_id, last_read_message_id)` — `chat_read_states`를 upsert하고, 그 방의 `chat_new_message` 알림을 읽음 처리한다. 멤버가 아니면(탈퇴/강퇴) `NOT_A_MEMBER`로 거부한다 — 클라이언트가 이 에러로 "더 이상 접근할 수 없음"을 감지한다(11.4절).
- `list_my_chat_rooms()` — `/chat` 목록이 필요한 모든 것(상대/파티 제목, 마지막 메시지, 안 읽은 수)을 한 번에 주는 조회 함수. 기존 테이블 SELECT RLS를 그대로 타도록 SECURITY INVOKER(기본값)로 둔다.
- `mark_notification_read` / `mark_all_notifications_read` — 알림 읽음 처리.
- 합류(지원 승인)·탈퇴·팀장 위임·팀 확정 시 기존 파티 함수(`approve_application`/`leave_party`/`delegate_leader`/`confirm_party`)가 `insert_system_chat_message()` 헬퍼로 시스템 메시지(`sender_id = null`, `message_type = 'system'`)를 자동으로 남긴다.

### 11.2 Realtime 전달 — Broadcast-from-Database (postgres_changes가 아님)

처음에는 `chat_messages`를 `supabase_realtime` 발행에 추가하고 클라이언트가 `{ config: { private: true } }` + `postgres_changes` 구독으로 받는 설계였다. **로컬 스택에서 실제로 두 브라우저 컨텍스트로 검증하다가 이 설계가 동작하지 않음을 발견했다**: Supabase 공식 문서에 "`private` 채널 옵션은 Postgres Changes에는 적용되지 않는다"고 명시되어 있고, `private` 채널은 `realtime.messages` 테이블에 대한 RLS로 "채널 구독(조인) 자체"를 인가하는데 이 테이블에 정책이 하나도 없으면(로컬 스택 기본값) 아무도 private 채널에 조인하지 못한다 — 구독 자체가 거부되어 어떤 이벤트도 전달되지 않았다.

대신 **Broadcast-from-Database**를 쓴다(`supabase/migrations/20261003161000_chat_realtime_broadcast.sql`):
1. `chat_messages` AFTER INSERT 트리거(`chat_messages_broadcast`)가 `realtime.broadcast_changes()`로 새 행을 `'chat_room:<chat_room_id>'` 토픽에 `'new_message'` 이벤트로 브로드캐스트한다(시스템 메시지도 같은 테이블에 insert되므로 동일하게 전달된다).
2. `realtime.messages`에 RLS 정책을 걸어, 그 토픽이 가리키는 채팅방의 활성 멤버(`is_party_member()`)만 수신(SELECT)할 수 있게 한다.
3. 클라이언트는 `{ config: { private: true } }` 채널로 `'new_message'` broadcast 이벤트를 구독한다(`ChatRoomClient.tsx`). 탈퇴/강퇴된 사용자는 `is_party_member`가 더 이상 참이 아니므로 이 RLS가 막아 이후 메시지를 받지 못한다 — 화면에서 버튼을 숨기는 것이 아니라 DB 정책 수준의 통제다.
4. Broadcast는 과거 이벤트를 재생하지 않는다. 채널이 (재)연결되어 `SUBSCRIBED` 상태가 될 때마다 마지막으로 알고 있는 메시지 이후를 `loadNewerMessagesAction`으로 한 번 따라잡아, 구독이 끊겨 있던 짧은 틈(인증 재시도 등) 사이에 온 메시지를 놓치지 않게 한다.

### 11.3 알림 — 방 단위로 묶고, 보고 있으면 만들지 않는다

- **방 단위 묶음**: 새 메시지 알림의 `dedupe_key`는 `'chat_new_message:' || chat_room_id` (메시지 id를 포함하지 않음)이다. `on conflict (profile_id, dedupe_key) do update`로 upsert하므로, 연속된 안 읽은 메시지는 알림 1건만 유지하며 내용/시각만 최신으로 갱신된다. 사용자가 읽으면(`mark_chat_read`) 그 알림의 `read_at`이 설정되고, 이후 새 메시지가 오면 `read_at = null`로 되살아나 다시 "안 읽음"이 된다.
- **보고 있으면 생성하지 않음**: 완벽한 실시간 presence 추적 없이 근사치로 구현한다. 채팅방 화면이 열려 있는 동안 15초 주기(+ 탭이 다시 보일 때, + 메시지를 받을 때)로 `mark_chat_read`를 호출하는 하트비트를 둔다. `send_chat_message`는 알림을 만들기 전에 수신자의 `chat_read_states.last_read_at`이 30초 이내인지 확인하고, 그렇다면("최근에 활동 중") 알림을 만들지 않는다. 최대 약 30초의 오차가 있을 수 있지만, 하트비트를 멈추면(탭을 닫거나 다른 화면으로 이동) 금방 다시 알림 대상이 된다.

### 11.4 탈퇴·강퇴 시 접근 차단 — "이미 열려 있는 연결"까지

- **조회/전송**: `chat_messages`/`chat_rooms`/`chat_read_states`의 SELECT·함수 내부 검증이 모두 `party_members.status = 'active'`를 확인한다. 탈퇴 즉시 거부된다(`tests/rls/chat.test.ts`로 검증).
- **Realtime 수신**: 11.2절의 `realtime.messages` RLS가 `is_party_member()`를 쓰므로, 탈퇴 이후의 새 브로드캐스트는 애초에 그 사용자에게 전달되지 않는다.
- **이미 열려 있던 연결**: 브라우저 탭을 이미 열어 둔 채로 탈퇴/강퇴를 당한 경우까지 방어하기 위해, `ChatRoomClient`의 하트비트가 매번 `mark_chat_read`를 호출하고 그 응답이 `NOT_A_MEMBER`이면 즉시 `subscribedRef`를 끊고(이후 들어오는 브로드캐스트를 무시) "더 이상 접근할 수 없음" 상태로 전환한다. 다시 그 방을 방문(새로고침)하면 서버 컴포넌트가 멤버십을 재확인해 `notFound()`로 막는다. Realtime 서버 자체도 구독 인가를 주기적으로 재검사하지만(접속 유지 중 JWT 갱신 시점 등), 정확한 재검사 주기를 제품 코드가 의존하기엔 불확실하므로 하트비트 쪽을 1차 방어선으로 둔다.

### 11.5 메시지 본문 — 텍스트와 안전한 링크만

메시지는 항상 일반 텍스트 노드로 렌더링한다(`dangerouslySetInnerHTML`을 쓰지 않음) — 그래서 어떤 입력이 와도 HTML/스크립트는 절대 실행되지 않는다. `http(s)://`로 시작하는 URL만 `splitMessageSegments()`(순수 함수, 단위 테스트 있음)로 분리해 `<a>` 링크로 바꾸고, 그 외 스킴(`javascript:` 등)은 그냥 텍스트로 남는다.

## 12. 4-B단계: 빠른 매칭 구현

### 12.1 역할 구성 템플릿

`activity_match_templates`(id, activity_id, name, is_active) + `activity_match_template_roles`
(template_id, role_name, capacity) — `party_role_slots`와 같은 `{role_name, capacity}` 모양이다.
운영자가 관리자 활동 수정 화면에서 활동당 여러 템플릿을 만들 수 있고(`MatchTemplatesManager`),
비활성화하거나(참가 신청이 있으면 삭제 대신 비활성화를 안내) 삭제할 수 있다. `matching_queue`는
`template_id`(어떤 템플릿에 참가했는지)와 `eligible_roles text[]`(수행 가능한 역할, 복수 선택)를
갖는다 — 지시서 7장 B "수행 가능한 역할 복수 선택, 배정은 1슬롯"을 반영해 기존(3단계 당시
설계된) 단일 `template_role` 컬럼을 이렇게 교체했다(4단계 전체가 미착수 상태였어서 데이터
마이그레이션 없이 교체 가능했다).

### 12.2 매칭 알고리즘 — TS 순수 함수와 plpgsql 구현을 둘 다 둔 이유

`src/lib/matching.ts`의 `findMatch()`가 알고리즘의 1차 명세이자 단위 테스트 대상이다(10건,
역할 충족·전체 교집합·겹침의 함정·팀장 동의·차단 관계·동점 규칙·탐색 한도). 하지만 실제
운영 경로(아래 12.3절 워커)는 **이 TS 코드를 호출하지 않는다** — pg_cron은 Postgres 함수만
실행할 수 있어 매칭 편성 로직 자체가 DB 안에서 돌아야 하기 때문이다. 그래서
`_find_match_for_group()`(plpgsql)이 같은 설계(탐욕 선택 + 결정적 우선순위로 정렬한 후보를
반복적 스택으로 백트래킹, 팀장 동의 필수, 차단 관계 제외, 탐색 한도)를 독립적으로
재구현한다. 두 구현이 갈라질 위험은 있지만(의도적 트레이드오프), 각각 적합한 방식으로
검증한다 — TS는 빠른 단위 테스트로 알고리즘 자체의 정확성을, plpgsql은 통합 테스트로
트랜잭션·동시성 보장을 검증한다(12.3절).

**전체 공통 시간 계산은 plpgsql 쪽이 더 간단하다.** 요일(0~6)×분(0~1439)을 "주간 분
오프셋"(`day_of_week*1440 + 분`, 0~10079)으로 매핑하면 한 사람의 가능 시간을 하나의
`int4multirange`로 표현할 수 있고, PostgreSQL 17의 멀티레인지 교집합 연산자(`*`)로 여러
사람의 교집합을 그냥 곱해서 구할 수 있다(`range_agg()`로 겹치는 구간을 먼저 병합). 별도
구간 스윕 알고리즘을 직접 구현할 필요가 없다. TS 쪽은 투 포인터 스윕(`intersectRanges`)으로
같은 결과를 계산한다.

### 12.3 워커 — pg_cron + run_match_worker

로컬 스택에서 pg_cron이 실제로 동작하는지 먼저 확인했다(`shared_preload_libraries`에 이미
포함돼 있어 `CREATE EXTENSION`만으로 바로 썼다 — 별다른 대안이 필요 없었다). 매분
`select public.run_match_worker(now());`을 실행하도록 등록했다(`cron.schedule('match-worker', ...)`,
마이그레이션 `20261003170100`). 개발 중 즉시 확인용으로 `npm run worker:match`
(`scripts/run-match-worker.mjs`, service-role 키로 같은 RPC를 호출)도 제공한다. 워커 함수는
기준 시각을 `p_as_of` 인자로 받으므로(기본값 `now()`), 테스트에서 미래 시각을 넘겨 만료
처리를 결정적으로 재현할 수 있다.

`run_match_worker(p_as_of)`는 순서대로:

1. **만료 처리** — `status='proposed' and expires_at <= p_as_of`인 제안을 `FOR UPDATE SKIP LOCKED`로
   훑으며 `_release_match_proposal(id, 'expired')`를 호출한다.
2. **매칭 편성** — `matching_queue`에서 `status='waiting'`인 `(activity_id, template_id)` 조합을
   모두 구해 그룹마다 `_find_match_for_group()`을 시도한다. 한 그룹 처리가 예외로 실패해도
   `exception when others`로 감싸 다른 그룹·만료 처리에 영향을 주지 않는다.
3. **북마크 마감임박 알림** — 북마크한 활동 중 `apply_end_at`이 `bookmark_deadline_hours`(기본
   48시간) 이내로 남은 것에 대해 `dedupe_key = 'bookmark_deadline_soon:' || activity_id || ':' || profile_id`로
   알림을 upsert한다(중복 발송 방지).

반환값은 `{as_of, expired_proposals, new_proposals, bookmark_notifications_checked}` — 수동
실행 시 바로 결과를 확인할 수 있다.

**동시성 보장:**
- `_find_match_for_group()`은 후보를 모을 때 `FOR UPDATE SKIP LOCKED`로 잠근다(윈도우 함수와
  `FOR UPDATE`를 한 질의에 못 섞어 CTE로 잠그는 부분을 분리했다). 워커가 동시에 두 번
  돌아도 같은 사람이 두 그룹에 동시에 들어가거나 같은 그룹에서 중복 제안이 나오지 않는다 —
  먼저 잠근 트랜잭션이 그 행들을 다 가져가고, 나중 트랜잭션은 SKIP LOCKED로 건너뛰어 후보가
  모자라면 그냥 제안을 만들지 않는다(다음 틱에 재시도).
- **전원 수락 시 파티 생성은 정확히 1회만.** `respond_to_match_proposal`이 마지막 수락을
  감지하면 `_finalize_match_proposal`을 호출하는데, 이 함수는 `match_proposals` 행을
  `FOR UPDATE`로 잠그고 `status<>'proposed' or party_id is not null`이면 조용히 반환한다
  (`approve_application`/`confirm_party`와 동일한 멱등 가드 패턴). 마지막 두 명이 동시에
  수락해도 한쪽이 먼저 행 잠금을 얻어 파티를 만들고, 다른 쪽은 잠금을 기다렸다가 이미
  처리된 것을 보고 그냥 끝난다.

### 12.4 상태 전이 (실제 구현 기준 — 설계 5.3/5.4절과 거의 동일하게 구현됨)

```
matching_queue.status:
  waiting ──(워커가 그룹을 편성)──> proposed
  proposed ──(그 제안이 matched)──> matched
  proposed ──(그 제안이 expired/cancelled, 본인 continue_on_fail=true)──> waiting (재편입)
  proposed ──(그 제안이 expired/cancelled, continue_on_fail=false)──> cancelled
  waiting ──(사용자 취소, cancel_matching_queue)──> cancelled
  waiting/proposed ──(같은 활동의 수동 파티에 합류, approve_application)──> cancelled 또는
                                                                              (연쇄) 제안 해제

match_proposals.status:
  proposed ──(전원 accepted)──> matched   (party_id 설정, 멱등)
  proposed ──(한 명이라도 declined)──> cancelled
  proposed ──(expires_at 경과, 워커가 감지)──> expired
```

설계 문서(5.3/5.4절)와의 차이는 사소하다: continue_on_fail 재편입 여부를 "제안 전체"가 아니라
**멤버 개인별**(그 사람이 큐에 참가할 때 선택한 값)로 판정한다 — 거절한 사람도 자신의
continue_on_fail이 true면 다시 대기열에 들어간다(사전 동의를 그대로 존중). 교차 정리는
새로 추가됐다: `approve_application`(수동 파티 합류)이 같은 활동의 매칭 대기열/진행 중인
제안을 정리하고(`_cancel_matching_queue_for_activity`), `_finalize_match_proposal`(매칭 확정)이
반대로 그 사람의 수동 파티 대기 지원을 `superseded`로 정리한다 — 두 경로가 서로를 침범하지
않게 한다(지시서 7장 B 명시 요구사항).

### 12.5 Realtime 접근 차단 재검토

4-A에서 설계한 "탈퇴 시 이미 열린 연결은 하트비트가 끊는다"(11.4절)를 4-B 작업 중 다시
검토했다. Realtime private 채널의 구독 인가는 **연결 단위로 캐시**되고 새 JWT가 올 때만
재검사된다는 사실을 확인했고(공식 문서 재확인), 완화책(`jwt_expiry` 단축)과 그래도 남는
한계를 `docs/operations.md`에 별도로 정리했다 — 5단계에서 더 검토할 사항까지 포함.

## 변경 이력

- 2026-10-03: 1단계(설계) 초안 작성. 코드 없음.
- 2026-10-03: 1단계 설계 승인 후 사용자 피드백 반영, 2단계 착수 전 설계 수정 3건.
  1. **채팅방 생성 시점 수정** (4장, 5.1절, 5.2절, 6장): 수동 파티는 파티 생성(또는 첫 승인) 시점에 `chat_rooms`를 1개 생성하고, 지원이 승인된 멤버는 파티가 `recruiting`/`full`이어도 즉시 채팅 권한을 받도록 변경(지시서 7장 A). `confirmed`는 팀 확정 상태일 뿐 채팅 조건이 아님을 명시.
  2. **매칭 팀 통합** (4장, 5.1절, 5.4절): 빠른 매칭 제안이 `matched`로 전환되면 `parties`(`source='matching'`, `status='confirmed'`) + `party_role_slots` + `party_members`를 생성해 수동 파티와 동일한 테이블 구조를 쓰도록 변경. `chat_rooms`는 `parties`에만 1─1로 연결되도록 단순화. "활동당 사용자별 확정 팀 1개"는 `party_members`에 `activity_id`를 비정규화하고 `UNIQUE(activity_id, profile_id) WHERE is_confirmed = true` 부분 인덱스로 두 경로 모두 보장.
  3. **엔티티 보완** (4장): 지시서 11장의 엔티티 수를 "22개"에서 실제 목록 기준 "24개"로 정정(집계 오류 수정)하고, 운영/설정 그룹으로 `majors`(운영자 편집 가능, `is_demo` 플래그), `app_settings`(허용 이메일 도메인, 추천 가중치, 매칭 수락 기한), `user_roles`(관리자 권한, 프로필과 분리), `notifications.dedupe_key`(알림 중복 발송 방지 키)를 추가. 10장 2단계 완료 기준의 엔티티 수 표기도 동기화.
- 2026-10-04: 4-A단계(팀 채팅 + 앱 내 알림) 구현. 11장 신설 — DB 함수 경유 쓰기, Realtime 전달 방식을 postgres_changes에서 Broadcast-from-Database로 변경한 이유와 설계(수동 검증으로 "private 채널은 Postgres Changes에 적용되지 않는다"는 사실을 발견), 알림 방 단위 묶음·"보고 있으면 생성 안 함" 근사 구현, 탈퇴·강퇴 시 접근 차단(이미 열려 있는 연결 포함) 메커니즘, 메시지 링크화 방식을 기록.
- 2026-10-04: 4-B단계(빠른 매칭) 구현. 12장 신설 — 역할 구성 템플릿 스키마, 매칭 알고리즘을 TS 순수 함수(단위 테스트)와 plpgsql(실제 워커 경로, pg_cron이 Node를 호출할 수 없어 독립 재구현)로 이원화한 설계와 근거, 전체 공통 시간을 PostgreSQL 멀티레인지 연산자로 계산하는 방법, run_match_worker의 3단계 처리와 동시성 보장(SKIP LOCKED + 행 잠금 멱등 가드), 실제 구현 기준 상태 전이, Realtime 접근 차단 재검토(docs/operations.md로 연결) 기록.
