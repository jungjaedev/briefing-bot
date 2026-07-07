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

const WEATHER_CODE_SHORT_LABELS = new Map([
  [0, '맑음'],
  [1, '대체로 맑음'],
  [2, '구름 조금'],
  [3, '흐림'],
  [45, '안개'],
  [48, '짙은 안개'],
  [51, '가벼운 이슬비'],
  [53, '이슬비'],
  [55, '강한 이슬비'],
  [61, '약한 비'],
  [63, '비'],
  [65, '강한 비'],
  [71, '약한 눈'],
  [73, '눈'],
  [75, '강한 눈'],
  [80, '약한 소나기'],
  [81, '소나기'],
  [82, '강한 소나기'],
  [95, '천둥번개']
]);

function getNumber(value) {
  return Number.isFinite(value) ? Math.round(value) : null;
}

function getTodayIndex(daily, dateKey) {
  const index = daily?.time?.findIndex((value) => value === dateKey);
  return index >= 0 ? index : 0;
}

function getHourInKorea(value) {
  return Number.parseInt(value.slice(11, 13), 10);
}

function getHourlyPeriod(hourly, dateKey, startHour, endHour) {
  const rows = hourly?.time
    ?.map((time, index) => ({
      time,
      hour: getHourInKorea(time),
      weatherCode: hourly.weather_code?.[index],
      precipitationProbability: getNumber(hourly.precipitation_probability?.[index])
    }))
    .filter((row) => row.time.startsWith(dateKey) && row.hour >= startHour && row.hour < endHour) ?? [];

  if (rows.length === 0) {
    return null;
  }

  const maxPrecipitation = Math.max(
    ...rows.map((row) => row.precipitationProbability ?? 0)
  );
  const representative =
    rows.find((row) => (row.precipitationProbability ?? 0) === maxPrecipitation) ?? rows[0];

  return {
    condition: WEATHER_CODE_SHORT_LABELS.get(representative.weatherCode) ?? '변화 있음',
    precipitationProbability: maxPrecipitation
  };
}

function buildPeriodSummary(morning, afternoon, dailyPrecipitationProbability) {
  if (!morning && !afternoon) {
    if (dailyPrecipitationProbability === null) {
      return '강수 가능성 정보는 현재 확인되지 않았습니다.';
    }

    return `오늘 예상 강수확률은 최대 ${dailyPrecipitationProbability}%입니다.`;
  }

  const parts = [];

  if (morning) {
    parts.push(`오전은 ${morning.condition}, 강수확률 ${morning.precipitationProbability}%`);
  }

  if (afternoon) {
    parts.push(`오후는 ${afternoon.condition}, 강수확률 ${afternoon.precipitationProbability}%`);
  }

  const maxPrecipitation = Math.max(
    morning?.precipitationProbability ?? 0,
    afternoon?.precipitationProbability ?? 0,
    dailyPrecipitationProbability ?? 0
  );
  const advice = maxPrecipitation >= 60
    ? '우산을 챙기는 편이 좋겠습니다.'
    : maxPrecipitation >= 35
      ? '외출 전 비 소식을 한 번 더 확인해 주세요.'
      : '비 가능성은 크지 않습니다.';

  return `${parts.join(', ')}입니다. ${advice}`;
}

function buildSummary(morning, afternoon, precipitationProbability) {
  if (precipitationProbability === null && !morning && !afternoon) {
    return '강수 가능성 정보는 현재 확인되지 않았습니다.';
  }

  return buildPeriodSummary(morning, afternoon, precipitationProbability);
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
    ].join(','),
    hourly: [
      'weather_code',
      'precipitation_probability'
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
  const morning = getHourlyPeriod(data.hourly, dateKey, 6, 12);
  const afternoon = getHourlyPeriod(data.hourly, dateKey, 12, 18);

  return {
    dateKey,
    locationName,
    condition: WEATHER_CODE_LABELS.get(weatherCode) ?? '날씨 변화가 있고',
    minTemperature,
    maxTemperature,
    precipitationProbability,
    morning,
    afternoon,
    summary: buildSummary(morning, afternoon, precipitationProbability)
  };
}
