import { getTodayEvents } from './services/calendar.js';
import { getMarketCheck } from './services/market.js';
import { getTopNews } from './services/news.js';
import { getWeather } from './services/weather.js';
import { getKoreanDate, getKoreanDateKey } from './utils/date.js';
import { formatCalendarItems, formatMarketCheck, formatNewsItems, formatServiceError } from './utils/format.js';

async function settleService(label, serviceCall) {
  try {
    return { ok: true, data: await serviceCall() };
  } catch (error) {
    console.error(`[briefing] ${label} service failed`, error);
    return { ok: false, error };
  }
}

export async function createBriefing(date = new Date()) {
  const dateKey = getKoreanDateKey(date);
  const displayDate = getKoreanDate(date);

  const [weatherResult, marketResult, newsResult, calendarResult] = await Promise.all([
    settleService('weather', () => getWeather({ dateKey })),
    settleService('market', () => getMarketCheck({ dateKey })),
    settleService('news', () => getTopNews({ dateKey })),
    settleService('calendar', () => getTodayEvents({ dateKey }))
  ]);

  const lines = ['좋은 아침입니다.', '', `오늘은 ${displayDate}입니다.`, ''];

  if (weatherResult.ok) {
    const weather = weatherResult.data;
    if (weather.briefingText) {
      lines.push(weather.briefingText, '');
    } else {
      const temperatureText =
        weather.minTemperature === null || weather.maxTemperature === null
          ? '기온 정보는 현재 확인되지 않았습니다.'
          : `예상 기온은 ${weather.minTemperature}도에서 ${weather.maxTemperature}도입니다.`;

      lines.push(
        `${weather.locationName ?? '오늘'} 날씨는 ${weather.condition}, ${temperatureText}`,
        weather.summary,
        ''
      );
    }
  } else {
    lines.push(formatServiceError('날씨'), '');
  }

  if (marketResult.ok) {
    const marketText = formatMarketCheck(marketResult.data);
    if (marketText) {
      lines.push(marketText, '');
    }
  }

  if (newsResult.ok) {
    lines.push('오늘의 주요 뉴스입니다.', formatNewsItems(newsResult.data), '');
  } else {
    lines.push(formatServiceError('뉴스'), '');
  }

  if (calendarResult.ok) {
    const calendarText = formatCalendarItems(calendarResult.data);
    if (calendarText) {
      lines.push(calendarText, '');
    }
  } else {
    lines.push(formatServiceError('일정'), '');
  }

  lines.push('오늘도 좋은 하루 보내세요.');

  return lines.join('\n');
}
