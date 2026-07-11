import { selectTopNewsWithGemini } from './llm.js';
import { normalizeForDedup, stripHtml } from '../utils/text.js';

const NEWS_QUERIES = [
  { query: '경제 증시 환율 금리', category: '경제/금융', display: '10' },
  { query: '반도체 삼성전자 SK하이닉스 AI', category: '경제/산업', display: '10' },
  { query: '미국 중국 일본 국제 경제', category: '국제/경제', display: '10' },
  { query: '연준 FOMC 관세 유가 국제', category: '국제/경제', display: '10' },
  { query: '미국 이란 이스라엘 중동 공습', category: '국제/안보', display: '10' },
  { query: '중동 호르무즈 이란 미국 국제유가', category: '국제/안보', display: '8' },
  { query: 'AI 빅테크 엔비디아 오픈AI', category: 'IT/산업', display: '8' },
  { query: '개인정보 사이버보안 플랫폼 통신 기술', category: 'IT/산업', display: '8' },
  { query: '과학 의료 보건 환경 기술 연구', category: '과학/보건', display: '8' },
  { query: '전국 재난 안전 제도 변화 사회', category: '사회', display: '8' },
  { query: '오늘 화제 주요 뉴스 사회 정치 문화 스포츠 연예', category: '대중/화제', display: '10' },
  { query: '스포츠 주요 경기 우승 국가대표', category: '스포츠', display: '8' },
  { query: '영화 방송 문화 콘텐츠 화제', category: '문화/연예', display: '8' },
  { query: '비트코인 ETF 규제 기관 투자', category: '경제/금융', display: '5' }
];

const EXCLUDE_KEYWORDS = [
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
  '비트코인', '현물 ETF', '스테이블코인', '대형 거래소', '해킹', '기관',
  '공습', '미사일', '핵시설', '호르무즈', '제재', '군사', '안보'
];

const NATIONAL_IMPACT_KEYWORDS = ['전국', '재난', '안전', '대형 사고', '제도 변화', '개편', '파업'];
const CRYPTO_EXCLUDE_KEYWORDS = ['밈코인', '알트코인', '에어드랍', '거래소 이벤트', '상장 이벤트'];
const CRYPTO_ALLOW_KEYWORDS = [
  '비트코인', '이더리움', '현물 ETF', '금리', '달러', '규제',
  '대형 거래소', '해킹', '기관', '반감기', '스테이블코인'
];
const MARKET_CHECK_ONLY_KEYWORDS = [
  '코스피', '코스닥', '나스닥', '다우', 'S&P', '환율', '원달러',
  '원/달러', '원엔', '원/엔', '유가', '국제유가', 'WTI',
  '브렌트유', '비트코인', '이더리움', '삼성전자', 'SK하이닉스'
];
const MARKET_MOVE_KEYWORDS = [
  '급등', '급락', '상승', '하락', '강세', '약세', '마감', '출발',
  '돌파', '후퇴', '반등', '조정', '흔들', '변동성'
];
const MARKET_NEWS_ALLOW_KEYWORDS = [
  '정책', '규제', '관세', '금리', '연준', 'FOMC', '실적',
  '인수', '합병', '투자', '공급망', '파업', '해킹', 'ETF',
  '경상수지', '수출', '수입', '무역수지', '물가', '고용',
  '법안', '제재', '협상', '계약', '생산', '공장',
  '중동', '이란', '이스라엘', '호르무즈', '공습', '미사일', '안보'
];
const INTERNATIONAL_SECURITY_KEYWORDS = [
  '미국', '이란', '이스라엘', '중동', '호르무즈', '공습',
  '미사일', '핵시설', '핵협상', '제재', '군사', '전쟁',
  '분쟁', '안보', '나토', '우크라이나', '러시아', '드론'
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
  return candidates
    .filter((item) => !isExcludedNews(item))
    .slice(0, 3)
    .map((item) => ({
    title: item.title,
    originalTitle: item.title,
    briefTitle: compactSummary(item.title),
    summary: compactSummary(item.title),
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
  const isLowQualityCrypto = hasAnyKeyword(text, CRYPTO_EXCLUDE_KEYWORDS);
  const isMarketCheckOnly =
    hasAnyKeyword(text, MARKET_CHECK_ONLY_KEYWORDS) &&
    hasAnyKeyword(text, MARKET_MOVE_KEYWORDS) &&
    !hasAnyKeyword(text, MARKET_NEWS_ALLOW_KEYWORDS);

  return hasExcludedKeyword ||
    isLowQualityCrypto ||
    isMarketCheckOnly;
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

  if (item.category === '국제/안보') {
    score += 10;
  }

  if (item.category === 'IT/산업') {
    score += 4;
  }

  if (item.category === '과학/보건') {
    score += 7;
  }

  if (['대중/화제', '스포츠', '문화/연예'].includes(item.category)) {
    score += 7;
  }

  if (hasAnyKeyword(text, INTERNATIONAL_SECURITY_KEYWORDS)) {
    score += 5;
  }

  if (hasAnyKeyword(text, CRYPTO_ALLOW_KEYWORDS)) {
    score += 2;
  }

  if (item.category === '사회' && hasAnyKeyword(text, NATIONAL_IMPACT_KEYWORDS)) {
    score += 7;
  }

  return score;
}

function prepareNewsCandidates(candidates) {
  const scoredCandidates = candidates
    .filter((item) => !isExcludedNews(item))
    .map((item) => ({ ...item, score: scoreNews(item) }))
    .filter((item) => item.score >= 6)
    .sort((a, b) => {
      if (b.score !== a.score) {
        return b.score - a.score;
      }

      return new Date(b.pubDate) - new Date(a.pubDate);
    });

  const categoryQueues = new Map();
  for (const candidate of scoredCandidates) {
    const queue = categoryQueues.get(candidate.category) ?? [];
    queue.push(candidate);
    categoryQueues.set(candidate.category, queue);
  }

  const balanced = [];
  while (balanced.length < 20 && [...categoryQueues.values()].some((queue) => queue.length > 0)) {
    for (const queue of categoryQueues.values()) {
      const candidate = queue.shift();
      if (candidate) {
        balanced.push(candidate);
      }
      if (balanced.length === 20) {
        break;
      }
    }
  }

  return balanced;
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
