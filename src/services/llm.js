import { safeJsonParse } from '../utils/text.js';

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models';
const GROK_CHAT_COMPLETIONS_URL = 'https://api.x.ai/v1/chat/completions';
const GROQ_CHAT_COMPLETIONS_URL = 'https://api.groq.com/openai/v1/chat/completions';

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function buildNewsPrompt(candidates) {
  const compactCandidates = candidates.slice(0, 12).map((item, index) => ({
    id: index + 1,
    title: String(item.title ?? '').slice(0, 90),
    description: String(item.description ?? '').slice(0, 180),
    category: item.category,
    pubDate: item.pubDate,
    score: item.score
  }));

  return `아래 뉴스 후보 중 한국 사용자가 아침에 알면 좋은 주요 뉴스 최대 3개를 골라줘.

중요 규칙:
- 반드시 후보의 id만 선택한다.
- 후보에 없는 뉴스를 만들지 않는다.
- 같은 이슈는 하나로 합친다.
- 국제 안보/전쟁/공습/제재 기사는 전체에서 최대 1개만 선택한다. 같은 전쟁의 후속 발언, 공습, 유가 반응을 각각 별도 뉴스로 고르지 않는다.
- 지역 기관 홍보성 뉴스, 교육청/시청/구청/협약/행사 뉴스는 선택하지 않는다.
- 포토뉴스, 영상뉴스, 단순 발언 기사, 찬반 여론 기사만 선택하지 않는다.
- 반드시 다음 세 슬롯에서 각각 1개씩 선택한다.
  1) 경제: 금융, 금리, 기업, 산업, 증시 정책 등 경제 관련 뉴스 1개
  2) 국제: 글로벌 경제, 외교, 국제정세, 국제안보 등 국제 뉴스 1개
  3) 기타: 경제와 국제를 제외한 모든 분야에서 대중 관심도가 가장 높은 주요 뉴스 1개. IT/기술, 과학, 보건, 사회뿐 아니라 스포츠, 연예, 문화도 가능하다.
- 같은 뉴스가 두 슬롯을 모두 충족하더라도 한 슬롯에만 사용한다.
- 기타 슬롯은 조회수 데이터가 없으므로 여러 매체가 다룰 만한 화제성, 전국적 관심도, 최신성을 기준으로 고른다.
- 스포츠·연예·문화는 경기 결과, 우승, 국가대표, 흥행작, 수상, 대형 행사처럼 많은 사람이 관심을 가질 만한 경우 선택할 수 있다. 개인 사생활이나 홍보성 기사는 선택하지 않는다.
- 기타 슬롯을 경제나 국제 뉴스로 채우지 않는다. 적합한 기타 뉴스가 없으면 억지로 세 번째 뉴스를 만들지 않는다.
- 국제 안보/전쟁 분야는 중요도와 관계없이 1개를 넘기지 않는다.
- 사회 뉴스는 전국적 영향이 큰 사건, 제도 변화, 재난, 안전 이슈일 때만 선택한다.
- 비트코인 현물 ETF, 금리, 달러, 규제, 대형 거래소, 해킹, 기관 매수/매도, 반감기, 스테이블코인 규제처럼 시장 전체에 영향이 큰 가상화폐 이슈는 경제/금융 이슈로 선택할 수 있다.
- 단순 급등락, 특정 알트코인 홍보성 기사, 밈코인, 거래소 이벤트성 기사는 선택하지 않는다.
- 적합한 뉴스가 3개 미만이면 1개 또는 2개만 반환해도 된다.
- 선정 이유를 길게 설명하지 않는다.
- title과 description에 명시된 사실만 사용한다.
- 후보에 없는 배경, 전망, 원인, 수치, 평가를 추가하지 않는다.
- 환율, 미국 증시, 유가, 비트코인/이더리움 시세 흐름 같은 시장 점검성 항목은 단독 주요 뉴스로 억지로 선택하지 않는다. 큰 사건이나 정책 변화와 결합된 경우만 선택한다.
- 코스피/코스닥/유가/환율/비트코인 가격이 올랐다 또는 내렸다는 내용만 있는 후보는 선택하지 않는다.
- 시장 가격 흐름은 marketCheck에서 다룬다고 보고, 주요 뉴스에는 정책, 기업 실적, 산업 변화, 국제 이슈, 전국 영향 이슈를 우선한다.
- 같은 이슈나 같은 토픽은 최대 1개만 선택한다.
- 삼성전자/SK하이닉스/AI 반도체/메모리 반도체 관련 기사가 여러 개면 가장 대표적인 1개만 선택한다.
- 뉴스 3개가 모두 반도체, 증시, AI 같은 하나의 주제에 몰리지 않게 한다.
- original title은 최종 브리핑에 그대로 노출하지 않는다.
- briefTitle은 15~35자 정도의 자연스러운 한국어 문장 또는 명사형 제목으로 만든다.
- summary는 40자에서 80자 사이의 담백한 한 문장으로 쓴다.
- summary는 주어와 서술어가 갖춰진 완결된 문장으로 쓰고, 잘린 원문 조각을 이어 붙이지 않는다.
- topicKey는 같은 이슈를 식별할 수 있는 짧은 영어 키로 쓴다.
- 응답은 JSON만 반환한다.

JSON 형식:
{
  "items": [
    {
      "id": 1,
      "briefTitle": "브리핑용 짧은 제목",
      "summary": "아침 브리핑용 한 문장 요약",
      "topicKey": "short_topic_key"
    }
  ]
}

뉴스 후보:
${JSON.stringify(compactCandidates, null, 2)}`;
}

