import { selectTopNewsWithGemini } from './llm.js';
import { normalizeForDedup, stripHtml } from '../utils/text.js';

const NEWS_QUERIES = [
  { query: '경제 증시 환율 금리', category: '경제/금융', display: '10' },
  { query: '반도체 삼성전자 SK하이닉스 AI', category: '경제/산업', display: '10' },
  { query: '미국 중국 일본 국제 경제', category: '국제/경제', display: '10' },
  { query: '연준 FOMC 관세 유가 국제', category: '국제/경제', display: '10' },
  { query: 'AI 빅테크 엔비디아 오픈AI', category: 'IT/산업', display: '8' },
  { query: '비트코인 ETF 규제 기관 투자', category: '경제/금융', display: '5' }
];

const EXCLUDE_KEYWORDS = [
  '대통령', '국무회의', '총리', '부총리', '장관', '차관',
  '국회', '국회의원', '민주당', '국민의힘', '조국혁신당',
  '선거', '공천', '탄핵', '특검', '청문회', '정당',
  '[포토]', '포토', '영상', '오늘의 사진', '말말말',
  '교육청', '시교육청', '도교육청', '구청', '시청', '도청',
  '군청', '도의회', '시의회', '지자체', '업무협약', '협약 체결',
  '상반기 재정', '신속 집행', '지원 총력', '성장펀드',
  '구축사업 선정', '정식 가동', '성과급', '간담회',
  '열애', '결혼', '이혼'
];

const LOW_PRIORITY_KEYWORDS = [
  '무임승차', '지하철', '버스', '교육청', '지자체',
  '지역경제', '행사', '캠페인', '모집', '선정',
  '간담회', '토론회', '축제', '포털', '맞손',
  '업무협약', '협약', '로컬기업', '지역거점',
  '마감 시황', '개장 시황', '외환브리핑', '시황'
];

const HIGH_PRIORITY_KEYWORDS = [
  '금리', '물가', '코스피', '코스닥', '증시',
  '부동산', '청약', '대출', '반도체',
  '삼성전자', 'SK하이닉스', '현대차', '테슬라',
  'AI', '엔비디아', '연준', 'FOMC', '미국', '중국',
  '일본', '유럽', '중동', '우크라이나', '이스라엘',
  '이란', '트럼프', '관세', '나토', '빅테크',
  '비트코인', '현물 ETF', '스테이블코인', '대형 거래소', '해킹', '기관'
];

const SPORTS_KEYWORDS = ['축구', '야구', '농구', '배구', '골프', 'K리그', 'MLB', 'NBA'];
const SPORTS_ALLOW_KEYWORDS = ['월드컵', '올림픽', '국가대표', '결승', '우승', '아시안게임'];
const NATIONAL_IMPACT_KEYWORDS = ['전국', '재난', '안전', '대형 사고', '제도 변화', '개편', '파업'];
const CRYPTO_EXCLUDE_KEYWORDS = ['밈코인', '알트코인', '에어드랍', '거래소 이벤트', '상장 이벤트'];
const CRYPTO_ALLOW_KEYWORDS = [
  '비트코인', '이더리움', '현물 ETF', '금리', '달러', '규제',
  '대형 거래소', '해킹', '기관', '반감기', '스테이블코인'
];
const MARKET_CHECK_ONLY_KEYWORDS = [
  '코스피', '코스닥', '나스닥', '다우', 'S&P', '환율', '원달러',
  '원/달러', '원엔', '원/엔', '유가', '국제유가', 'WTI',
  '브렌트유', '비트코인', '이더리움'
];
const MARKET_MOVE_KEYWORDS = [
  '급등', '급락', '상승', '하락', '강세', '약세', '마감', '출발',
  '돌파', '후퇴', '반등', '조정', '흔들', '변동성'
];
const MARKET_NEWS_ALLOW_KEYWORDS = [
  '정책', '규제', '관세', '금리', '연준', 'FOMC', '실적',
  '인수', '합병', '투자', '공급망', '파업', '해킹', 'ETF',
  '경상수지', '수출', '수입', '무역수지', '물가', '고용',
  '반도체', 'AI', '삼성전자', 'SK하이닉스'
];

function getMockNews(dateKey) {
  return [
    {
      title: '국내 주요 경제 지표 발표를 앞두고 시장의 관망세가 이어지고 있습니다.',
      source: 'mock',
      dateKey
    },
    {
      title: '글로벌 시장은 금리와 유가 흐름을 주시하고 있습니다.',
      source: 'mock',
      dateKey
    },
    {
      title: '주요 기술 기업들이 인공지능 서비스 고도화 계획을 발표했습니다.',
      source: 'mock',
      dateKey
    }
  ];
}

function isSameKoreanDate(pubDate, dateKey) {
  if (!pubDate || !dateKey) {
    return false;
  }

  const formatted = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(new Date(pubDate));

  return formatted === dateKey;
}

function compactSummary(value = '') {
  const normalized = value.replace(/\s+/g, ' ').trim();

  if (normalized.length <= 90) {
    return normalized;
  }

  return `${normalized.slice(0, 87)}...`;
}

