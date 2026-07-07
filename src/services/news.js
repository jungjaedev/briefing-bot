export async function getTopNews({ dateKey } = {}) {
  // Later: replace this function body with Naver News API logic.
  return [
    {
      title: '국내 주요 경제 지표 발표를 앞두고 시장의 관망세가 이어지고 있습니다.',
      source: 'mock',
      dateKey
    },
    {
      title: '정부가 여름철 전력 수급 대책을 점검하고 안정적인 공급 계획을 밝혔습니다.',
      source: 'mock',
      dateKey
    },
    {
      title: '주요 기술 기업들이 인공지능 서비스 고도화 계획을 잇달아 발표했습니다.',
      source: 'mock',
      dateKey
    }
  ];
}
