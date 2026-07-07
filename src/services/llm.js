import { safeJsonParse } from '../utils/text.js';

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

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
- 포토뉴스, 영상뉴스, 단순 발언 기사, 찬반 여론 기사는 선택하지 않는다.
- 경제와 국제 뉴스를 최우선으로 선택한다.
- 경제/국제 뉴스가 부족하면 IT/과학 대형 이슈만 선택한다.
- 적합한 뉴스가 3개 미만이면 1개 또는 2개만 반환해도 된다.
- 선정 이유를 길게 설명하지 않는다.
- title과 description에 명시된 사실만 사용한다.
- 후보에 없는 배경, 전망, 원인, 수치, 평가를 추가하지 않는다.
- summary는 35자에서 70자 사이의 담백한 한 문장으로 쓴다.
- 응답은 JSON만 반환한다.

JSON 형식:
{
  "items": [
    { "id": 1, "summary": "아침 브리핑용 한 문장 요약" }
  ]
}

뉴스 후보:
${JSON.stringify(compactCandidates, null, 2)}`;
}

function parseGeminiText(data) {
  return data?.candidates?.[0]?.content?.parts
    ?.map((part) => part.text)
    .filter(Boolean)
    .join('\n')
    .trim();
}

export async function selectTopNewsWithGemini(candidates = []) {
  const apiKey = process.env.GEMINI_API_KEY;
  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash-lite';

  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not configured');
  }

  if (candidates.length === 0) {
    return [];
  }

  const response = await fetch(`${GEMINI_API_URL}/${model}:generateContent`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-goog-api-key': apiKey
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [{ text: buildNewsPrompt(candidates) }]
        }
      ],
      generationConfig: {
        temperature: 0.1,
        maxOutputTokens: 700,
        responseMimeType: 'application/json'
      }
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Gemini API failed: ${response.status} ${body}`);
  }

  const data = await response.json();
  const text = parseGeminiText(data);
  const parsed = text ? safeJsonParse(text) : null;

  if (!parsed?.items || !Array.isArray(parsed.items)) {
    throw new Error('Gemini response did not include JSON items');
  }

  return parsed.items
    .slice(0, 3)
    .map((selected) => {
      const original = candidates[Number(selected.id) - 1];

      if (!original) {
        return null;
      }

      return {
        title: original.title,
        summary: String(selected.summary ?? '').trim(),
        category: original.category,
        link: original.link,
        pubDate: original.pubDate,
        source: 'gemini'
      };
    })
    .filter(Boolean)
    .filter((item) => item.title && item.summary);
}
