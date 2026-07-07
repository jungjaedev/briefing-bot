import { selectTopNewsWithGemini } from './llm.js';
import { normalizeForDedup, stripHtml } from '../utils/text.js';

const NEWS_QUERIES = ['정치', '경제', '사회', '국제', '스포츠', 'IT 과학'];

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

async function fetchNaverNews(query, dateKey) {
  const params = new URLSearchParams({
    query,
    display: '5',
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
    category: query,
    isToday: isSameKoreanDate(item.pubDate, dateKey)
  }));
}

export async function getTopNews({ dateKey } = {}) {
  if (!process.env.NAVER_CLIENT_ID || !process.env.NAVER_CLIENT_SECRET) {
    return getMockNews(dateKey);
  }

  const nestedCandidates = await Promise.all(
    NEWS_QUERIES.map((query) => fetchNaverNews(query, dateKey))
  );

  const candidates = dedupeNews(nestedCandidates.flat())
    .sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));

  const todayCandidates = candidates.filter((item) => item.isToday);
  const usableCandidates = todayCandidates.length >= 3 ? todayCandidates : candidates;

  if (usableCandidates.length === 0) {
    return getMockNews(dateKey);
  }

  try {
    const selected = await selectTopNewsWithGemini(usableCandidates.slice(0, 30));
    return selected.length > 0 ? selected : fallbackTopNews(usableCandidates);
  } catch (error) {
    console.error('[news] Gemini selection failed, using Naver fallback', error);
    return fallbackTopNews(usableCandidates);
  }
}
