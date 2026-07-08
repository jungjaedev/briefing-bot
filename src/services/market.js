const EXCHANGE_API_URL = 'https://www.koreaexim.go.kr/site/program/financial/exchangeJSON';
const UPBIT_TICKER_URL = 'https://api.upbit.com/v1/ticker';

const EXCHANGE_TARGETS = new Set(['USD', 'JPY(100)']);
const CRYPTO_MARKETS = ['KRW-BTC', 'KRW-ETH'];

function isMarketCheckEnabled() {
  return process.env.ENABLE_MARKET_CHECK === 'true';
}

function parseNumber(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (typeof value !== 'string') {
    return null;
  }

  const parsed = Number.parseFloat(value.replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function formatKoreanDate(date) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Seoul',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).format(date).replaceAll('-', '');
}

function getRecentDateKeys(date = new Date(), days = 7) {
  return Array.from({ length: days }, (_, index) => {
    const target = new Date(date);
    target.setDate(target.getDate() - index);
    return formatKoreanDate(target);
  });
}

function formatWon(value, { compact = false } = {}) {
  if (!Number.isFinite(value)) {
    return null;
  }

  if (compact && value >= 100000000) {
    const hundredMillion = value / 100000000;
    return `${hundredMillion.toLocaleString('ko-KR', {
      maximumFractionDigits: hundredMillion >= 10 ? 1 : 2
    })}억 원`;
  }

  return `${Math.round(value).toLocaleString('ko-KR')}원`;
}

function formatExchangeRate(rate) {
  if (!rate) {
    return null;
  }

  const valueText = formatWon(rate.value);
  return rate.unit === 'JPY(100)'
    ? `원/엔 환율은 100엔 기준 ${valueText}`
    : `원/달러 환율은 ${valueText}`;
}

function normalizeExchangeRows(rows = []) {
  return rows
    .filter((row) => EXCHANGE_TARGETS.has(row.cur_unit))
    .map((row) => ({
      code: row.cur_unit === 'JPY(100)' ? 'JPY' : row.cur_unit,
      unit: row.cur_unit,
      name: row.cur_nm,
      value: parseNumber(row.deal_bas_r),
      source: 'koreaexim'
    }))
    .filter((row) => row.value !== null);
}

async function fetchExchangeRatesForDate(dateKey) {
  const apiKey = process.env.EXCHANGE_API_KEY;

  if (!apiKey) {
    return [];
  }

  const params = new URLSearchParams({
    authkey: apiKey,
    searchdate: dateKey,
    data: 'AP01'
  });

  const response = await fetch(`${EXCHANGE_API_URL}?${params}`);

  if (!response.ok) {
    throw new Error(`Exchange API failed: ${response.status}`);
  }

  const data = await response.json();

  if (!Array.isArray(data)) {
    return [];
  }

  return normalizeExchangeRows(data).map((row) => ({ ...row, dateKey }));
}

export async function fetchExchangeRates(date = new Date()) {
  for (const dateKey of getRecentDateKeys(date)) {
    const rows = await fetchExchangeRatesForDate(dateKey);

    if (rows.length > 0) {
      return {
        available: true,
        dateKey,
        usd: rows.find((row) => row.code === 'USD') ?? null,
        jpy: rows.find((row) => row.code === 'JPY') ?? null,
        items: rows
      };
    }
  }

  return {
    available: false,
    items: []
  };
}

export async function fetchCryptoPrices() {
  const params = new URLSearchParams({
    markets: CRYPTO_MARKETS.join(',')
  });

  const response = await fetch(`${UPBIT_TICKER_URL}?${params}`, {
    headers: {
      Accept: 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`Upbit API failed: ${response.status}`);
  }

  const data = await response.json();

  if (!Array.isArray(data)) {
    return {
      available: false,
      items: []
    };
  }

  const items = data.map((item) => ({
    market: item.market,
    symbol: item.market === 'KRW-BTC' ? 'BTC' : item.market === 'KRW-ETH' ? 'ETH' : item.market,
    name: item.market === 'KRW-BTC' ? '비트코인' : item.market === 'KRW-ETH' ? '이더리움' : item.market,
    tradePrice: parseNumber(item.trade_price),
    signedChangeRate: Number.isFinite(item.signed_change_rate) ? item.signed_change_rate : null,
    source: 'upbit'
  })).filter((item) => item.tradePrice !== null);

  return {
    available: items.length > 0,
    btc: items.find((item) => item.symbol === 'BTC') ?? null,
    eth: items.find((item) => item.symbol === 'ETH') ?? null,
    items
  };
}

function buildExchangeSummary(exchangeRates) {
  if (!exchangeRates?.available) {
    return '';
  }

  const parts = [
    formatExchangeRate(exchangeRates.usd),
    formatExchangeRate(exchangeRates.jpy)
  ].filter(Boolean);

  return parts.length > 0 ? `${parts.join(', ')}입니다.` : '';
}

function buildCryptoSummary(cryptoPrices) {
  if (!cryptoPrices?.available) {
    return '';
  }

  const btcText = cryptoPrices.btc?.tradePrice
    ? `비트코인은 원화 기준 ${formatWon(cryptoPrices.btc.tradePrice, { compact: true })}`
    : '';
  const ethText = cryptoPrices.eth?.tradePrice
    ? `이더리움은 ${formatWon(cryptoPrices.eth.tradePrice, { compact: true })}`
    : '';
  const parts = [btcText, ethText].filter(Boolean);

  return parts.length > 0
    ? `${parts.join(', ')} 수준에서 움직이고 있습니다.`
    : '';
}

export function buildMarketCheck({ exchangeRates, cryptoPrices }) {
  const summary = buildExchangeSummary(exchangeRates);
  const cryptoSummary = buildCryptoSummary(cryptoPrices);
  const available = Boolean(summary || cryptoSummary);

  return {
    available,
    summary,
    cryptoCheck: {
      available: Boolean(cryptoSummary),
      summary: cryptoSummary
    },
    exchangeRates: exchangeRates ?? { available: false, items: [] },
    cryptoPrices: cryptoPrices ?? { available: false, items: [] },
    oil: { available: false },
    usStocks: { available: false },
    domesticStocks: { available: false }
  };
}

async function settleMarketPart(label, serviceCall) {
  try {
    return await serviceCall();
  } catch (error) {
    console.error(`[market] ${label} failed`, error);
    return {
      available: false,
      items: []
    };
  }
}

export async function getMarketCheck({ date = new Date() } = {}) {
  if (!isMarketCheckEnabled()) {
    return {
      available: false,
      summary: '',
      cryptoCheck: {
        available: false,
        summary: ''
      },
      items: []
    };
  }

  const [exchangeRates, cryptoPrices] = await Promise.all([
    settleMarketPart('exchange rates', () => fetchExchangeRates(date)),
    settleMarketPart('crypto prices', () => fetchCryptoPrices())
  ]);

  return buildMarketCheck({ exchangeRates, cryptoPrices });
}
