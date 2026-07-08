import { DEFAULT_LOCATION } from './weather.js';

const AIR_QUALITY_API_URL = 'https://air-quality-api.open-meteo.com/v1/air-quality';
const AIR_QUALITY_TIMEOUT_MS = 8000;

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function roundNumber(value) {
  return Number.isFinite(value) ? Math.round(value) : null;
}

function getPm10Grade(value) {
  if (!Number.isFinite(value)) {
    return null;
  }

  if (value <= 30) return '좋음';
  if (value <= 80) return '보통';
  if (value <= 150) return '나쁨';
  return '매우나쁨';
}

function getPm25Grade(value) {
  if (!Number.isFinite(value)) {
    return null;
  }

  if (value <= 15) return '좋음';
  if (value <= 35) return '보통';
  if (value <= 75) return '나쁨';
  return '매우나쁨';
}

function getNearestHourlyIndex(times = [], now = new Date()) {
  if (times.length === 0) {
    return -1;
  }

  const targetTime = now.getTime();
  let nearestIndex = 0;
  let nearestDiff = Number.POSITIVE_INFINITY;

  times.forEach((time, index) => {
    const diff = Math.abs(new Date(`${time}:00+09:00`).getTime() - targetTime);
    if (diff < nearestDiff) {
      nearestDiff = diff;
      nearestIndex = index;
    }
  });

  return nearestIndex;
}

export async function fetchAirQuality(location = DEFAULT_LOCATION) {
  const params = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    timezone: 'Asia/Seoul',
    forecast_days: '1',
    hourly: ['pm10', 'pm2_5', 'us_aqi', 'european_aqi', 'ozone'].join(',')
  });

  const url = `${AIR_QUALITY_API_URL}?${params}`;

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), AIR_QUALITY_TIMEOUT_MS);

    try {
      const response = await fetch(url, { signal: controller.signal });

      if (!response.ok) {
        throw new Error(`Open-Meteo Air Quality API failed: ${response.status}`);
      }

      return response.json();
    } catch (error) {
      if (attempt === 1) {
        console.error('[airQuality] fetch failed', error);
        return null;
      }

      await wait(600);
    } finally {
      clearTimeout(timeout);
    }
  }

  return null;
}

export function parseAirQuality(data, location = DEFAULT_LOCATION, now = new Date()) {
  const hourly = data?.hourly;
  const index = getNearestHourlyIndex(hourly?.time, now);

  if (!hourly || index < 0) {
    return {
      location: location.name,
      available: false,
      failed: false,
      source: 'open-meteo'
    };
  }

  const pm10Value = roundNumber(hourly.pm10?.[index]);
  const pm25Value = roundNumber(hourly.pm2_5?.[index]);

  return {
    location: location.name,
    available: pm10Value !== null || pm25Value !== null,
    failed: false,
    pm10Value,
    pm10Grade: getPm10Grade(pm10Value),
    pm25Value,
    pm25Grade: getPm25Grade(pm25Value),
    usAqi: roundNumber(hourly.us_aqi?.[index]),
    europeanAqi: roundNumber(hourly.european_aqi?.[index]),
    ozone: roundNumber(hourly.ozone?.[index]),
    measuredTime: hourly.time[index],
    source: 'open-meteo'
  };
}

function buildAirQualityBriefing(airQuality) {
  if (airQuality.failed) {
    return '대기질 정보는 현재 불러오지 못했습니다.';
  }

  if (!airQuality.available) {
    return '';
  }

  if (airQuality.pm10Grade && airQuality.pm25Grade) {
    if (airQuality.pm10Grade === airQuality.pm25Grade) {
      return `대기질은 미세먼지와 초미세먼지 모두 ${airQuality.pm10Grade} 수준입니다.`;
    }

    return `대기질은 미세먼지 ${airQuality.pm10Grade}, 초미세먼지 ${airQuality.pm25Grade} 수준입니다.`;
  }

  if (airQuality.pm10Grade) {
    return `대기질은 미세먼지가 ${airQuality.pm10Grade} 수준입니다.`;
  }

  if (airQuality.pm25Grade) {
    return `대기질은 초미세먼지가 ${airQuality.pm25Grade} 수준입니다.`;
  }

  return '';
}

export async function getAirQuality() {
  const data = await fetchAirQuality(DEFAULT_LOCATION);

  if (!data) {
    return {
      location: DEFAULT_LOCATION.name,
      available: false,
      failed: true,
      briefingText: '대기질 정보는 현재 불러오지 못했습니다.',
      source: 'open-meteo'
    };
  }

  const airQuality = parseAirQuality(data, DEFAULT_LOCATION);
  airQuality.briefingText = buildAirQualityBriefing(airQuality);

  return airQuality;
}
