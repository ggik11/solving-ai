/**
 * 포스터 2차 후처리 2-A 키워드 규칙(가이드 12장, keywords-v1). datasets/keywords-v1.json의
 * 단어·가중치를 그대로 코드 상수로 옮긴 것이다 — 값을 바꾸지 않는다(바꾸려면 새 버전을 만든다).
 * 학습용 포스터 OCR 결과만 보고 만들었고 test 사진은 보지 않았다(datasets/keyword-review.md).
 */
import { normalizeText } from "./textNormalize";

export const KEYWORDS_VERSION = "keywords-v1";

export interface KeywordRule {
  classId: string;
  word: string;
  weight: number;
}

/** datasets/keywords-v1.json의 classes.*.weights.* 를 평탄화한 것 — 단어·가중치를 바꾸지 않는다. */
export const KEYWORD_RULES: KeywordRule[] = [
  { classId: "IT_ENGINEERING", word: "경진대회", weight: 1 },
  { classId: "IT_ENGINEERING", word: "디지털", weight: 1 },
  { classId: "IT_ENGINEERING", word: "드론", weight: 1 },
  { classId: "IT_ENGINEERING", word: "혁신", weight: 1 },
  { classId: "IT_ENGINEERING", word: "솔루션", weight: 1 },
  { classId: "IT_ENGINEERING", word: "기술", weight: 1 },
  { classId: "IT_ENGINEERING", word: "개발", weight: 2 },
  { classId: "IT_ENGINEERING", word: "공학", weight: 2 },
  { classId: "IT_ENGINEERING", word: "자동차", weight: 2 },
  { classId: "IT_ENGINEERING", word: "모빌리티", weight: 2 },
  { classId: "IT_ENGINEERING", word: "메타버스", weight: 2 },
  { classId: "IT_ENGINEERING", word: "IT", weight: 2 },
  { classId: "IT_ENGINEERING", word: "엔지니어", weight: 2 },
  { classId: "IT_ENGINEERING", word: "프로토타입", weight: 2 },
  { classId: "IT_ENGINEERING", word: "분석", weight: 2 },
  { classId: "IT_ENGINEERING", word: "이공계", weight: 2 },
  { classId: "IT_ENGINEERING", word: "과학기술", weight: 2 },
  { classId: "IT_ENGINEERING", word: "컴퓨터", weight: 2 },
  { classId: "IT_ENGINEERING", word: "플랫폼", weight: 2 },
  { classId: "IT_ENGINEERING", word: "테크", weight: 2 },
  { classId: "IT_ENGINEERING", word: "해커톤", weight: 3 },
  { classId: "IT_ENGINEERING", word: "데이터", weight: 3 },
  { classId: "IT_ENGINEERING", word: "인공지능", weight: 3 },
  { classId: "IT_ENGINEERING", word: "AI", weight: 3 },
  { classId: "IT_ENGINEERING", word: "알고리즘", weight: 3 },
  { classId: "IT_ENGINEERING", word: "코딩", weight: 3 },
  { classId: "IT_ENGINEERING", word: "프로그래밍", weight: 3 },
  { classId: "IT_ENGINEERING", word: "개발자", weight: 3 },
  { classId: "IT_ENGINEERING", word: "소프트웨어", weight: 3 },
  { classId: "IT_ENGINEERING", word: "SW", weight: 3 },
  { classId: "IT_ENGINEERING", word: "보안", weight: 3 },
  { classId: "IT_ENGINEERING", word: "해킹", weight: 3 },
  { classId: "IT_ENGINEERING", word: "빅데이터", weight: 3 },
  { classId: "IT_ENGINEERING", word: "머신러닝", weight: 3 },
  { classId: "IT_ENGINEERING", word: "딥러닝", weight: 3 },
  { classId: "IT_ENGINEERING", word: "데이콘", weight: 3 },
  { classId: "IT_ENGINEERING", word: "로봇", weight: 3 },
  { classId: "IT_ENGINEERING", word: "로보틱스", weight: 3 },
  { classId: "IT_ENGINEERING", word: "반도체", weight: 3 },
  { classId: "IT_ENGINEERING", word: "클라우드", weight: 3 },
  { classId: "IT_ENGINEERING", word: "앱개발", weight: 3 },
  { classId: "IT_ENGINEERING", word: "공공데이터", weight: 3 },
  { classId: "IT_ENGINEERING", word: "사이버", weight: 3 },
  { classId: "BUSINESS_PLANNING", word: "홍보", weight: 1 },
  { classId: "BUSINESS_PLANNING", word: "취업", weight: 1 },
  { classId: "BUSINESS_PLANNING", word: "직무", weight: 1 },
  { classId: "BUSINESS_PLANNING", word: "서포터즈", weight: 2 },
  { classId: "BUSINESS_PLANNING", word: "기획", weight: 2 },
  { classId: "BUSINESS_PLANNING", word: "블로그", weight: 2 },
  { classId: "BUSINESS_PLANNING", word: "컨설팅", weight: 2 },
  { classId: "BUSINESS_PLANNING", word: "기업", weight: 2 },
  { classId: "BUSINESS_PLANNING", word: "상품", weight: 2 },
  { classId: "BUSINESS_PLANNING", word: "경제", weight: 2 },
  { classId: "BUSINESS_PLANNING", word: "은행", weight: 2 },
  { classId: "BUSINESS_PLANNING", word: "보험", weight: 2 },
  { classId: "BUSINESS_PLANNING", word: "사업계획", weight: 2 },
  { classId: "BUSINESS_PLANNING", word: "인턴", weight: 2 },
  { classId: "BUSINESS_PLANNING", word: "마케팅", weight: 3 },
  { classId: "BUSINESS_PLANNING", word: "마케터", weight: 3 },
  { classId: "BUSINESS_PLANNING", word: "창업", weight: 3 },
  { classId: "BUSINESS_PLANNING", word: "스타트업", weight: 3 },
  { classId: "BUSINESS_PLANNING", word: "금융", weight: 3 },
  { classId: "BUSINESS_PLANNING", word: "투자", weight: 3 },
  { classId: "BUSINESS_PLANNING", word: "경영", weight: 3 },
  { classId: "BUSINESS_PLANNING", word: "비즈니스", weight: 3 },
  { classId: "BUSINESS_PLANNING", word: "브랜드", weight: 3 },
  { classId: "BUSINESS_PLANNING", word: "핀테크", weight: 3 },
  { classId: "BUSINESS_PLANNING", word: "증권", weight: 3 },
  { classId: "BUSINESS_PLANNING", word: "회계", weight: 3 },
  { classId: "BUSINESS_PLANNING", word: "재무", weight: 3 },
  { classId: "BUSINESS_PLANNING", word: "영업", weight: 3 },
  { classId: "BUSINESS_PLANNING", word: "커머스", weight: 3 },
  { classId: "BUSINESS_PLANNING", word: "인턴십", weight: 3 },
  { classId: "DESIGN_MEDIA", word: "유튜브", weight: 1 },
  { classId: "DESIGN_MEDIA", word: "인스타그램", weight: 1 },
  { classId: "DESIGN_MEDIA", word: "공모전", weight: 1 },
  { classId: "DESIGN_MEDIA", word: "콘텐츠", weight: 2 },
  { classId: "DESIGN_MEDIA", word: "미디어", weight: 2 },
  { classId: "DESIGN_MEDIA", word: "입선", weight: 2 },
  { classId: "DESIGN_MEDIA", word: "심사", weight: 2 },
  { classId: "DESIGN_MEDIA", word: "원화", weight: 2 },
  { classId: "DESIGN_MEDIA", word: "이미지", weight: 2 },
  { classId: "DESIGN_MEDIA", word: "아트", weight: 2 },
  { classId: "DESIGN_MEDIA", word: "광고제", weight: 2 },
  { classId: "DESIGN_MEDIA", word: "기사", weight: 2 },
  { classId: "DESIGN_MEDIA", word: "매거진", weight: 2 },
  { classId: "DESIGN_MEDIA", word: "틱톡", weight: 2 },
  { classId: "DESIGN_MEDIA", word: "모델링", weight: 2 },
  { classId: "DESIGN_MEDIA", word: "포스터", weight: 2 },
  { classId: "DESIGN_MEDIA", word: "디자인", weight: 3 },
  { classId: "DESIGN_MEDIA", word: "일러스트", weight: 3 },
  { classId: "DESIGN_MEDIA", word: "캐릭터", weight: 3 },
  { classId: "DESIGN_MEDIA", word: "굿즈", weight: 3 },
  { classId: "DESIGN_MEDIA", word: "웹툰", weight: 3 },
  { classId: "DESIGN_MEDIA", word: "영상", weight: 3 },
  { classId: "DESIGN_MEDIA", word: "사진", weight: 3 },
  { classId: "DESIGN_MEDIA", word: "미술", weight: 3 },
  { classId: "DESIGN_MEDIA", word: "캘리그라피", weight: 3 },
  { classId: "DESIGN_MEDIA", word: "조각", weight: 3 },
  { classId: "DESIGN_MEDIA", word: "회화", weight: 3 },
  { classId: "DESIGN_MEDIA", word: "그림", weight: 3 },
  { classId: "DESIGN_MEDIA", word: "출품", weight: 3 },
  { classId: "DESIGN_MEDIA", word: "작품", weight: 3 },
  { classId: "DESIGN_MEDIA", word: "전시", weight: 3 },
  { classId: "DESIGN_MEDIA", word: "크리에이터", weight: 3 },
  { classId: "DESIGN_MEDIA", word: "숏폼", weight: 3 },
  { classId: "DESIGN_MEDIA", word: "쇼츠", weight: 3 },
  { classId: "DESIGN_MEDIA", word: "미디어아트", weight: 3 },
  { classId: "DESIGN_MEDIA", word: "기자단", weight: 3 },
  { classId: "DESIGN_MEDIA", word: "에디터", weight: 3 },
  { classId: "DESIGN_MEDIA", word: "작가", weight: 3 },
  { classId: "DESIGN_MEDIA", word: "소설", weight: 3 },
  { classId: "DESIGN_MEDIA", word: "시나리오", weight: 3 },
  { classId: "DESIGN_MEDIA", word: "애니메이션", weight: 3 },
  { classId: "DESIGN_MEDIA", word: "촬영", weight: 3 },
  { classId: "DESIGN_MEDIA", word: "편집", weight: 3 },
  { classId: "DESIGN_MEDIA", word: "마스코트", weight: 3 },
  { classId: "SOCIAL_ENVIRONMENT", word: "교류", weight: 1 },
  { classId: "SOCIAL_ENVIRONMENT", word: "돌봄", weight: 1 },
  { classId: "SOCIAL_ENVIRONMENT", word: "청소년", weight: 2 },
  { classId: "SOCIAL_ENVIRONMENT", word: "지역사회", weight: 2 },
  { classId: "SOCIAL_ENVIRONMENT", word: "공익", weight: 2 },
  { classId: "SOCIAL_ENVIRONMENT", word: "사회공헌", weight: 2 },
  { classId: "SOCIAL_ENVIRONMENT", word: "지속가능", weight: 2 },
  { classId: "SOCIAL_ENVIRONMENT", word: "SDGs", weight: 2 },
  { classId: "SOCIAL_ENVIRONMENT", word: "ESG", weight: 2 },
  { classId: "SOCIAL_ENVIRONMENT", word: "재활용", weight: 2 },
  { classId: "SOCIAL_ENVIRONMENT", word: "플로깅", weight: 2 },
  { classId: "SOCIAL_ENVIRONMENT", word: "국제교류", weight: 2 },
  { classId: "SOCIAL_ENVIRONMENT", word: "통역", weight: 2 },
  { classId: "SOCIAL_ENVIRONMENT", word: "교육봉사", weight: 2 },
  { classId: "SOCIAL_ENVIRONMENT", word: "봉사", weight: 3 },
  { classId: "SOCIAL_ENVIRONMENT", word: "자원봉사", weight: 3 },
  { classId: "SOCIAL_ENVIRONMENT", word: "멘토링", weight: 3 },
  { classId: "SOCIAL_ENVIRONMENT", word: "멘토", weight: 3 },
  { classId: "SOCIAL_ENVIRONMENT", word: "멘티", weight: 3 },
  { classId: "SOCIAL_ENVIRONMENT", word: "환경", weight: 3 },
  { classId: "SOCIAL_ENVIRONMENT", word: "기후", weight: 3 },
  { classId: "SOCIAL_ENVIRONMENT", word: "탄소", weight: 3 },
  { classId: "SOCIAL_ENVIRONMENT", word: "친환경", weight: 3 },
  { classId: "SOCIAL_ENVIRONMENT", word: "생태", weight: 3 },
  { classId: "SOCIAL_ENVIRONMENT", word: "다문화", weight: 3 },
  { classId: "SOCIAL_ENVIRONMENT", word: "유기견", weight: 3 },
  { classId: "SOCIAL_ENVIRONMENT", word: "유기동물", weight: 3 },
  { classId: "SOCIAL_ENVIRONMENT", word: "아동", weight: 3 },
  { classId: "SOCIAL_ENVIRONMENT", word: "노인", weight: 3 },
  { classId: "SOCIAL_ENVIRONMENT", word: "어르신", weight: 3 },
  { classId: "SOCIAL_ENVIRONMENT", word: "장애인", weight: 3 },
  { classId: "SOCIAL_ENVIRONMENT", word: "복지관", weight: 3 },
  { classId: "SOCIAL_ENVIRONMENT", word: "사회복지", weight: 3 },
  { classId: "SOCIAL_ENVIRONMENT", word: "캠페인", weight: 3 },
  { classId: "SOCIAL_ENVIRONMENT", word: "기부", weight: 3 },
  { classId: "SOCIAL_ENVIRONMENT", word: "나눔", weight: 3 },
  { classId: "LAW_POLICY", word: "위원회", weight: 1 },
  { classId: "LAW_POLICY", word: "공공", weight: 1 },
  { classId: "LAW_POLICY", word: "정부", weight: 2 },
  { classId: "LAW_POLICY", word: "정책패널", weight: 2 },
  { classId: "LAW_POLICY", word: "토론", weight: 2 },
  { classId: "LAW_POLICY", word: "국제정치", weight: 2 },
  { classId: "LAW_POLICY", word: "거버넌스", weight: 2 },
  { classId: "LAW_POLICY", word: "조례", weight: 2 },
  { classId: "LAW_POLICY", word: "학술회의", weight: 2 },
  { classId: "LAW_POLICY", word: "법률", weight: 3 },
  { classId: "LAW_POLICY", word: "법학", weight: 3 },
  { classId: "LAW_POLICY", word: "법무", weight: 3 },
  { classId: "LAW_POLICY", word: "변호사", weight: 3 },
  { classId: "LAW_POLICY", word: "로스쿨", weight: 3 },
  { classId: "LAW_POLICY", word: "정책", weight: 3 },
  { classId: "LAW_POLICY", word: "국회", weight: 3 },
  { classId: "LAW_POLICY", word: "입법", weight: 3 },
  { classId: "LAW_POLICY", word: "외교", weight: 3 },
  { classId: "LAW_POLICY", word: "행정", weight: 3 },
  { classId: "LAW_POLICY", word: "권익", weight: 3 },
  { classId: "LAW_POLICY", word: "헌법", weight: 3 },
  { classId: "LAW_POLICY", word: "인권", weight: 3 },
  { classId: "LAW_POLICY", word: "재정", weight: 3 },
  { classId: "LAW_POLICY", word: "조세", weight: 3 },
  { classId: "LAW_POLICY", word: "국제법", weight: 3 },
  { classId: "LAW_POLICY", word: "해양법", weight: 3 },
  { classId: "LAW_POLICY", word: "모의재판", weight: 3 },
  { classId: "LAW_POLICY", word: "의정", weight: 3 },
  { classId: "CAMPUS_NOTICE", word: "재학생", weight: 1 },
  { classId: "CAMPUS_NOTICE", word: "학기", weight: 1 },
  { classId: "CAMPUS_NOTICE", word: "교내", weight: 2 },
  { classId: "CAMPUS_NOTICE", word: "학년도", weight: 2 },
  { classId: "CAMPUS_NOTICE", word: "학과", weight: 2 },
  { classId: "CAMPUS_NOTICE", word: "신입생", weight: 2 },
  { classId: "CAMPUS_NOTICE", word: "졸업예정", weight: 2 },
  { classId: "CAMPUS_NOTICE", word: "클리닉", weight: 2 },
  { classId: "CAMPUS_NOTICE", word: "학점", weight: 2 },
  { classId: "CAMPUS_NOTICE", word: "샘물", weight: 2 },
  { classId: "CAMPUS_NOTICE", word: "상명", weight: 3 },
  { classId: "CAMPUS_NOTICE", word: "생활관", weight: 3 },
  { classId: "CAMPUS_NOTICE", word: "학술정보관", weight: 3 },
  { classId: "CAMPUS_NOTICE", word: "비교과", weight: 3 },
  { classId: "CAMPUS_NOTICE", word: "교양교육원", weight: 3 },
  { classId: "CAMPUS_NOTICE", word: "현장실습", weight: 3 },
  { classId: "CAMPUS_NOTICE", word: "기숙사", weight: 3 },
  { classId: "CAMPUS_NOTICE", word: "학생상담센터", weight: 3 },
  { classId: "CAMPUS_NOTICE", word: "미래백년관", weight: 3 },
  { classId: "CAMPUS_NOTICE", word: "대학혁신지원", weight: 3 },
  { classId: "CAMPUS_NOTICE", word: "수강신청", weight: 3 },
  { classId: "HOBBY_CULTURE", word: "문화", weight: 1 },
  { classId: "HOBBY_CULTURE", word: "취미", weight: 2 },
  { classId: "HOBBY_CULTURE", word: "친목", weight: 2 },
  { classId: "HOBBY_CULTURE", word: "정기모임", weight: 2 },
  { classId: "HOBBY_CULTURE", word: "문화생활", weight: 2 },
  { classId: "HOBBY_CULTURE", word: "음악", weight: 2 },
  { classId: "HOBBY_CULTURE", word: "게임", weight: 2 },
  { classId: "HOBBY_CULTURE", word: "심리", weight: 2 },
  { classId: "HOBBY_CULTURE", word: "상담", weight: 2 },
  { classId: "HOBBY_CULTURE", word: "역사", weight: 2 },
  { classId: "HOBBY_CULTURE", word: "체험", weight: 2 },
  { classId: "HOBBY_CULTURE", word: "동아리", weight: 3 },
  { classId: "HOBBY_CULTURE", word: "소모임", weight: 3 },
  { classId: "HOBBY_CULTURE", word: "오디션", weight: 3 },
  { classId: "HOBBY_CULTURE", word: "부원", weight: 3 },
  { classId: "HOBBY_CULTURE", word: "러닝", weight: 3 },
  { classId: "HOBBY_CULTURE", word: "클라이밍", weight: 3 },
  { classId: "HOBBY_CULTURE", word: "요가", weight: 3 },
  { classId: "HOBBY_CULTURE", word: "주짓수", weight: 3 },
  { classId: "HOBBY_CULTURE", word: "수영", weight: 3 },
  { classId: "HOBBY_CULTURE", word: "야구", weight: 3 },
  { classId: "HOBBY_CULTURE", word: "축구", weight: 3 },
  { classId: "HOBBY_CULTURE", word: "농구", weight: 3 },
  { classId: "HOBBY_CULTURE", word: "보드게임", weight: 3 },
  { classId: "HOBBY_CULTURE", word: "북콘서트", weight: 3 },
  { classId: "HOBBY_CULTURE", word: "밴드", weight: 3 },
  { classId: "HOBBY_CULTURE", word: "오케스트라", weight: 3 },
  { classId: "HOBBY_CULTURE", word: "공연", weight: 3 },
  { classId: "HOBBY_CULTURE", word: "연극", weight: 3 },
  { classId: "HOBBY_CULTURE", word: "뮤지컬", weight: 3 },
  { classId: "HOBBY_CULTURE", word: "콘서트", weight: 3 },
  { classId: "HOBBY_CULTURE", word: "축제", weight: 3 },
  { classId: "HOBBY_CULTURE", word: "페스티벌", weight: 3 },
  { classId: "HOBBY_CULTURE", word: "영화", weight: 3 },
  { classId: "HOBBY_CULTURE", word: "여행", weight: 3 },
  { classId: "HOBBY_CULTURE", word: "인문학", weight: 3 },
  { classId: "HOBBY_CULTURE", word: "독서", weight: 3 },
];

