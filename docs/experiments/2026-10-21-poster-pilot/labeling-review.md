# 포스터 라벨링 검토 (초안 v5, 2026-10-20)

원본 폴더: `C:\Users\ggik\Pictures\대외활동학습용사진` (180장). 사용자 검토(v4의 `//` 표기)를 모두 반영했다. 삭제 표시한 5장은 원본 폴더의 `_삭제예정` 하위 폴더로 옮겼다. 확인 후 `datasets/manifest.csv`로 저장한다.

## 클래스 (pilot-7-v1)

| 라벨 | 이름 | 범위 |
|---|---|---|
| IT_ENGINEERING | IT·공학 | 개발·데이터·AI·보안, 자동차·로봇 등 공학, IT 자격증 스터디 |
| BUSINESS_PLANNING | 경영·기획 | 마케팅·창업·금융·서비스 기획, 브랜드 홍보 서포터즈 |
| DESIGN_MEDIA | 디자인·예술·미디어 | 디자인(캐릭터·굿즈·제품·포스터)·영상·웹툰·기사, 순수 미술·캘리그라피·문학 공모 |
| SOCIAL_ENVIRONMENT | 사회·환경 | 봉사·멘토링·교육봉사·환경 활동, 국제교류 캠프 |
| LAW_POLICY | 법·정책 | 법학·법률 교육, 정책 제안·패널, 외교·정치·재정 |
| CAMPUS_NOTICE | 교내 행정 공지 | 학교 부서가 재학생에게 안내하는 프로그램·신청 공지 |
| HOBBY_CULTURE | 취미·문화생활 | 운동·취미·문화 동아리와 소모임, 공연·음악축제·북콘서트·인문학 행사, 참여형 체험 |

## 라벨 규칙

- 참가자가 주로 하는 일·제출하는 것을 기준으로 정한다.
- 단순 참관 행사도 주제가 가장 가까운 분야로 넣는다(공연·축제·인문학 행사는 취미·문화생활).
- 그림·조각·캘리그라피·문학 공모는 디자인·예술·미디어.
- 운동·취미·문화 동아리와 소모임 → 취미·문화생활. 어학 동아리는 기타(OOD).
- 같은 시리즈 포스터는 같은 split에 둔다(series_id).

## 분야별 개수

| 분야 | train | test | 합계 |
|---|---:|---:|---:|
| IT_ENGINEERING (IT·공학) | 33 | 7 | 40 |
| BUSINESS_PLANNING (경영·기획) | 17 | 5 | 22 |
| DESIGN_MEDIA (디자인·예술·미디어) | 30 | 8 | 38 |
| SOCIAL_ENVIRONMENT (사회·환경) | 32 | 7 | 39 |
| LAW_POLICY (법·정책) | 6 | 2 | 8 |
| CAMPUS_NOTICE (교내 행정 공지) | 6 | 2 | 8 |
| HOBBY_CULTURE (취미·문화생활) | 20 | 4 | 24 |
| OOD(기타) | — | — | 1 |
| 합계 | | | 180 |

## 삭제(`_삭제예정` 폴더로 이동)

- `947989.jpg`
- `948008.jpg`
- `964345.jpg`
- `964378.png`
- `everytime-1792404947908.jpg`

## test로 고른 새 항목

- `952032.jpg`
- `963201.png`
- `965961.png`
- `966466.jpg`
- `everytime-1789533321755.jpg`
- `everytime-1791278128636.jpg`
- `everytime-1792202924154.jpg`

## 전체 목록

