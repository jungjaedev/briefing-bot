const FX_API_URL = 'https://api.frankfurter.app/latest';
const UPBIT_TICKER_URL = 'https://api.upbit.com/v1/ticker';
const OIL_CHART_URL = 'https://query1.finance.yahoo.com/v8/finance/chart/CL=F';

const CRYPTO_MARKETS = ['KRW-BTC', 'KRW-ETH'];
const MARKET_FETCH_MAX_ATTEMPTS = 3;
const MARKET_FETCH_RETRY_STATUSES = new Set([429, 500, 502, 503, 504]);

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function fetchWithRetry(url, options = {}) {
  let lastError;

  for (let attempt = 1; attempt <= MARKET_FETCH_MAX_ATTEMPTS; attempt += 1) {
    let response;
    try {
      response = await fetch(url, options);
    } catch (error) {
      lastError = error;
    }

    if (response?.ok) {
      return response;
    }

    if (response) {
      lastError = new Error(`HTTP request failed: ${response.status}`);
      if (!MARKET_FETCH_RETRY_STATUSES.has(response.status)) {
        return response;
      }
      await response.text();
    }

    if (attempt < MARKET_FETCH_MAX_ATTEMPTS) {
      await wait(750 * attempt);
    }
  }

  throw lastError;
}

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

function formatOilPrice(price) {
  if (!Number.isFinite(price)) {
    return null;
  }

  return `${Math.round(price).toLocaleString('ko-KR')}달러`;
}

async function fetchExchangeRates() {
  const params = new URLSearchParams({
    from: 'USD',
    to: 'KRW,JPY'
  });

  const response = await fetchWithRetry(`${FX_API_URL}?${params}`, {
    headers: {
      Accept: 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`Frankfurter API failed: ${response.status}`);
  }

  const data = await response.json();
  const usdToKrw = parseNumber(data?.rates?.KRW);
  const usdToJpy = parseNumber(data?.rates?.JPY);

  if (!Number.isFinite(usdToKrw) || !Number.isFinite(usdToJpy) || usdToJpy === 0) {
    return {
      available: false,
      items: []
    };
  }

  return {
    available: true,
    dateKey: data.date ?? null,
    usd: {
      code: 'USD',
      unit: 'USD',
      name: '미국 달러',
      value: usdToKrw,
      source: 'frankfurter'
    },
    jpy: {
      code: 'JPY',
      unit: 'JPY(100)',
      name: '일본 엔',
      value: (usdToKrw / usdToJpy) * 100,
      source: 'frankfurter'
    },
    items: [
      {
        code: 'USD',
        unit: 'USD',
        name: '미국 달러',
        value: usdToKrw,
        source: 'frankfurter'
      },
      {
        code: 'JPY',
        unit: 'JPY(100)',
        name: '일본 엔',
        value: (usdToKrw / usdToJpy) * 100,
        source: 'frankfurter'
      }
    ]
  };
}

export async function fetchCryptoPrices() {
  const params = new URLSearchParams({
    markets: CRYPTO_MARKETS.join(',')
  });

  const response = await fetchWithRetry(`${UPBIT_TICKER_URL}?${params}`, {
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

export async function fetchOilPrice() {
  const params = new URLSearchParams({
    range: '1d',
    interval: '1d',
    includePrePost: 'false',
    events: 'div,splits'
  });

  const response = await fetchWithRetry(`${OIL_CHART_URL}?${params}`, {
    headers: {
      Accept: 'application/json',
      'User-Agent': 'Mozilla/5.0'
    }
  });

  if (!response.ok) {
    throw new Error(`Yahoo Finance oil API failed: ${response.status}`);
  }

  const data = await response.json();
  const meta = data?.chart?.result?.[0]?.meta;

  if (!meta) {
    return {
      available: false
    };
  }

  return {
    available: Number.isFinite(meta.regularMarketPrice),
    symbol: meta.symbol ?? 'CL=F',
    name: meta.shortName ?? 'Crude Oil',
    price: parseNumber(meta.regularMarketPrice),
    changePercent: parseNumber(meta.regularMarketChangePercent),
    source: 'yahoo-finance'
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

function buildOilSummary(oil) {
  if (!oil?.available || !Number.isFinite(oil.price)) {
    return '';
  }

  const priceText = formatOilPrice(oil.price);
  if (!priceText) {
    return '';
  }

  return `국제유가(WTI)는 배럴당 ${priceText} 수준입니다.`;
}

export function buildMarketCheck({ exchangeRates, cryptoPrices, oil }) {
  const summary = buildExchangeSummary(exchangeRates);
  const cryptoSummary = buildCryptoSummary(cryptoPrices);
  const oilSummary = buildOilSummary(oil);
  const available = Boolean(summary || cryptoSummary || oilSummary);

  return {
    available,
    summary: [summary, oilSummary].filter(Boolean).join('\n'),
    cryptoCheck: {
      available: Boolean(cryptoSummary),
      summary: cryptoSummary
    },
    exchangeRates: exchangeRates ?? { available: false, items: [] },
    cryptoPrices: cryptoPrices ?? { available: false, items: [] },
    oil: oil ?? { available: false },
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

  const [exchangeRates, cryptoPrices, oil] = await Promise.all([
    settleMarketPart('exchange rates', () => fetchExchangeRates(date)),
    settleMarketPart('crypto prices', () => fetchCryptoPrices()),
    settleMarketPart('oil price', () => fetchOilPrice())
  ]);

  return buildMarketCheck({ exchangeRates, cryptoPrices, oil });
}
