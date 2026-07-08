import { createWeatherBriefingWithGemini } from './llm.js';

const DEFAULT_LOCATION = {
  name: '서울 도봉구',
  latitude: 37.6688,
  longitude: 127.0471
};

const WEATHER_CODE_LABELS = new Map([
  [0, '맑음'],
  [1, '대체로 맑음'],
  [2, '구름 조금'],
  [3, '흐림'],
  [45, '안개'],
  [48, '짙은 안개'],
  [51, '약한 이슬비'],
  [53, '이슬비'],
  [55, '강한 이슬비'],
  [56, '약한 어는 이슬비'],
  [57, '어는 이슬비'],
  [61, '약한 비'],
  [63, '비'],
  [65, '강한 비'],
  [66, '약한 어는 비'],
  [67, '어는 비'],
  [71, '약한 눈'],
  [73, '눈'],
  [75, '강한 눈'],
  [77, '싸락눈'],
  [80, '약한 소나기'],
  [81, '소나기'],
  [82, '강한 소나기'],
  [85, '약한 눈 소나기'],
  [86, '강한 눈 소나기'],
  [95, '천둥번개'],
  [96, '우박을 동반한 천둥번개'],
  [99, '강한 우박을 동반한 천둥번개']
]);

const PERIODS = [
  { key: 'dawn', label: '새벽', startHour: 0, endHour: 6 },
  { key: 'morning', label: '오전', startHour: 6, endHour: 12 },
  { key: 'afternoon', label: '오후', startHour: 12, endHour: 18 },
  { key: 'night', label: '저녁/밤', startHour: 18, endHour: 24 }
];

const PRECIPITATION_WEATHER_CODES = new Set([
  51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 71, 73, 75, 77, 80, 81, 82, 85, 86, 95, 96, 99
]);

const STRONG_PRECIPITATION_WEATHER_CODES = new Set([55, 57, 65, 67, 75, 82, 86, 95, 96, 99]);

function roundNumber(value, digits = 0) {
  if (!Number.isFinite(value)) {
    return null;
  }

  const multiplier = 10 ** digits;
  return Math.round(value * multiplier) / multiplier;
}

function sumNumbers(values) {
  return roundNumber(
    values.reduce((total, value) => total + (Number.isFinite(value) ? value : 0), 0),
    1
  );
}

function getWeatherLabel(code) {
  return WEATHER_CODE_LABELS.get(code) ?? '날씨 변화가 있습니다';
}

function getWeatherCodeScore(code) {
  if (STRONG_PRECIPITATION_WEATHER_CODES.has(code)) {
    return 4;
  }

  if (PRECIPITATION_WEATHER_CODES.has(code)) {
    return 3;
  }

  if (code === 45 || code === 48) {
    return 2;
  }

  if (code === 3) {
    return 1;
  }

  return 0;
}

function getRepresentativeWeatherCode(rows) {
  if (rows.length === 0) {
    return null;
  }

  return rows.reduce((representative, row) => {
    if (!representative) {
      return row;
    }

    const rowScore = getWeatherCodeScore(row.weatherCode);
    const representativeScore = getWeatherCodeScore(representative.weatherCode);

    if (rowScore !== representativeScore) {
      return rowScore > representativeScore ? row : representative;
    }

    return (row.precipitationProbability ?? 0) > (representative.precipitationProbability ?? 0)
      ? row
      : representative;
  }, null).weatherCode;
}

function getHour(value) {
  return Number.parseInt(value.slice(11, 13), 10);
}

function getRowsForDate(hourly, dateKey) {
  const times = Array.isArray(hourly?.time) ? hourly.time : [];

  return times
    .map((time, index) => ({
      time,
      hour: getHour(time),
      temperature: hourly.temperature_2m?.[index],
      precipitationProbability: hourly.precipitation_probability?.[index],
      precipitation: hourly.precipitation?.[index],
      rain: hourly.rain?.[index],
      weatherCode: hourly.weather_code?.[index]
    }))
    .filter((row) => row.time?.startsWith(dateKey) && Number.isFinite(row.hour));
}