| 파일 | 라벨 | split | 메모 |
|---|---|---|---|
| `912716.jpg` | IT_ENGINEERING | test | DATA·AI 분석 경진대회 |
| `949887.jpg` | IT_ENGINEERING | test | AI 라이프 솔루션 챌린지 |
| `961786.png` | IT_ENGINEERING | test | OOD→재배치 (로보틱스 작품 공모전(공학)) |
| `963097.jpg` | IT_ENGINEERING | test | 정보보안 취약점 발굴 공모전 |
| `965475.png` | IT_ENGINEERING | test | 알고리즘 경진대회 |
| `965934.png` | IT_ENGINEERING | test | OOD→재배치 (디지털혁신 포럼) |
| `everytime-web-1786107387247.jpg` | IT_ENGINEERING | test | 대학생 해커톤 |
| `910266.png` | IT_ENGINEERING | train | 앱 제작 프로젝트 서포터즈, 작은 배너 이미지 |
| `936393.jpg` | IT_ENGINEERING | train | 데이터+AI 혁신챌린지 - 데이터 문제해결 |
| `936615.jpg` | IT_ENGINEERING | train | 데이터+AI 혁신챌린지 - 데이터안심구역 |
| `940712.png` | IT_ENGINEERING | train | OOD→재배치 (산업AI 엑스포(관람)) |
| `944494.png` | IT_ENGINEERING | train | 사용자 지정(보류→) (마이 AI랩 - 무엇을 하는 프로그램인지 포스터에 정보가 거의 없음) |
| `947625.jpg` | IT_ENGINEERING | train | OOD→재배치 (자작 미래자동차 경진대회(공학)) |
| `949427.png` | IT_ENGINEERING | train | AI·데이터사이언스 경진대회 |
| `951145.jpg` | IT_ENGINEERING | train | 항만 AI 기술 공모전 |
| `953988.jpg` | IT_ENGINEERING | train | AI 에이전트 공모전 |
| `955332.jpg` | IT_ENGINEERING | train | AI 해커톤 |
| `956010.png` | IT_ENGINEERING | train | OOD→재배치 (AI 체험 축제(일반 시민 대상)) |
| `958314.png` | IT_ENGINEERING | train | AI 플랫폼 구축 경진대회 |
| `959067.png` | IT_ENGINEERING | train | 사용자 지정(보류→) (R&D 아이디어 공모전 - 기술 아이디어 기획이라 IT·경영 사이) |
| `959616.webp` | IT_ENGINEERING | train | AI 메이커톤, 작은 이미지 |
| `960398.png` | IT_ENGINEERING | train | AI·데이터 배터리 교육과정 |
| `960475.jpg` | IT_ENGINEERING | train | 기후·환경 공공데이터 AI 활용대회 (부가: 환경) |
| `960730.png` | IT_ENGINEERING | train | OOD→재배치 (오션테크코리아 컨퍼런스) |
| `962608.jpg` | IT_ENGINEERING | train | 화이트햇 콘테스트(보안) |
| `963399.png` | IT_ENGINEERING | train | 청년 AI 해커톤, 작은 이미지 |
| `964265.png` | IT_ENGINEERING | train | AI 데이터 분석 스터디 |
| `964305.png` | IT_ENGINEERING | train | 공공 AI 서비스 국민평가단 |
| `965253.jpg` | IT_ENGINEERING | train | 디지털 엑설런스 어워드 - AI 서비스·디지털 디자인 부문 혼합, 세로로 긴 이미지 (사용자 지정) |
| `966377.png` | IT_ENGINEERING | train | OOD→재배치 (서울미래컨퍼런스) |
| `966523.png` | IT_ENGINEERING | train | 데이터 활용 해커톤, 작은 이미지 |
| `966611.png` | IT_ENGINEERING | train | 가상융합 모의 해커톤, 작은 이미지 |
| `everytime-1651022415068.jpg` | IT_ENGINEERING | train | 빅데이터 프로젝트 경진대회 |
| `everytime-1739844171616.jpg` | IT_ENGINEERING | train | 자바 클라우드 풀스택 취업훈련 |
| `everytime-1745381659842.jpg` | IT_ENGINEERING | train | AI 반도체 취업연계 교육 |
| `everytime-1759302321504.jpg` | IT_ENGINEERING | train | OOD→재배치 (미래자동차 포럼) |
| `everytime-1789816835951.jpg` | IT_ENGINEERING | train | AI 도구 홍보 콘텐츠 (사용자 지정) |
| `everytime-1789957163452.jpg` | IT_ENGINEERING | train | REST API 개발 프로젝트 |
| `everytime-1790917067890.jpg` | IT_ENGINEERING | train | OOD→재배치 (AI 특강) |
| `everytime-1791879448313.jpg` | IT_ENGINEERING | train | 컴활 스터디 (사용자 지정) |
| `897469.jpg` | BUSINESS_PLANNING | test | 서비스 개선 아이디어 제안(가로형 배너) |
| `962901.png` | BUSINESS_PLANNING | test | 마케팅 SNS 에디터 |
| `966737.png` | BUSINESS_PLANNING | test | 스타트업 마케팅 전략 수립 |
| `967037.png` | BUSINESS_PLANNING | test | OOD→재배치 (STO 금융 컨퍼런스) |
| `everytime-1789093723944.jpg` | BUSINESS_PLANNING | test | 문화·마케팅 동아리 |
| `873400.png` | BUSINESS_PLANNING | train | 사용자 지정(보류→) (HR·교육 분야 기업연계 활동 연결 서비스 - 활동 자체가 불분명) |
| `944816.png` | BUSINESS_PLANNING | train | 핀테크 스타트업 창업멤버 모집, 작은 이미지 |
| `951377.jpg` | BUSINESS_PLANNING | train | 금융 교육과정 - 교육형이라 애매 |
| `960217.png` | BUSINESS_PLANNING | train | 실험실 창업 경진대회 |
| `960635.png` | BUSINESS_PLANNING | train | 금융 실무 교육과정 - 교육형이라 애매 |
| `961396.jpg` | BUSINESS_PLANNING | train | 화장품 브랜드 서포터즈(마케팅) |
| `962287.png` | BUSINESS_PLANNING | train | 금융영업 캠퍼스 |
| `962428.png` | BUSINESS_PLANNING | train | 브랜드 서포터즈(마케팅) |
| `962464.png` | BUSINESS_PLANNING | train | 행사 홍보 서포터즈 |
| `965080.jpg` | BUSINESS_PLANNING | train | 뷰티 브랜드 서포터즈(마케팅) |
| `965751.png` | BUSINESS_PLANNING | train | 사용자 지정(보류→) (핀테크 취업 멘토링 - 단순 참관 행사인지 금융(경영) 활동인지 애매) |
| `966159.jpg` | BUSINESS_PLANNING | train | OOD→재배치 (스타트업 커리어 토크) |
| `everytime-1740644287836.jpg` | BUSINESS_PLANNING | train | 국제포럼 홍보 서포터즈 |
| `everytime-1744089853776.jpg` | BUSINESS_PLANNING | train | 데이터 기반 디지털 마케팅 교육 |
| `everytime-1773375632124.jpg` | BUSINESS_PLANNING | train | AI 사무자동화 마케터 과정 |
| `everytime-1788354816947.jpg` | BUSINESS_PLANNING | train | 경영전략 학회 |
| `everytime-1789001894901.jpg` | BUSINESS_PLANNING | train | 마케팅 연구 소모임 |
| `950149.png` | DESIGN_MEDIA | test | 굿즈 디자인 콘테스트 |
| `958801.png` | DESIGN_MEDIA | test | 축제 포스터 공모전 |
| `960223.png` | DESIGN_MEDIA | test | 틱톡 크리에이터단 |
| `962870.png` | DESIGN_MEDIA | test | 기념우표 디자인 공모전 |
| `965607.png` | DESIGN_MEDIA | test | 관광 영상 콘텐츠 크리에이티브 멤버십 |
| `965961.png` | DESIGN_MEDIA | test | 청소년 미술 공모전(순수예술) (사용자 지정) |
| `966466.jpg` | DESIGN_MEDIA | test | 조각 공모전(순수예술) (사용자 지정) |
| `everytime-1754380839342.jpg` | DESIGN_MEDIA | test | 웹툰 공모전 |
| `857309.jpg` | DESIGN_MEDIA | train | 3D 모델링 디자인 공모전 |
| `907990.jpg` | DESIGN_MEDIA | train | 전시회 홍보 서포터즈 |
| `943925.jpg` | DESIGN_MEDIA | train | 2027 국악누리 표지 그림(일러스트) 공모 |
| `947393.png` | DESIGN_MEDIA | train | K-슈즈 메이킹 챌린지(신발 디자인) |
| `949377.jpg` | DESIGN_MEDIA | train | 캘리그라피 공모전(순수예술) (사용자 지정) |
| `949640.jpg` | DESIGN_MEDIA | train | 마스코트 일러스트 공모전 |
| `951075.png` | DESIGN_MEDIA | train | 반려용품 디자인 공모전 |
| `952703.jpg` | DESIGN_MEDIA | train | 어린이·청소년 미술대회(순수예술) (사용자 지정) |
| `953471.png` | DESIGN_MEDIA | train | 기자단(기사·콘텐츠 작성) |
| `955939.png` | DESIGN_MEDIA | train | 캐릭터 공모전 |
| `956784.jpg` | DESIGN_MEDIA | train | 관광기념품 공모전(제품 디자인, 부가: 경영) |
| `958383.png` | DESIGN_MEDIA | train | DDP 청년 크리에이터(일러스트) 입점 공모 |
| `960213.png` | DESIGN_MEDIA | train | 마을돌봄 그림·사진 공모전(주제는 복지) |
| `960510.png` | DESIGN_MEDIA | train | 주거실태조사 영상(쇼츠)·포스터 공모전 |
| `960542.png` | DESIGN_MEDIA | train | SF 소설 공모전(문학) (사용자 지정) |
| `961308.png` | DESIGN_MEDIA | train | 드론 콘텐츠 디자인 공모전 |
| `962041.jpg` | DESIGN_MEDIA | train | 전시 지원 공모(순수예술) (사용자 지정) |
| `962458.png` | DESIGN_MEDIA | train | 생물 체험 교구 개발 공모전 - 교육·생태 주제, 4개 분야와 애매 (사용자 지정) |
| `962866.png` | DESIGN_MEDIA | train | 대구국제디자인어워드 |
| `963415.png` | DESIGN_MEDIA | train | 사용자 지정(보류→) (커리어 브랜딩 대외활동 - 무엇을 하는지 포스터만으로 불분명) |
| `964327.jpg` | DESIGN_MEDIA | train | 신진작가 소개전(순수예술) (사용자 지정) |
| `964570.png` | DESIGN_MEDIA | train | 숏폼 크리에이터·출연진 |
| `964929.jpg` | DESIGN_MEDIA | train | ZINE(소책자) 제작 워크숍 |
| `965499.png` | DESIGN_MEDIA | train | 웹툰·웹소설 창작위크 |
| `965834.png` | DESIGN_MEDIA | train | 아트쇼 참여 작가 공모(순수예술) (사용자 지정) |
| `965913.jpg` | DESIGN_MEDIA | train | 한글날 참여 안내문(행사 안내) (사용자 지정) |
| `965967.png` | DESIGN_MEDIA | train | 미디어파사드 미디어아트(영상) 공모전 |
| `966862.png` | DESIGN_MEDIA | train | AI 플레이 콘텐츠 제작 공모전, 작은 이미지 |
| `everytime-1739953442160.jpg` | DESIGN_MEDIA | train | 숏드라마 공모전 |
| `everytime-1791338863446.jpg` | DESIGN_MEDIA | train | AI 광고제(광고물 제작) |
| `926492.png` | SOCIAL_ENVIRONMENT | test | 한국어 교육 자원활동 |
| `931306.png` | SOCIAL_ENVIRONMENT | test | 사용자 지정(보류→) (KOICA 해외봉사단 지원 컨설팅 - 봉사가 아니라 지원 준비 상담) |
| `943121.png` | SOCIAL_ENVIRONMENT | test | 공익런 자원봉사 |
| `952032.jpg` | SOCIAL_ENVIRONMENT | test | 장애인 기부 러닝 행사 (사용자 지정) |
| `964867.png` | SOCIAL_ENVIRONMENT | test | 사용자 지정(보류→) (UN산업개발기구 통역 자원봉사 - 통역(어학) 중심이라 4개 분야 밖) |
| `966430.png` | SOCIAL_ENVIRONMENT | test | 환경 캠페인 서포터즈 |
| `everytime-1737098229130.jpg` | SOCIAL_ENVIRONMENT | test | 경제교육 봉사단 |
| `848098.jpg` | SOCIAL_ENVIRONMENT | train | 대학생 진로 멘토 |
| `892756.jpg` | SOCIAL_ENVIRONMENT | train | 해외 한류캠프 (사용자 지정) |
| `918016.png` | SOCIAL_ENVIRONMENT | train | 물·환경 논문 공모전 |
| `923762.png` | SOCIAL_ENVIRONMENT | train | 성폭력예방 인형극 강사 봉사 |
| `927720.jpg` | SOCIAL_ENVIRONMENT | train | 디지털 교육 봉사 |
| `927828.jpg` | SOCIAL_ENVIRONMENT | train | 어르신 디지털 교육 보조 봉사 |
| `935714.png` | SOCIAL_ENVIRONMENT | train | 진로 탐색 멘토 |
| `937474.jpg` | SOCIAL_ENVIRONMENT | train | 몽골 해외봉사 |
| `937480.jpg` | SOCIAL_ENVIRONMENT | train | 캄보디아 건축봉사 |
| `938250.png` | SOCIAL_ENVIRONMENT | train | 교육봉사 멘토 |
| `945660.png` | SOCIAL_ENVIRONMENT | train | 캠페인 자원봉사 |
| `948122.jpg` | SOCIAL_ENVIRONMENT | train | 유기견 해외이동 봉사 |
| `948124.png` | SOCIAL_ENVIRONMENT | train | 유기견 쉼터 봉사 |
| `952958.png` | SOCIAL_ENVIRONMENT | train | 자격증 교재 베타리더 (사용자 지정) |
| `961139.png` | SOCIAL_ENVIRONMENT | train | 영화제 자원활동가 |
| `961468.jpg` | SOCIAL_ENVIRONMENT | train | 한일 대학생 교류캠프 (사용자 지정) |
| `961757.png` | SOCIAL_ENVIRONMENT | train | 청소년 멘토링 봉사 |
| `961815.jpg` | SOCIAL_ENVIRONMENT | train | 사용자 지정(보류→) (해외 인턴십(비즈니스·마케팅·디자인) - 유료 인턴십 프로그램, 분야 혼합) |
| `961847.png` | SOCIAL_ENVIRONMENT | train | 유기견 보호소 봉사 |
| `963434.png` | SOCIAL_ENVIRONMENT | train | 마케팅 모집 - 정보가 적음 |
| `964100.jpg` | SOCIAL_ENVIRONMENT | train | 박람회 자원봉사 |
| `965058.png` | SOCIAL_ENVIRONMENT | train | 도서관 자원봉사 서포터즈 |
| `965066.png` | SOCIAL_ENVIRONMENT | train | 영화제 자원활동가 |
| `966749.jpg` | SOCIAL_ENVIRONMENT | train | 공연 자원봉사 |
| `everytime-1721198629060.jpg` | SOCIAL_ENVIRONMENT | train | 사용자 지정(보류→) (디지털 심화쟁점 토론대회 - IT 주제 + 정책 토론이라 애매) |
| `everytime-1736258284994.jpg` | SOCIAL_ENVIRONMENT | train | 기후변화 대응 정책 연구 |
| `everytime-1789020245271.jpg` | SOCIAL_ENVIRONMENT | train | 사용자 지정(보류→) (농식품 창업콘테스트 결선 시상식 - 참가가 아니라 관람 행사) |
| `everytime-1789204799831.jpg` | SOCIAL_ENVIRONMENT | train | 교내 고양이 돌봄 동아리 |
| `everytime-1789375994351.jpg` | SOCIAL_ENVIRONMENT | train | 공익활동 커뮤니티 |
| `everytime-1789443425741.jpg` | SOCIAL_ENVIRONMENT | train | 전공 강연 교육봉사 |
| `everytime-1790668699245.jpg` | SOCIAL_ENVIRONMENT | train | 사용자 지정(보류→) (사진 동아리 - 취미 동아리인지 미디어 활동인지 애매) |
| `everytime-1792063200042.jpg` | SOCIAL_ENVIRONMENT | train | 청소년 진로교육 멘토 |
| `844027.png` | LAW_POLICY | test | 청년·청소년 정책대응위원회 |
| `everytime-1791984732512.jpg` | LAW_POLICY | test | 청년정책 공모전 |
| `939038.jpg` | LAW_POLICY | train | 청년 정책패널 |
| `960960.jpg` | LAW_POLICY | train | OOD→재배치 (해양법 국제학술회의) |
| `961899.png` | LAW_POLICY | train | OOD→재배치 (공공외교학회 학술회의) |
| `966846.png` | LAW_POLICY | train | OOD→재배치 (국가재정 온라인 강의) |
| `everytime-1753494703352.jpg` | LAW_POLICY | train | OOD→재배치 (국제정치 컨퍼런스) |
| `everytime-1789879075804.jpg` | LAW_POLICY | train | 사용자 지정(보류→) (법률 교육기부 멘토 - 법·교육 분야라 4개 분야 밖) |
| `everytime-1683595571355.jpg` | CAMPUS_NOTICE | test | OOD→재배치 (학술정보관 행사) |
| `everytime-web-1790922996337.jpg` | CAMPUS_NOTICE | test | OOD→재배치 (기숙사 모집 공고) |
| `everytime-1620093856843.jpg` | CAMPUS_NOTICE | train | OOD→재배치 (국어 클리닉) |
| `everytime-1683105211921.jpg` | CAMPUS_NOTICE | train | OOD→재배치 (생활관 행사) |
| `everytime-1699234534485.jpg` | CAMPUS_NOTICE | train | OOD→재배치 (심리검사데이) |
| `everytime-1791963216575.jpg` | CAMPUS_NOTICE | train | OOD→재배치 (심리검사데이) |
| `everytime-1792137132160.jpg` | CAMPUS_NOTICE | train | OOD→재배치 (현장실습학기제) |
| `everytime-web-1743664492518.jpg` | CAMPUS_NOTICE | train | OOD→재배치 (비교과 설명회) |
| `963201.png` | HOBBY_CULTURE | test | 세계음악축제 (사용자 지정) |
| `everytime-1789533321755.jpg` | HOBBY_CULTURE | test | 주짓수 동아리 (사용자 지정) |
| `everytime-1791278128636.jpg` | HOBBY_CULTURE | test | 밴드 공연 (사용자 지정) |
| `everytime-1792202924154.jpg` | HOBBY_CULTURE | test | 독서 모임 (사용자 지정) |
| `961867.png` | HOBBY_CULTURE | train | 메리오케스트라 (사용자 지정) |
| `everytime-1728955823286.jpg` | HOBBY_CULTURE | train | 북콘서트 (사용자 지정) |
| `everytime-1744864433491.jpg` | HOBBY_CULTURE | train | 인문학 그랜드투어 (사용자 지정) |
| `everytime-1787895945470.jpg` | HOBBY_CULTURE | train | 수영 지도자 동아리 (사용자 지정) |
| `everytime-1788253197143.jpg` | HOBBY_CULTURE | train | 연극 동아리 (사용자 지정) |
| `everytime-1788418565994.jpg` | HOBBY_CULTURE | train | 게임 동아리 (사용자 지정) |
| `everytime-1788442133343.jpg` | HOBBY_CULTURE | train | 일본어 스터디 (사용자 지정) |
| `everytime-1788503065703.jpg` | HOBBY_CULTURE | train | 불교 동아리 (사용자 지정) |
| `everytime-1788961355226.jpg` | HOBBY_CULTURE | train | 심리상담 서비스 (사용자 지정) |
| `everytime-1789456143423.jpg` | HOBBY_CULTURE | train | 문화생활 동아리 (사용자 지정) |
| `everytime-1789556381636.jpg` | HOBBY_CULTURE | train | 요가 클래스 (사용자 지정) |
| `everytime-1789999315029.jpg` | HOBBY_CULTURE | train | 클라이밍 소모임 (사용자 지정) |
| `everytime-1790414087183.jpg` | HOBBY_CULTURE | train | 기부 러닝 (사용자 지정) |
| `everytime-1790607375949.jpg` | HOBBY_CULTURE | train | 야구 직관 동아리 (사용자 지정) |
| `everytime-1790933939417.jpg` | HOBBY_CULTURE | train | 심리학 실험 참가자 (사용자 지정) |
| `everytime-1790998941663.jpg` | HOBBY_CULTURE | train | 러닝 동아리 (사용자 지정) |
| `everytime-1791956269906.jpg` | HOBBY_CULTURE | train | 영화 소모임 (사용자 지정) |
| `everytime-1792099780886.jpg` | HOBBY_CULTURE | train | 보드게임 동아리 (사용자 지정) |
| `everytime-1792291271019.jpg` | HOBBY_CULTURE | train | 역사기행 소모임 (사용자 지정) |
| `everytime-1792291419030.jpg` | HOBBY_CULTURE | train | 독서 모임 (사용자 지정) |
| `everytime-1792373028730.jpg` | OOD | ood | 영어회화 동아리 (기타) |
