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
  const compactCandidates = candidates.map((item, index) => ({
    id: index + 1,
    title: item.title,
    description: item.description,
    category: item.category,
    pubDate: item.pubDate,
    score: item.score,
    link: item.link
  }));

  return `아래 뉴스 후보 중 한국 사용자가 아침에 알면 좋은 주요 뉴스 최대 3개를 골라줘.

중요 규칙:
- 반드시 후보의 id만 선택한다.
- 후보에 없는 뉴스를 만들지 않는다.
- 같은 이슈는 하나로 합친다.
- 정치/정부/정당/국회/대통령/총리/장관/국무회의 관련 뉴스는 절대 선택하지 않는다.
- 지역 기관 홍보성 뉴스, 교육청/시청/구청/협약/행사 뉴스는 선택하지 않는다.
- 포토뉴스, 영상뉴스, 단순 발언 기사, 찬반 여론 기사, 일반 스포츠, 연예 뉴스는 선택하지 않는다.
- 기본 슬롯은 경제/금융/산업 1개, 국제/글로벌 경제 1개, IT/산업 또는 전국적 영향이 큰 사회 이슈 1개다.
- 특정 날에 경제 또는 국제 이슈가 매우 크면 같은 분야를 2개까지 선택해도 된다.
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

function getFallbackNewsSummary(original) {
  return String(original.description || original.title || '')
    .replace(/\s+/g, ' ')
    .trim();
}

function isMarketMovementSummary(item) {
  const text = `${item.briefTitle ?? ''} ${item.summary ?? ''}`;
  const hasMarketTarget = /코스피|코스닥|나스닥|다우|S&P|환율|원\/달러|원\/엔|유가|국제유가|WTI|브렌트유|비트코인|이더리움/.test(text);
  const hasMovement = /급등|급락|상승|하락|강세|약세|마감|출발|돌파|후퇴|반등|조정|변동성|압박/.test(text);
  const hasSubstance = /정책|규제|관세|금리|연준|FOMC|실적|인수|합병|투자|공급망|파업|해킹|ETF|경상수지|수출|수입|무역수지|물가|고용|법안|제재|협상|계약|생산|공장/.test(text);

  return hasMarketTarget && hasMovement && !hasSubstance;
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

    if (getGroqApiKey()) {
      return generateGroqJson(prompt, options);
    }

    return generateXaiGrokJson(prompt, options);
  }
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

  const parsed = await generateLlmJson(buildNewsPrompt(candidates));

  if (!parsed?.items || !Array.isArray(parsed.items)) {
    throw new Error('LLM response did not include JSON items');
  }

  const usedTopicKeys = new Set();

  return parsed.items
    .slice(0, 3)
    .map((selected) => {
      const original = candidates[Number(selected.id) - 1];

      if (!original) {
        return null;
      }

      const topicKey = String(selected.topicKey ?? '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9_-]/g, '');

      if (topicKey && usedTopicKeys.has(topicKey)) {
        return null;
      }

      if (topicKey) {
        usedTopicKeys.add(topicKey);
      }

      return {
        title: original.title,
        originalTitle: original.title,
        briefTitle: getSafeNewsText(selected.briefTitle, original),
        summary: getSafeNewsText(selected.summary, original) || getFallbackNewsSummary(original),
        topicKey,
        category: original.category,
        link: original.link,
        pubDate: original.pubDate,
        source: 'llm'
      };
    })
    .filter(Boolean)
    .filter((item) => !isMarketMovementSummary(item))
    .filter((item) => item.title && item.summary);
}