function analyzePeriod(period, rows) {
  const periodRows = rows.filter((row) => row.hour >= period.startHour && row.hour < period.endHour);
  const temperatures = periodRows.map((row) => row.temperature).filter(Number.isFinite);
  const probabilities = periodRows.map((row) => row.precipitationProbability).filter(Number.isFinite);
  const precipitationValues = periodRows.map((row) => row.precipitation).filter(Number.isFinite);
  const rainValues = periodRows.map((row) => row.rain).filter(Number.isFinite);
  const representativeWeatherCode = getRepresentativeWeatherCode(periodRows);
  const precipitationSum = sumNumbers(precipitationValues);
  const rainSum = sumNumbers(rainValues);

  return {
    key: period.key,
    label: period.label,
    maxPrecipitationProbability: probabilities.length > 0 ? Math.max(...probabilities) : null,
    precipitationSum,
    rainSum,
    representativeWeatherCode,
    condition: representativeWeatherCode === null
      ? '날씨 변화가 있습니다'
      : getWeatherLabel(representativeWeatherCode),
    averageTemperature: temperatures.length > 0
      ? roundNumber(temperatures.reduce((sum, value) => sum + value, 0) / temperatures.length)
      : null,
    hasPrecipitationWeather: representativeWeatherCode !== null &&
      PRECIPITATION_WEATHER_CODES.has(representativeWeatherCode),
    hasStrongPrecipitationWeather: representativeWeatherCode !== null &&
      STRONG_PRECIPITATION_WEATHER_CODES.has(representativeWeatherCode)
  };
}

function getDailyValue(daily, field) {
  return Array.isArray(daily?.[field]) ? daily[field][0] : null;
}

function getRainAmountLevel(totalPrecipitation) {
  if (totalPrecipitation >= 20) {
    return 'heavy';
  }

  if (totalPrecipitation >= 5) {
    return 'moderate';
  }

  if (totalPrecipitation >= 1) {
    return 'light';
  }

  return 'none';
}

function getRainLikelihoodLevel(maxProbability) {
  if (maxProbability >= 70) {
    return 'high';
  }

  if (maxProbability >= 40) {
    return 'medium';
  }

  return 'low';
}

function getFocusedRainPeriods(periods) {
  const maxPrecipitation = Math.max(...periods.map((period) => period.precipitationSum ?? 0));

  if (maxPrecipitation <= 0) {
    return periods
      .filter((period) => (period.maxPrecipitationProbability ?? 0) >= 60)
      .map((period) => period.label);
  }

  return periods
    .filter((period) => (period.precipitationSum ?? 0) === maxPrecipitation)
    .map((period) => period.label);
}

function getSpecialNotes(periods, totalPrecipitation) {
  const dawn = periods.find((period) => period.key === 'dawn');
  const afternoon = periods.find((period) => period.key === 'afternoon');
  const night = periods.find((period) => period.key === 'night');
  const notes = [];

  if (dawn && (
    (dawn.maxPrecipitationProbability ?? 0) >= 60 ||
    (dawn.precipitationSum ?? 0) >= 1 ||
    dawn.hasPrecipitationWeather
  )) {
    notes.push('새벽에 비가 내린 뒤 아침 도로가 젖어 있을 수 있습니다.');
  }

  if (afternoon && (
    (afternoon.maxPrecipitationProbability ?? 0) >= 60 ||
    (afternoon.precipitationSum ?? 0) >= 1 ||
    afternoon.hasStrongPrecipitationWeather
  )) {
    notes.push('오후 날씨가 퇴근길에 영향을 줄 수 있습니다.');
  }

  if (night && (
    (night.maxPrecipitationProbability ?? 0) >= 60 ||
    (night.precipitationSum ?? 0) >= 1 ||
    night.hasPrecipitationWeather ||
    totalPrecipitation >= 20
  )) {
    notes.push('저녁에도 비가 이어질 수 있어 늦은 귀가 시 우산을 챙기는 편이 좋겠습니다.');
  }

  return notes;
}

