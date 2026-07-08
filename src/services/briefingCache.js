import fs from 'node:fs/promises';
import path from 'node:path';
import { createBriefing } from '../briefing.js';
import { getKoreanDateKey } from '../utils/date.js';

const CACHE_DIR = process.env.BRIEFING_CACHE_DIR || path.join(process.cwd(), 'data');
const CACHE_FILE = path.join(CACHE_DIR, 'briefing-cache.json');

let refreshPromise = null;

function getCachePayload(text, date = new Date()) {
  return {
    dateKey: getKoreanDateKey(date),
    createdAt: new Date().toISOString(),
    text
  };
}

async function readCacheFile() {
  try {
    const raw = await fs.readFile(CACHE_FILE, 'utf8');
    const parsed = JSON.parse(raw);

    if (!parsed || typeof parsed !== 'object') {
      return null;
    }

    return parsed;
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error('[briefingCache] read failed', error);
    }

    return null;
  }
}

async function writeCacheFile(payload) {
  await fs.mkdir(CACHE_DIR, { recursive: true });

  const tempFile = `${CACHE_FILE}.tmp`;
  await fs.writeFile(tempFile, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
  await fs.rename(tempFile, CACHE_FILE);
}

export async function getBriefingCacheStatus(date = new Date()) {
  const cache = await readCacheFile();
  const dateKey = getKoreanDateKey(date);

  return {
    cacheFile: CACHE_FILE,
    exists: Boolean(cache),
    dateKey: cache?.dateKey ?? null,
    createdAt: cache?.createdAt ?? null,
    isToday: cache?.dateKey === dateKey && typeof cache?.text === 'string' && cache.text.length > 0
  };
}

export async function refreshBriefingCache(date = new Date()) {
  if (!refreshPromise) {
    refreshPromise = (async () => {
      const text = await createBriefing(date);
      const payload = getCachePayload(text, date);
      await writeCacheFile(payload);
      return payload;
    })().finally(() => {
      refreshPromise = null;
    });
  }

  return refreshPromise;
}

export async function getCachedBriefing({ date = new Date(), forceRefresh = false } = {}) {
  const dateKey = getKoreanDateKey(date);

  if (!forceRefresh) {
    const cache = await readCacheFile();
    if (cache?.dateKey === dateKey && typeof cache.text === 'string' && cache.text.length > 0) {
      return {
        ...cache,
        cacheHit: true
      };
    }
  }

  const refreshed = await refreshBriefingCache(date);
  return {
    ...refreshed,
    cacheHit: false
  };
}