function buildWeatherPrompt(weather) {
  return `아래 Open-Meteo 기반 날씨 판단 데이터를 바탕으로 한국어 아침 날씨 브리핑을 작성해줘.

규칙:
- 3~5문장으로 작성한다.
- 위치명, 최저/최고기온, 현재 날씨, 오전/오후 강수확률을 자연스럽게 포함한다.
- 강수확률은 가능하면 숫자로 언급한다.
- 강수확률이 40% 이상이면 우산 조언을 자연스럽게 포함한다.
- 강수량이 많으면 "비가 꽤 올 수 있습니다" 또는 "강한 비에 주의가 필요합니다"처럼 표현한다.
- 강수량이 적으면 "약하게 지나갈 가능성이 있습니다" 정도로 표현한다.
- 새벽/저녁 특이사항이 있으면 출근길/퇴근길/늦은 귀가 관점으로 짧게 언급한다.
- dayContext.isRestDay가 true이면 출근길/퇴근길 표현을 쓰지 말고 외출, 이동, 늦은 귀가 관점으로 짧게 언급한다.
- dayContext.isRestDay가 false이면 출근길/퇴근길 관점으로 안내해도 된다.
- API 데이터에 없는 태풍, 호우특보, 폭설 같은 표현은 추가하지 않는다.
- 인사말, 날짜, 뉴스, 마무리 문장은 쓰지 않는다.
- 응답은 JSON만 반환한다.

JSON 형식:
{
  "briefing": "날씨 브리핑 문장"
}

날씨 데이터:
${JSON.stringify(weather, null, 2)}`;
}

function parseGeminiText(data) {
  return data?.candidates?.[0]?.content?.parts
    ?.map((part) => part.text)
    .filter(Boolean)
    .join('\n')
    .trim();
}

function parseChatCompletionText(data) {
  return data?.choices?.[0]?.message?.content?.trim();
}

function getNumericTokens(value = '') {
  return value.match(/\d+(?:\.\d+)?\s*(?:월|일|%|원|달러|조|억|만|선|배|년)?/g) ?? [];
}

function hasUnsupportedNumericToken(summary, originalText) {
  return getNumericTokens(summary).some((token) => !originalText.includes(token));
}

function getSafeNewsText(value, original) {
  const text = String(value ?? '').trim();
  const originalText = `${original.title ?? ''} ${original.description ?? ''}`;

  if (!text || hasUnsupportedNumericToken(text, originalText)) {
    return '';
  }

  return text;
}

