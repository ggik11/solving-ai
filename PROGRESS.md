# PROGRESS

## 완료 범위

- **1단계(설계)만 완료.** 지시서(`Claude_상명대_대외활동_플랫폼_개발프롬프트.md`) 12장의 2~5단계(기반/핵심/매칭·소통/운영·검증)는 아직 착수하지 않았다.
- 산출물: `docs/architecture.md` 초안(화면 흐름, ERD, 상태 전이도, 권한표, 추천 계산식, 매칭 알고리즘 설계, 기술 버전 확인, 상명대 공식 정보 확인, 2~5단계 작업 분할 포함), `PROGRESS.md`(본 문서).
- 코드, 패키지 설치, DB 마이그레이션은 아직 생성하지 않았다.

## 실제 실행한 검증과 결과

### 환경 점검 (명령 실행, 2026-10-03)
| 명령 | 결과 |
|---|---|
| `node --version` | v24.19.0 |
| `npm --version` | 11.17.0 |
| `git --version` | 2.55.0.windows.5 |
| `docker --version` | 실패 — `docker: command not found` (미설치) |
| `npx supabase --version` | 2.119.0 (npx가 자동 설치 후 실행 성공) |

### 저장소 구조 확인
`package.json`, `src/`, `supabase/`, `docs/`(작업 전), `README.md`, `.env.example`이 존재하지 않는 그린필드 상태임을 확인(`Glob` 조회). `.claude/`, `.claude-flow/`, `.swarm/`, `.mcp.json`, `CLAUDE.md`, 지시서 md 파일만 존재.

### Ruflo 라우팅 확인
작업 전 `guidance_brain(mode: recommend)`와 `memory_search`를 호출했다. 이 저장소에 대한 기존 메모리는 0건(신규 프로젝트). 추천된 구현 루프는 범용 루프이며, 문서 작성 단계에는 스웜 구성이 불필요하다고 판단해 단일 작업자가 직접 두 문서를 작성했다.

### 공식 자료 조사 (WebSearch/WebFetch, 2026-10-03)
| 항목 | 확인 상태 | 출처 |
|---|---|---|
| Next.js 안정 버전 | 확인됨 — 16.3.8 | https://nextjs.org/docs |
| @supabase/supabase-js 안정 버전 | 확인됨 — 2.117.2 (2026-09-25 릴리스) | https://github.com/supabase/supabase-js/releases |
| Supabase CLI 버전 | 확인됨 — 2.119.0 | 로컬 `npx supabase --version` 실행 |
| 상명대 공식 이메일 도메인 | 부분 확인 — 기관 도메인 `smu.ac.kr` 사용 확인, 학생 웹메일 발급 정책 문서는 미확보 | https://www.smu.ac.kr (학과별 페이지), 시도한 `/smfamily/etc/email.do`, `/koredu/etc/email.do`는 무관한 상용구 페이지로 확인됨 |
| 서울캠퍼스 전공 목록 | 부분 확인 — 5개 단과대학/20개 학부(과)/22개 전공 수는 확인, 전공 전체 명칭 목록은 미확보 | https://www.smu.ac.kr/ko/intro/collegeStatus.do |
| 에브리타임 공식 API/OAuth | 미확인(존재하지 않는다는 확정 아님) | 공개 웹 검색 결과 공식 개발자 문서 미발견 |

## 외부 설정이 필요한 부분 (2단계 착수 전)

1. **Docker Desktop 설치 필요.** `supabase start`(로컬 Supabase 스택)는 Docker가 필요하나 현재 환경에 미설치.
2. **상명대 학생 이메일 도메인 정책 확정 필요.** 자동 조회로 공식 안내 페이지 본문을 확보하지 못했다. 운영자가 정확한 도메인(들)을 확인해 설정값에 반영해야 한다(기본 시드값은 `smu.ac.kr`로 임시 지정, 실제 운영 전 검증 필요).
3. **서울캠퍼스 전공 전체 명칭 목록 확정 필요.** 22개 전공 중 수치만 확인했고 개별 명칭은 미확보. 운영자가 공식 홈페이지 단과대학별 페이지를 참고해 전체 목록을 채워야 한다.
4. **에브리타임 공식 제휴/API 여부 지속 확인 필요.** 현재는 "미확인" 상태로, 공식 문서가 공개되기 전까지 연동 기능을 구현하지 않는다.
5. (2단계 이후) Supabase 프로젝트(로컬/클라우드) 생성, 이메일 전송 테스트 환경(로컬 Inbucket 등) 준비는 2단계 작업 범위.

## 다음 명령 (2단계 승인 시)

사용자 승인 후 지시서 12장 2단계(기반)에 착수: Next.js+TS 프로젝트 초기화 → `.env.example` 작성 → Supabase 마이그레이션(22개 엔티티 + RLS) → 이메일 OTP/매직링크 로그인 → 프로필 온보딩 → 개발 시드(활동 20개 이상) → 활동 관리자 CRUD·CSV → 활동 탐색/상세 구현. 상세 범위와 완료 기준은 `docs/architecture.md` 10장 참조.

## 실행하지 못한 검증

이번 단계는 문서 작성만 수행했으므로 코드 관련 테스트(lint/typecheck/test/build)는 해당 사항 없음(아직 코드가 없음). 2단계부터 각 단계 완료 시 실제 실행 결과를 본 문서에 갱신한다.