function buildWeatherBriefingData(data, dateKey, location = DEFAULT_LOCATION) {
  const hourlyRows = getRowsForDate(data.hourly, dateKey);
  const periods = PERIODS.map((period) => analyzePeriod(period, hourlyRows));
  const minTemperature = roundNumber(getDailyValue(data.daily, 'temperature_2m_min'));
  const maxTemperature = roundNumber(getDailyValue(data.daily, 'temperature_2m_max'));
  const dailyPrecipitationSum = getDailyValue(data.daily, 'precipitation_sum');
  const dailyMaxPrecipitationProbability = getDailyValue(data.daily, 'precipitation_probability_max');
  const totalPrecipitation = roundNumber(
    dailyPrecipitationSum ?? periods.reduce((sum, period) => sum + (period.precipitationSum ?? 0), 0),
    1
  );
  const maxPrecipitationProbability = roundNumber(
    dailyMaxPrecipitationProbability ?? Math.max(
      ...periods.map((period) => period.maxPrecipitationProbability ?? 0)
    )
  );
  const currentWeatherCode = data.current?.weather_code;
  const currentTemperature = roundNumber(data.current?.temperature_2m);
  const currentPrecipitation = roundNumber(data.current?.precipitation ?? 0, 1);
  const currentRain = roundNumber(data.current?.rain ?? 0, 1);
  const umbrellaRecommended = maxPrecipitationProbability >= 40;
  const precipitationExpected = totalPrecipitation >= 1;
  const rainAmountLevel = getRainAmountLevel(totalPrecipitation);
  const rainLikelihoodLevel = getRainLikelihoodLevel(maxPrecipitationProbability);
  const strongRainPossible =
    totalPrecipitation >= 20 ||
    periods.some((period) => period.hasStrongPrecipitationWeather || (period.precipitationSum ?? 0) >= 5);
  const focusedRainPeriods = getFocusedRainPeriods(periods);
  const specialNotes = getSpecialNotes(periods, totalPrecipitation);

  return {
    dateKey,
    locationName: location.name,
    minTemperature,
    maxTemperature,
    currentCondition: getWeatherLabel(currentWeatherCode),
    currentTemperature,
    currentPrecipitation,
    currentRain,
    periods,
    morning: periods.find((period) => period.key === 'morning') ?? null,
    afternoon: periods.find((period) => period.key === 'afternoon') ?? null,
    dawn: periods.find((period) => period.key === 'dawn') ?? null,
    night: periods.find((period) => period.key === 'night') ?? null,
    totalPrecipitation,
    maxPrecipitationProbability,
    umbrellaRecommended,
    precipitationExpected,
    rainAmountLevel,
    rainLikelihoodLevel,
    strongRainPossible,
    focusedRainPeriods,
    specialNotes,
    raw: {
      current: data.current ?? null,
      daily: data.daily ?? null
    }
  };
}

function buildFallbackWeatherBriefing(weather) {
  const morningProbability = weather.morning?.maxPrecipitationProbability;
  const afternoonProbability = weather.afternoon?.maxPrecipitationProbability;
  const lines = [
    `${weather.locationName}는 현재 ${weather.currentCondition}이고, 기온은 ${weather.currentTemperature ?? '확인되지 않는'}도입니다.`,
    weather.minTemperature === null || weather.maxTemperature === null
      ? '오늘 최저/최고기온 정보는 현재 확인되지 않았습니다.'
      : `오늘 기온은 ${weather.minTemperature}도에서 ${weather.maxTemperature}도 사이입니다.`,
    `오전 강수확률은 ${morningProbability ?? 0}%, 오후는 ${afternoonProbability ?? 0}%입니다.`
  ];

  if (weather.umbrellaRecommended) {
    const amountText = weather.rainAmountLevel === 'heavy'
      ? '강한 비에 주의가 필요합니다.'
      : weather.rainAmountLevel === 'moderate'
        ? '비가 꽤 올 수 있어 우산을 챙기는 편이 좋겠습니다.'
        : '비가 약하게 지나갈 가능성이 있지만 우산을 챙기는 편이 좋겠습니다.';
    lines.push(amountText);
  } else {
    lines.push('비 가능성은 크지 않아 보입니다.');
  }

  if (weather.specialNotes.length > 0) {
    lines.push(weather.specialNotes[0]);
  }

  return lines.slice(0, 5).join('\n');
}

async function fetchOpenMeteoForecast(location = DEFAULT_LOCATION) {
  const params = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    timezone: 'Asia/Seoul',
    forecast_days: '1',
    current: [
      'temperature_2m',
      'precipitation',
      'rain',
      'weather_code'
    ].join(','),
    hourly: [
      'temperature_2m',
      'precipitation_probability',
      'precipitation',
      'rain',
      'weather_code'
    ].join(','),
    daily: [
      'temperature_2m_max',
      'temperature_2m_min',
      'precipitation_sum',
      'precipitation_probability_max'
    ].join(',')
  });

  const response = await fetch(`https://api.open-meteo.com/v1/forecast?${params}`);

  if (!response.ok) {
    throw new Error(`Open-Meteo API failed: ${response.status}`);
  }

  return response.json();
}

export async function getWeather({ dateKey } = {}) {
  const data = await fetchOpenMeteoForecast(DEFAULT_LOCATION);
  const weather = buildWeatherBriefingData(data, dateKey, DEFAULT_LOCATION);

  try {
    weather.briefingText = await createWeatherBriefingWithGemini(weather);
  } catch (error) {
    console.error('[weather] Gemini weather briefing failed, using fallback', error);
    weather.briefingText = buildFallbackWeatherBriefing(weather);
  }

  weather.summary = weather.briefingText;
  weather.condition = weather.currentCondition;
  weather.precipitationProbability = weather.maxPrecipitationProbability;

  return weather;
}
