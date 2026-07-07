const ORDINALS = ['첫째', '둘째', '셋째', '넷째', '다섯째'];

export function formatNewsItems(items = []) {
  if (items.length === 0) {
    return '오늘 확인된 주요 뉴스가 없습니다.';
  }

  return items
    .map((item, index) => `${ORDINALS[index] ?? `${index + 1}번째`}, ${item.title}`)
    .join('\n');
}

export function formatCalendarItems(items = []) {
  if (items.length === 0) {
    return '';
  }

  return [
    '오늘의 일정입니다.',
    ...items.map((item) => `- ${item.time ? `${item.time} ` : ''}${item.title}`)
  ].join('\n');
}

export function formatServiceError(name) {
  return `${name} 정보는 현재 불러오지 못했습니다.`;
}
