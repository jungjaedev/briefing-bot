import { safeJsonParse } from '../utils/text.js';

const GEMINI_API_URL = 'https://generativelanguage.googleapis.com/v1beta/models';

function buildNewsPrompt(candidates) {
  const compactCandidates = candidates.map((item, index) => ({
    id: index + 1,
    title: item.title,
    description: item.description,
    category: item.category,
    pubDate: item.pubDate,
    link: item.link
  }));

  return `아래 뉴스 후보 중 한국 사용자가 아침에 알면 좋은 주요 뉴스 3개를 골라줘.

규칙:
- 반드시 후보 안에서만 고른다.
- 같은 이슈는 하나로 합친다.
- 정치 뉴스는 제외한다.
- 경제와 국제 뉴스를 우선한다.
- 가능하면 경제/국제 뉴스에서 2개 이상 고른다.
- 사회, IT/과학, 스포츠는 매우 중요한 이슈일 때만 1개까지 포함한다.
- 선정 이유를 길게 설명하지 않는다.
- title과 description에 명시된 사실만 사용한다.
- 후보에 없는 배경, 전망, 원인, 수치, 평가를 추가하지 않는다.
- summary는 35자에서 70자 사이의 담백한 한 문장으로 쓴다.
- 응답은 JSON만 반환한다.

JSON 형식:
{
  "items": [
    { "title": "뉴스 제목", "summary": "아침 브리핑용 한 문장 요약", "category": "분야" }
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
        temperature: 0.2,
        maxOutputTokens: 900,
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

  return parsed.items.slice(0, 3).map((item) => ({
    title: String(item.title ?? '').trim(),
    summary: String(item.summary ?? '').trim(),
    category: String(item.category ?? '').trim(),
    source: 'gemini'
  })).filter((item) => item.title && item.summary);
}
