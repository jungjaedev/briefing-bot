export async function getMarketCheck() {
  // Later: connect exchange rates, stock indexes, oil, BTC, and ETH price APIs here.
  return {
    available: false,
    summary: '',
    cryptoCheck: {
      available: false,
      summary: '가상화폐 시세 데이터는 아직 연동되지 않았습니다.'
    },
    items: []
  };
}