function sanitizeNewsDisplayText(value = '') {
  return String(value ?? '')
    .replace(/\s+/g, ' ')
    .replace(/[…]{2,}|\.{3,}/g, '')
    .replace(/[?？]+/g, '')
    .trim();
}

function getLeadSentence(value = '') {
  const text = sanitizeNewsDisplayText(value);
  const lead = text.split(/[.!?。！？]/)[0] ?? text;
  return sanitizeNewsDisplayText(lead);
}

function getFallbackNewsSummary(original) {
  return getLeadSentence(original.title || original.description || '');
}

function isMarketMovementSummary(item) {
  const text = `${item.briefTitle ?? ''} ${item.summary ?? ''}`;
  const hasMarketTarget = /코스피|코스닥|나스닥|다우|S&P|환율|원\/달러|원\/엔|유가|국제유가|WTI|브렌트유|비트코인|이더리움/.test(text);
  const hasMovement = /급등|급락|상승|하락|강세|약세|마감|출발|돌파|후퇴|반등|조정|변동성|압박/.test(text);
  const hasSubstance = /정책|규제|관세|금리|연준|FOMC|실적|인수|합병|투자|공급망|파업|해킹|ETF|경상수지|수출|수입|무역수지|물가|고용|법안|제재|협상|계약|생산|공장/.test(text);

  return hasMarketTarget && hasMovement && !hasSubstance;
}

