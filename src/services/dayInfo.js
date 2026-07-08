const KOREA_TIME_ZONE = 'Asia/Seoul';

const FIXED_DAY_INFOS = {
  '01-01': [{ name: '신정', type: '공휴일' }],
  '03-01': [{ name: '삼일절', type: '공휴일' }],
  '04-05': [{ name: '식목일', type: '기념일' }, { name: '청명', type: '절기' }],
  '05-05': [{ name: '어린이날', type: '공휴일' }, { name: '입하', type: '절기' }],
  '05-08': [{ name: '어버이날', type: '기념일' }],
  '05-15': [{ name: '스승의 날', type: '기념일' }],
  '06-06': [{ name: '현충일', type: '공휴일' }],
  '06-25': [{ name: '6.25 전쟁일', type: '기념일' }],
  '07-17': [{ name: '제헌절', type: '기념일' }],
  '08-15': [{ name: '광복절', type: '공휴일' }],
  '10-03': [{ name: '개천절', type: '공휴일' }],
  '10-09': [{ name: '한글날', type: '공휴일' }],
  '12-25': [{ name: '크리스마스', type: '공휴일' }]
};

const SOLAR_TERMS_2026 = {
  '01-05': '소한',
  '01-20': '대한',
  '02-04': '입춘',
  '02-19': '우수',
  '03-05': '경칩',
  '03-20': '춘분',
  '04-20': '곡우',
  '05-21': '소만',
  '06-05': '망종',
  '06-21': '하지',
  '07-07': '소서',
  '07-23': '대서',
  '08-07': '입추',
  '08-23': '처서',
  '09-07': '백로',
  '09-23': '추분',
  '10-08': '한로',
  '10-23': '상강',
  '11-07': '입동',
  '11-22': '소설',
  '12-07': '대설',
  '12-22': '동지'
};

const YEAR_SPECIFIC_DAY_INFOS = {
  '2026-02-16': [{ name: '설날 연휴', type: '공휴일' }],
  '2026-02-17': [{ name: '설날', type: '공휴일' }],
  '2026-02-18': [{ name: '설날 연휴', type: '공휴일' }],
  '2026-03-02': [{ name: '삼일절 대체공휴일', type: '대체공휴일' }],
  '2026-05-24': [{ name: '부처님오신날', type: '공휴일' }],
  '2026-05-25': [{ name: '부처님오신날 대체공휴일', type: '대체공휴일' }],
  '2026-08-17': [{ name: '광복절 대체공휴일', type: '대체공휴일' }],
  '2026-09-24': [{ name: '추석 연휴', type: '공휴일' }],
  '2026-09-25': [{ name: '추석', type: '공휴일' }],
  '2026-09-26': [{ name: '추석 연휴', type: '공휴일' }],
  '2026-10-05': [{ name: '개천절 대체공휴일', type: '대체공휴일' }]
};

function getKoreanDateParts(date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: KOREA_TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    weekday: 'short'
  }).formatToParts(date);

  return Object.fromEntries(parts.map((part) => [part.type, part.value]));
}

function getDateKey(date) {
  const parts = getKoreanDateParts(date);
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function getMonthDayKey(date) {
  const parts = getKoreanDateParts(date);
  return `${parts.month}-${parts.day}`;
}

function addDays(date, days) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function getInfosForDate(date) {
  const dateKey = getDateKey(date);
  const monthDayKey = getMonthDayKey(date);
  const year = getKoreanDateParts(date).year;
  const infos = [
    ...(FIXED_DAY_INFOS[monthDayKey] ?? []),
    ...(YEAR_SPECIFIC_DAY_INFOS[dateKey] ?? [])
  ];
  const solarTerm = year === '2026' ? SOLAR_TERMS_2026[monthDayKey] : null;

  if (solarTerm && !infos.some((info) => info.name === solarTerm)) {
    infos.push({ name: solarTerm, type: '절기' });
  }

  return infos;
}

function getWeekdayIndex(date) {
  const weekday = getKoreanDateParts(date).weekday;
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(weekday);
}

function formatInfos(infos) {
  return infos.map((info) => `${info.name}(${info.type})`).join(', ');
}

export function getDayInfo(date = new Date()) {
  const todayInfos = getInfosForDate(date);
  const weekdayIndex = getWeekdayIndex(date);
  const weekInfos = [];

  if (weekdayIndex === 1) {
    for (let offset = 0; offset < 7; offset += 1) {
      const targetDate = addDays(date, offset);
      const infos = getInfosForDate(targetDate);
      if (infos.length > 0) {
        weekInfos.push({
          dateKey: getDateKey(targetDate),
          infos
        });
      }
    }
  }

  return {
    todayInfos,
    todayText: todayInfos.length > 0 ? `오늘은 ${formatInfos(todayInfos)}입니다.` : '',
    weekInfos,
    weekText: weekInfos.length > 0
      ? `이번 주에는 ${weekInfos.map((item) => `${item.dateKey} ${formatInfos(item.infos)}`).join(', ')}가 있습니다.`
      : ''
  };
}
