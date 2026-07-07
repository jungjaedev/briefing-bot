const WEATHER_CODE_LABELS = new Map([
  [0, '맑고'],
  [1, '대체로 맑고'],
  [2, '구름이 조금 있고'],
  [3, '흐리고'],
  [45, '안개가 있고'],
  [48, '짙은 안개가 있고'],
  [51, '가벼운 이슬비가 있고'],
  [53, '이슬비가 있고'],
  [55, '강한 이슬비가 있고'],
  [61, '약한 비가 오고'],
  [63, '비가 오고'],
  [65, '강한 비가 오고'],
  [71, '약한 눈이 오고'],
  [73, '눈이 오고'],
  [75, '강한 눈이 오고'],
  [80, '약한 소나기가 있고'],
  [81, '소나기가 있고'],
  [82, '강한 소나기가 있고'],
  [95, '천둥번개 가능성이 있고']
]);

function getNumber(value) {
  return Number.isFinite(value) ? Math.round(value) : null;
}

function getTodayIndex(daily, dateKey) {
  const index = daily?.time?.findIndex((value) => value === dateKey);
  return index >= 0 ? index : 0;
}

function buildSummary(precipitationProbability) {
  if (precipitationProbability === null) {
    return '강수 가능성 정보는 현재 확인되지 않았습니다.';
  }

  if (precipitationProbability >= 70) {
    return `비가 올 가능성이 높습니다. 우산을 챙기는 편이 좋겠습니다. 예상 강수확률은 ${precipitationProbability}%입니다.`;
  }

  if (precipitationProbability >= 40) {
    return `오후나 이동 시간대에 비 가능성을 확인해 주세요. 예상 강수확률은 ${precipitationProbability}%입니다.`;
  }

  return `강수확률은 ${precipitationProbability}%로 비교적 낮습니다.`;
}

export async function getWeather({ dateKey } = {}) {
  const latitude = process.env.WEATHER_LAT || '37.6688';
  const longitude = process.env.WEATHER_LON || '127.0471';
  const locationName = process.env.WEATHER_LOCATION_NAME || '서울 도봉구';
  const params = new URLSearchParams({
    latitude,
    longitude,
    timezone: 'Asia/Seoul',
    daily: [
      'weather_code',
      'temperature_2m_max',
      'temperature_2m_min',
      'precipitation_probability_max'
    ].join(',')
  });

  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);

  if (!response.ok) {
    throw new Error(`Open-Meteo API failed: ${response.status}`);
  }

  const data = await response.json();
  const index = getTodayIndex(data.daily, dateKey);
  const weatherCode = data.daily?.weather_code?.[index];
  const minTemperature = getNumber(data.daily?.temperature_2m_min?.[index]);
  const maxTemperature = getNumber(data.daily?.temperature_2m_max?.[index]);
  const precipitationProbability = getNumber(data.daily?.precipitation_probability_max?.[index]);

  return {
    dateKey,
    locationName,
    condition: WEATHER_CODE_LABELS.get(weatherCode) ?? '날씨 변화가 있고',
    minTemperature,
    maxTemperature,
    precipitationProbability,
    summary: buildSummary(precipitationProbability)
  };
}