function normalizeSelectedNewsItem(selected, original) {
  const briefTitle = sanitizeNewsDisplayText(
    getSafeNewsText(selected.briefTitle, original) || compactTitle(original.title)
  );
  const summary = sanitizeNewsDisplayText(
    getSafeNewsText(selected.summary, original) || getFallbackNewsSummary(original)
  );
  const topicKey = String(selected.topicKey ?? '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]/g, '');

  if (!briefTitle || !summary) {
    return null;
  }

  return {
    title: original.title,
    originalTitle: original.title,
    briefTitle,
    summary,
    topicKey,
    category: original.category,
    link: original.link,
    pubDate: original.pubDate,
    source: 'llm'
  };
}

function compactTitle(value = '') {
  const text = sanitizeNewsDisplayText(value);

  if (text.length <= 70) {
    return text;
  }

  const shortened = text.slice(0, 70);
  const lastSpace = shortened.lastIndexOf(' ');
  return `${shortened.slice(0, lastSpace > 45 ? lastSpace : 70).trim()}…`;
}

async function generateGeminiJson(prompt, { maxOutputTokens = 700, temperature = 0.1 } = {}) {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite';

  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  const request = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [{ text: prompt }]
        }
      ],
      generationConfig: {
        temperature,
        maxOutputTokens,
        responseMimeType: 'application/json'
      }
    })
  };

  let response = await fetch(`${GEMINI_API_URL}/${model}:generateContent`, request);

  if (response.status === 429 || response.status === 503) {
    await wait(1200);
    response = await fetch(`${GEMINI_API_URL}/${model}:generateContent`, request);
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Gemini API failed: ${response.status} ${body}`);
  }

  const data = await response.json();
  const text = parseGeminiText(data);
  return text ? safeJsonParse(text) : null;
}

async function fetchChatCompletionJson(
  { providerName, url, apiKey, model, tokenField = 'max_tokens' },
  prompt,
  { maxOutputTokens = 700, temperature = 0.1 } = {}
) {
  if (!apiKey) {
    throw new Error(`${providerName} API key is not configured`);
  }

  const body = {
    model,
    messages: [
      {
        role: 'user',
        content: prompt
      }
    ],
    temperature,
    response_format: {
      type: 'json_object'
    }
  };

  body[tokenField] = maxOutputTokens;

  const request = {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(body)
  };

  let response = await fetch(url, request);

  if (response.status === 429 || response.status === 503) {
    await wait(1200);
    response = await fetch(url, request);
  }

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`${providerName} API failed: ${response.status} ${body}`);
  }

  const data = await response.json();
  const text = parseChatCompletionText(data);
  return text ? safeJsonParse(text) : null;
}

function getGroqApiKey() {
  const groqApiKey = process.env.GROQ_API_KEY;
  const grokApiKey = process.env.GROK_API_KEY;

  if (groqApiKey) {
    return groqApiKey;
  }

  return grokApiKey?.startsWith('gsk_') ? grokApiKey : null;
}

function getXaiApiKey() {
  const xaiApiKey = process.env.XAI_API_KEY;
  const grokApiKey = process.env.GROK_API_KEY;

  if (xaiApiKey) {
    return xaiApiKey;
  }

  return grokApiKey && !grokApiKey.startsWith('gsk_') ? grokApiKey : null;
}

async function generateGroqJson(prompt, options) {
  return fetchChatCompletionJson(
    {
      providerName: 'Groq',
      url: GROQ_CHAT_COMPLETIONS_URL,
      apiKey: getGroqApiKey(),
      model: process.env.GROQ_MODEL || process.env.GROK_MODEL || 'llama-3.1-8b-instant',
      tokenField: 'max_completion_tokens'
    },
    prompt,
    options
  );
}

async function generateXaiGrokJson(prompt, options) {
  return fetchChatCompletionJson(
    {
      providerName: 'xAI Grok',
      url: GROK_CHAT_COMPLETIONS_URL,
      apiKey: getXaiApiKey(),
      model: process.env.XAI_GROK_MODEL || process.env.GROK_MODEL || 'grok-4.3'
    },
    prompt,
    options
  );
}

async function generateLlmJson(prompt, { allowFallback = true, ...options } = {}) {
  try {
    return await generateGeminiJson(prompt, options);
  } catch (geminiError) {
    if (!allowFallback || (!getGroqApiKey() && !getXaiApiKey())) {
      throw geminiError;
    }

    console.error('[llm] Gemini failed, trying fallback LLM', geminiError);

    let fallbackError = geminiError;

    if (getGroqApiKey()) {
      try {
        return await generateGroqJson(prompt, options);
      } catch (groqError) {
        fallbackError = groqError;
        console.error('[llm] Groq failed, trying next fallback LLM', groqError);
      }
    }

    if (getXaiApiKey()) {
      return generateXaiGrokJson(prompt, options);
    }

    throw fallbackError;
  }
}

function getNewsDomain(item) {
  const text = `${item.category ?? ''} ${item.title ?? ''} ${item.briefTitle ?? ''} ${item.summary ?? ''}`;

  if (/국제\/안보|전쟁|공습|미사일|군사|이스라엘|이란|우크라이나|러시아|호르무즈/.test(text)) {
    return 'security';
  }
  if (/국제\/경제/.test(text)) {
    return 'global_economy';
  }
  if (/경제\/금융|경제\/산업/.test(text)) {
    return 'economy';
  }
  if (/IT\/산업|AI|인공지능|빅테크|소프트웨어|반도체/.test(text)) {
    return 'technology';
  }
  if (/과학\/보건|과학|의료|보건|환경|연구/.test(text)) {
    return 'science';
  }
  if (/대중\/화제|스포츠|문화\/연예/.test(text)) {
    return 'other';
  }
  if (/사회|재난|안전|제도/.test(text)) {
    return 'society';
  }
  return 'economy';
}

function getNewsEntityKey(item) {
  const text = `${item.title ?? ''} ${item.briefTitle ?? ''} ${item.summary ?? ''}`;
  const entities = [
    ['sk_hynix', /SK하이닉스/i],
    ['samsung_electronics', /삼성전자/i],
    ['nvidia', /엔비디아|NVIDIA/i],
    ['bitcoin', /비트코인/i],
    ['openai', /오픈AI|OpenAI/i]
  ];

  return entities.find(([, pattern]) => pattern.test(text))?.[0] ?? '';
}

function isOtherNews(item) {
  const domain = getNewsDomain(item);
  const text = `${item.title ?? ''} ${item.briefTitle ?? ''} ${item.summary ?? ''}`;
  const hasEconomicFocus = /삼성전자|SK하이닉스|현대차|테슬라|엔비디아|기업|상장|증시|주가|투자|실적|매출|수출|관세|금리|환율|유가|비트코인|이더리움|ETF|인수|합병|공급망|생산|공장|파운드리|메모리 세일즈/.test(text);
  const isInstitutionalStory = /연구원 설립|센터 설립|기관 설립|협약|간담회|포럼|세미나/.test(text);
  const hasBroadScienceImpact = /전국|국민|감염|질병|유행|백신|신약|치료|의료대란|기후|재난|안전|발견|승인|환경오염/.test(text);

  if (hasEconomicFocus || isInstitutionalStory) {
    return false;
  }

  if (domain === 'science') {
    return hasBroadScienceImpact;
  }

  return ['technology', 'society', 'other'].includes(domain);
}

function selectDiverseNews(items, limit = 3) {
  const selected = [];
  const usedEntityKeys = new Set();
  const slots = [
    (item) => getNewsDomain(item) === 'economy',
    (item) => ['global_economy', 'security'].includes(getNewsDomain(item)),
    (item) => isOtherNews(item)
  ];

  for (const matchesSlot of slots) {
    const item = items.find((candidate) => {
      const entityKey = getNewsEntityKey(candidate);
      return !selected.includes(candidate) &&
        matchesSlot(candidate) &&
        (!entityKey || !usedEntityKeys.has(entityKey));
    });

    if (item) {
      selected.push(item);
      const entityKey = getNewsEntityKey(item);
      if (entityKey) {
        usedEntityKeys.add(entityKey);
      }
    }
  }

  return selected.slice(0, limit);
}

export async function createWeatherBriefingWithGemini(weather) {
  const parsed = await generateLlmJson(buildWeatherPrompt(weather), {
    maxOutputTokens: 700,
    temperature: 0.2,
    allowFallback: false
  });

  const briefing = String(parsed?.briefing ?? '').trim();

  if (!briefing) {
    throw new Error('LLM weather response did not include briefing');
  }

  return briefing;
}

export async function selectTopNewsWithGemini(candidates = []) {
  if (candidates.length === 0) {
    return [];
  }

  const parsed = await generateLlmJson(buildNewsPrompt(candidates), {
    maxOutputTokens: 500,
    temperature: 0.1
  });

  if (!parsed?.items || !Array.isArray(parsed.items)) {
    throw new Error('LLM response did not include JSON items');
  }

  const usedTopicKeys = new Set();
  const normalizedSelected = parsed.items
    .slice(0, 3)
    .map((selected) => {
      const original = candidates[Number(selected.id) - 1];

      if (!original) {
        return null;
      }

      const normalized = normalizeSelectedNewsItem(selected, original);

      if (!normalized) {
        return null;
      }

      const { topicKey } = normalized;

      if (topicKey && usedTopicKeys.has(topicKey)) {
        return null;
      }

      if (topicKey) {
        usedTopicKeys.add(topicKey);
      }

      return normalized;
    })
    .filter(Boolean)
    .filter((item) => !isMarketMovementSummary(item));

  const selectedIds = new Set(
    normalizedSelected.map((item) => candidates.findIndex((candidate) => candidate.title === item.title))
  );
  const fallbackPadding = candidates
    .map((candidate, index) => ({ candidate, index }))
    .filter(({ candidate, index }) => !selectedIds.has(index))
    .map(({ candidate }) => ({
      title: candidate.title,
      originalTitle: candidate.title,
      briefTitle: compactTitle(candidate.title),
      summary: getFallbackNewsSummary(candidate),
      topicKey: '',
      category: candidate.category,
      link: candidate.link,
      pubDate: candidate.pubDate,
      source: 'naver'
    }))
    .filter((item) => !isMarketMovementSummary(item));

  const uniqueItems = [...normalizedSelected, ...fallbackPadding]
    .filter((item, index, array) => index === array.findIndex((other) => other.title === item.title));

  return selectDiverseNews(uniqueItems);
}
