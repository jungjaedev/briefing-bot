import fs from 'node:fs/promises';
import path from 'node:path';

const DEFAULT_STATE_FILE = path.join(process.cwd(), 'data', 'mobilife-market-alert.json');

function getPathValue(value, pathText) {
  return String(pathText ?? '')
    .split('.')
    .filter(Boolean)
    .reduce((current, key) => current?.[key], value);
}

function firstArray(value) {
  if (Array.isArray(value)) {
    return value;
  }

  for (const key of ['items', 'data', 'results', 'list']) {
    if (Array.isArray(value?.[key])) {
      return value[key];
    }
  }

  return [];
}

function numberFrom(value) {
  const number = Number(String(value ?? '').replaceAll(',', ''));
  return Number.isFinite(number) ? number : null;
}

export function findCheapestItem(payload, {
  itemsPath = process.env.MOBILIFE_ITEMS_PATH,
  targetName = process.env.MOBILIFE_ITEM_NAME,
  nameField = process.env.MOBILIFE_ITEM_NAME_FIELD || 'name',
  priceField = process.env.MOBILIFE_PRICE_FIELD || 'price'
} = {}) {
  const items = firstArray(itemsPath ? getPathValue(payload, itemsPath) : payload);
  const normalizedTargetName = String(targetName ?? '').trim();

  return items
    .map((item) => ({
      raw: item,
      name: String(getPathValue(item, nameField) ?? '').trim(),
      price: numberFrom(getPathValue(item, priceField))
    }))
    .filter((item) => item.name && item.price !== null)
    .filter((item) => !normalizedTargetName || item.name === normalizedTargetName)
    .sort((a, b) => a.price - b.price)[0] ?? null;
}

async function readLastAlert(stateFile) {
  try {
    return JSON.parse(await fs.readFile(stateFile, 'utf8'));
  } catch {
    return null;
  }
}

async function writeLastAlert(stateFile, alert) {
  await fs.mkdir(path.dirname(stateFile), { recursive: true });
  await fs.writeFile(stateFile, `${JSON.stringify(alert, null, 2)}\n`);
}

export async function checkMobilifeMarket() {
  const url = process.env.MOBILIFE_MARKET_URL;
  const maxPrice = numberFrom(process.env.MOBILIFE_MAX_PRICE);

  if (!url || maxPrice === null) {
    return { ok: false, reason: 'missing_config' };
  }

  const headers = {};
  if (process.env.MOBILIFE_API_KEY) {
    headers[process.env.MOBILIFE_API_KEY_HEADER || 'Authorization'] =
      process.env.MOBILIFE_API_KEY_PREFIX === '' ? process.env.MOBILIFE_API_KEY : `${process.env.MOBILIFE_API_KEY_PREFIX || 'Bearer'} ${process.env.MOBILIFE_API_KEY}`;
  }

  const response = await fetch(url, { headers });
  if (!response.ok) {
    throw new Error(`Mobilife market API failed: ${response.status} ${await response.text()}`);
  }

  const item = findCheapestItem(await response.json());
  if (!item || item.price > maxPrice) {
    return { ok: true, alert: false, item };
  }

  const stateFile = process.env.MOBILIFE_ALERT_STATE_FILE || DEFAULT_STATE_FILE;
  const key = JSON.stringify([item.name, item.price]);
  const lastAlert = await readLastAlert(stateFile);
  if (lastAlert?.key === key) {
    return { ok: true, alert: false, item, reason: 'already_sent' };
  }

  await writeLastAlert(stateFile, { key, item, sentAt: new Date().toISOString() });

  return {
    ok: true,
    alert: true,
    item,
    message: `거래소 최저가 알림\n${item.name}\n현재가: ${item.price.toLocaleString('ko-KR')}\n기준가: ${maxPrice.toLocaleString('ko-KR')}`
  };
}
