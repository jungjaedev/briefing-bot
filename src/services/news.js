import { selectTopNewsWithGemini } from './llm.js';
import { normalizeForDedup, stripHtml } from '../utils/text.js';

const NEWS_QUERIES = [
  { query: '경제 증시 환율 금리', category: '경제', display: '10' },
  { query: '반도체 삼성전자 SK하이닉스 AI', category: '경제', display: '10' },
  { query: '부동산 대출 물가 유가', category: '경제', display: '8' },
  { query: '미국 중국 일본 국제 경제', category: '국제', display: '10' },
  { query: '연준 FOMC 관세 유가 국제', category: '국제', display: '10' },
  { query: 'AI 빅테크 엔비디아 오픈AI', category: 'IT/과학', display: '8' }
];

const EXCLUDE_KEYWORDS = [
  '대통령', '국무회의', '총리', '부총리', '장관', '차관',
  '국회', '국회의원', '민주당', '국민의힘', '조국혁신당',
  '선거', '공천', '탄핵', '특검', '청문회',
  '[포토]', '포토', '영상', '오늘의 사진',
  '교육청', '시교육청', '도교육청', '구청', '시청',
  '군청', '도의회', '시의회', '업무협약', '협약 체결',
  '상반기 재정', '신속 집행', '지원 총력', '성장펀드',
  '구축사업 선정', '정식 가동',
  '열애', '결혼', '이혼', '축구', '야구', '농구'
];

const LOW_PRIORITY_KEYWORDS = [
  '무임승차', '지하철', '버스', '교육청', '지자체',
  '지역경제', '행사', '캠페인', '모집', '선정',
  '간담회', '토론회', '축제', '포털', '맞손',
  '업무협약', '협약', '로컬기업', '지역거점'
];

const HIGH_PRIORITY_KEYWORDS = [
  '환율', '금리', '물가', '코스피', '코스닥', '증시',
  '부동산', '청약', '대출', '유가', '반도체',
  '삼성전자', 'SK하이닉스', '현대차', '테슬라',
  'AI', '엔비디아', '연준', 'FOMC', '미국', '중국',
  '일본', '유럽', '중동', '우크라이나', '이스라엘',
  '이란', '트럼프', '관세', '나토', '빅테크'
];

function getMockNews(dateKey) {
  return [
    {
      title: '국내 주요 경제 지표 발표를 앞두고 시장의 관망세가 이어지고 있습니다.',
      source: 'mock',
      dateKey
    },
    {
      title: '정부가 여름철 전력 수급 대책을 점검하고 안정적인 공급 계획을 밝혔습니다.',
      source: 'mock',
      dateKey
    },
    {
      title: '주요 기술 기업들이 인공지능 서비스 고도화 계획을 잇달아 발표했습니다.',
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

function fallbackTopNews(candidates) {
  return candidates.slice(0, 3).map((item) => ({
    title: item.title,
    summary: item.description || item.title,
    category: item.category,
    source: 'naver'
  }));
}

function getNewsText(item) {
  return `${item.title ?? ''} ${item.description ?? ''}`;
}

function includesKeyword(text, keyword) {
  return text.toLowerCase().includes(keyword.toLowerCase());
}

function isExcludedNews(item) {
  const text = getNewsText(item);
  return EXCLUDE_KEYWORDS.some((keyword) => includesKeyword(text, keyword));
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

  if (item.category === '경제') {
    score += 6;
  }

  if (item.category === '국제') {
    score += 6;
  }

  if (item.category === 'IT/과학') {
    score += 2;
  }

  return score;
}

function prepareNewsCandidates(candidates) {
  return candidates
    .filter((item) => !isExcludedNews(item))
    .map((item) => ({ ...item, score: scoreNews(item) }))
    .filter((item) => item.score >= 5)
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
    const key = normalizeForDedup(item.title).slice(0, 80);
    if (!key || seen.has(key)) {
      continue;
    }

    seen.add(key);
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
    console.error('[news] Gemini selection failed, using Naver fallback', error);
    return fallbackTopNews(preparedCandidates);
  }
}
