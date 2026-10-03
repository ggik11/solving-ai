# 운영 노트 (초안)

> 5단계(운영·검증)에서 정식으로 채울 문서다. 지금은 4-B단계 작업 중 발견·검토한 항목 하나만
> 먼저 기록한다 — PROGRESS.md "알려진 제한" 참조.

## 탈퇴 후 이미 열린 Realtime 연결의 서버 측 차단 한계

### 배경

팀 채팅의 Realtime 전달은 Broadcast-from-Database + `realtime.messages` RLS로 구현돼 있다
(architecture.md 11.2절). 탈퇴·강퇴된 사용자는 `is_party_member()`가 더 이상 참이 아니므로
새 구독은 거부되고, `ChatRoomClient`의 15초 하트비트가 `mark_chat_read`를 호출해
`NOT_A_MEMBER`를 받으면 클라이언트가 스스로 구독을 끊는다(architecture.md 11.4절).

### 재검토 계기

4-B 작업 중 `@supabase/realtime-js`의 공식 문서를 다시 확인했다:

> "Client access policies are cached for the duration of the connection. Realtime updates the
> access policy cache for a client based on your RLS policies when a client connects to Realtime
> and subscribes to a Channel, **or when a new JWT is sent to Realtime from a client via the
> access_token message.**"

즉 private 채널의 구독 인가는 **연결마다 캐시**되고, **메시지마다 다시 검사되지 않는다** — 새
JWT가 전달될 때(최초 연결, 로그인, 토큰 갱신)만 재평가된다. `@supabase/supabase-js`
소스(`_handleTokenChanged`)를 확인하면 `TOKEN_REFRESHED`/`SIGNED_IN`/`INITIAL_SESSION` 이벤트마다
`realtime.setAuth(새_토큰)`을 호출해 이 캐시를 갱신시킨다 — 토큰 자동 갱신은 `jwt_expiry`
설정을 기준으로 그보다 먼저 일어난다.

**결론:** 브라우저 탭을 이미 열어 둔 채로 탈퇴·강퇴당한 사용자는, 클라이언트 JS(하트비트)가
정상 동작하는 한 곧바로 끊기지만(1차 방어선), 만약 그 JS가 변조되거나 실행되지 않는다면
(예: 오프라인, 확장프로그램 차단, 의도적 조작) **다음 토큰 갱신 시점까지는 이미 열린 구독으로
브로드캐스트를 계속 수신할 수 있다.** 이는 RLS 설계의 허점이 아니라 Realtime의 연결 단위
캐싱 동작 자체의 특성이다.

### 적용한 완화책

`supabase/config.toml`의 `jwt_expiry`를 기본값 3600초(1시간)에서 **300초(5분)**로 줄였다.
토큰이 더 자주 갱신되므로, 위 노출 구간(클라이언트 하트비트가 동작하지 않는 최악의 경우)이
**최대 1시간에서 최대 5분으로** 줄어든다.

- 트레이드오프: 인증 서버로 가는 토큰 갱신 요청이 더 잦아진다(세션당 1시간에 1번 → 5분에
  1번). 로컬/소규모 데모 스케일에서는 무시할 수 있는 비용이다.
- 이 값을 조정해도 **근본 해결은 아니다** — 아래 "남는 한계" 참조.

### 남는 한계 (완화 후에도 남는 것)

1. **완전한 즉시 차단이 아니다.** `jwt_expiry`를 아무리 줄여도 0초로는 못 만들므로, 이론상
   최대 `jwt_expiry`만큼의 메시지 수신 노출 구간이 항상 남는다. 완전히 없애려면 Realtime이
   메시지마다(또는 매우 짧은 주기로) 서버 쪽에서 연결을 강제로 재검사/차단하는 기능이
   필요한데, 표준 Supabase 클라이언트 API로는 "특정 연결을 서버에서 강제로 끊기"가 노출돼
   있지 않다(관리용 REST/함수로 별도 구현이 필요하며 이번 범위에서는 하지 않았다).
2. **전송(쓰기)은 이미 완전히 막혀 있다.** `send_chat_message`/`mark_chat_read`는 매 호출마다
   서버에서 멤버십을 다시 확인하므로(SECURITY DEFINER 함수, 캐시 없음), 탈퇴한 사용자는
   토큰 갱신을 기다릴 것도 없이 즉시 전송·읽음 처리를 할 수 없다. 이번 한계는 **수신(읽기)**
   에만 해당한다.
3. **실제 공격 가치가 낮다.** 수신만 가능하고 전송은 불가능하므로, 공격자가 얻는 것은 "이미
   알고 있던 채팅방에서 짧은 시간 동안 새 메시지를 더 보는 것"뿐이다 — 데모/MVP 위협
   모델에서는 낮은 심각도로 판단했다.
4. **5단계에서 재검토할 사항:** (a) `jwt_expiry`를 더 줄일지(예: 60초) 비용 대비 효과 측정,
   (b) Supabase Management API/Realtime Admin 채널로 특정 연결을 강제 종료하는 방법이
   생겼는지 확인, (c) 팀 이탈 이벤트 발생 시 해당 활동의 모든 구성원에게 `access_token`
   재전송을 강제로 트리거하는 클라이언트 측 보강(예: 브로드캐스트로 "재인증 필요" 신호를
   보내 즉시 `supabase.auth.refreshSession()`을 호출하게 하는 방법)의 실효성 검토.