function fallbackTopNews(candidates) {
  return candidates.slice(0, 3).map((item) => ({
    title: item.title,
    summary: compactSummary(item.description || item.title),
    category: item.category,
    link: item.link,
    pubDate: item.pubDate,
    source: 'naver'
  }));
}

function getNewsText(item) {
  return `${item.title ?? ''} ${item.description ?? ''}`;
}

function includesKeyword(text, keyword) {
  return text.toLowerCase().includes(keyword.toLowerCase());
}

function hasAnyKeyword(text, keywords) {
  return keywords.some((keyword) => includesKeyword(text, keyword));
}

function isExcludedNews(item) {
  const text = getNewsText(item);
  const hasExcludedKeyword = hasAnyKeyword(text, EXCLUDE_KEYWORDS);
  const isSports = hasAnyKeyword(text, SPORTS_KEYWORDS);
  const isAllowedSports = hasAnyKeyword(text, SPORTS_ALLOW_KEYWORDS);
  const isLowQualityCrypto = hasAnyKeyword(text, CRYPTO_EXCLUDE_KEYWORDS);
  const isMarketCheckOnly =
    hasAnyKeyword(text, MARKET_CHECK_ONLY_KEYWORDS) &&
    hasAnyKeyword(text, MARKET_MOVE_KEYWORDS) &&
    !hasAnyKeyword(text, MARKET_NEWS_ALLOW_KEYWORDS);

  return hasExcludedKeyword || isLowQualityCrypto || isMarketCheckOnly || (isSports && !isAllowedSports);
}

function scoreNews(item) {
  const text = getNewsText(item);
  let score = 0;

  for (const keyword of HIGH_PRIORITY_KEYWORDS) {
    if (includesKeyword(text, keyword)) {
      score += 3;
    }
  }

  for (const keyword of LOW_PRIORITY_KEYWORDS) {
    if (includesKeyword(text, keyword)) {
      score -= 3;
    }
  }

  if (item.category === '경제/금융' || item.category === '경제/산업') {
    score += 7;
  }

  if (item.category === '국제/경제') {
    score += 7;
  }

  if (item.category === 'IT/산업') {
    score += 4;
  }

  if (hasAnyKeyword(text, CRYPTO_ALLOW_KEYWORDS)) {
    score += 2;
  }

  if (item.category === '사회' && hasAnyKeyword(text, NATIONAL_IMPACT_KEYWORDS)) {
    score += 2;
  }

  return score;
}

function prepareNewsCandidates(candidates) {
  return candidates
    .filter((item) => !isExcludedNews(item))
    .map((item) => ({ ...item, score: scoreNews(item) }))
    .filter((item) => item.score >= 6)
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }

      return new Date(b.pubDate) - new Date(a.pubDate);
    })
    .slice(0, 20);
}

function dedupeNews(items) {
  const seen = new Set();
  const deduped = [];

  for (const item of items) {
    const titleKey = normalizeForDedup(item.title).slice(0, 90);
    const linkKey = item.link ? item.link.trim() : '';

    if (!titleKey || seen.has(`title:${titleKey}`) || (linkKey && seen.has(`link:${linkKey}`))) {
      continue;
    }

    seen.add(`title:${titleKey}`);
    if (linkKey) {
      seen.add(`link:${linkKey}`);
    }
    deduped.push(item);
  }

  return deduped;
}

async function fetchNaverNews({ query, category, display }, dateKey) {
  const params = new URLSearchParams({
    query,
    display,
    start: '1',
    sort: 'date'
  });

  const response = await fetch(`https://openapi.naver.com/v1/search/news.json?${params}`, {
    headers: {
      'X-Naver-Client-Id': process.env.NAVER_CLIENT_ID,
      'X-Naver-Client-Secret': process.env.NAVER_CLIENT_SECRET
    }
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Naver News API failed: ${response.status} ${body}`);
  }

  const data = await response.json();

  return (data.items ?? []).map((item) => ({
    title: stripHtml(item.title),
    description: stripHtml(item.description),
    link: item.originallink || item.link,
    pubDate: item.pubDate,
    category,
    isToday: isSameKoreanDate(item.pubDate, dateKey)
  }));
}

export async function getTopNews({ dateKey } = {}) {
  if (!process.env.NAVER_CLIENT_ID || !process.env.NAVER_CLIENT_SECRET) {
    return getMockNews(dateKey);
  }

  const nestedCandidates = await Promise.all(
    NEWS_QUERIES.map((queryConfig) => fetchNaverNews(queryConfig, dateKey))
  );

  const candidates = dedupeNews(nestedCandidates.flat())
    .sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

  const todayCandidates = candidates.filter((item) => item.isToday);
  const usableCandidates = todayCandidates.length >= 3 ? todayCandidates : candidates;
  const preparedCandidates = prepareNewsCandidates(usableCandidates);

  if (preparedCandidates.length === 0) {
    return getMockNews(dateKey);
  }

  try {
    const selected = await selectTopNewsWithGemini(preparedCandidates);
    return selected.length > 0 ? selected : fallbackTopNews(preparedCandidates);
  } catch (error) {
    console.error('[news] LLM selection failed, using Naver fallback', error);
    return fallbackTopNews(preparedCandidates);
  }
}
