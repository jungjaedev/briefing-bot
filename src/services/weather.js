export async function getWeather({ dateKey } = {}) {
  // Later: replace this function body with Korea Meteorological Administration API logic.
  return {
    dateKey,
    condition: '맑고',
    minTemperature: 22,
    maxTemperature: 29,
    summary: '오후에는 소나기 가능성이 있습니다.'
  };
}