export interface KeywordClassification {
  /** classId -> 가중치 합을 전체 합으로 나눈 분포(합 1). */
  distribution: Record<string, number>;
  /** 걸린 키워드 원문 목록(중복 제거, 클래스 구분 없이) — 근거 표시·matched_keywords 저장용. */
  matchedKeywords: string[];
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

const HANGUL_RE = /[가-힣]/;

/**
 * 텍스트(OCR·제목·설명을 합친 원문)를 키워드 사전으로 분류한다. 한글 키워드는 공백을 제거한
 * 텍스트(matchKey)에서 부분 문자열로 찾고, 영문·숫자 키워드는 소문자로 바꾼 뒤 단어 경계로 찾는다
 * (공백이 남아 있는 normalized 텍스트를 써야 "AI"가 "mail"처럼 안쪽에 낀 경우를 피하면서도 공백으로만
 * 구분된 두 영단어의 경계를 안다). 키워드는 문서당 1번만 센다. 걸린 게 없으면 null.
 */
export function classifyByKeywords(text: string): KeywordClassification | null {
  const { normalized, matchKey } = normalizeText(text);
  const classWeightSums = new Map<string, number>();
  const matchedKeywords: string[] = [];

  for (const rule of KEYWORD_RULES) {
    const isKorean = HANGUL_RE.test(rule.word);
    const matched = isKorean
      ? matchKey.includes(rule.word)
      : new RegExp(`\\b${escapeRegExp(rule.word.toLowerCase())}\\b`, "i").test(normalized);

    if (!matched) continue;
    classWeightSums.set(rule.classId, (classWeightSums.get(rule.classId) ?? 0) + rule.weight);
    matchedKeywords.push(rule.word);
  }

  if (matchedKeywords.length === 0) return null;

  const total = [...classWeightSums.values()].reduce((a, b) => a + b, 0);
  const distribution: Record<string, number> = {};
  for (const [classId, weight] of classWeightSums) distribution[classId] = weight / total;

  return { distribution, matchedKeywords };
}
