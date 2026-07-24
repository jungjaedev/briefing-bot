import 'dotenv/config';
import '../src/config/network.js';
import { getBriefingCacheStatus, refreshBriefingCache } from '../src/services/briefingCache.js';
import { sendTelegramText } from '../src/services/telegram.js';

const TELEGRAM_API_BASE = 'https://api.telegram.org';
const POLL_TIMEOUT_SECONDS = 30;
const RETRY_DELAY_MS = 3000;

const token = process.env.TELEGRAM_BOT_TOKEN;
const allowedChatId = process.env.TELEGRAM_CHAT_ID;

if (!token || !allowedChatId) {
  console.error('[telegram-bot] TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID are required');
  process.exit(1);
}

let nextOffset = null;
let refreshing = false;
let stopping = false;

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

async function getUpdates({ initialize = false } = {}) {
  const params = new URLSearchParams({
    timeout: initialize ? '0' : String(POLL_TIMEOUT_SECONDS),
    allowed_updates: JSON.stringify(['message'])
  });

  if (initialize) {
    params.set('offset', '-1');
  } else if (nextOffset !== null) {
    params.set('offset', String(nextOffset));
  }

  const response = await fetch(`${TELEGRAM_API_BASE}/bot${token}/getUpdates?${params}`);
  if (!response.ok) {
    throw new Error(`Telegram getUpdates failed: ${response.status}`);
  }

  const payload = await response.json();
  if (!payload.ok || !Array.isArray(payload.result)) {
    throw new Error('Telegram getUpdates returned an invalid response');
  }

  return payload.result;
}

function getCommand(text = '') {
  return text.trim().split(/\s+/)[0].toLowerCase().replace(/@[^\s]+$/, '');
}

async function handleRefresh() {
  if (refreshing) {
    await sendTelegramText('브리핑을 이미 새로 생성하고 있습니다. 잠시 후 다시 확인해 주세요.');
    return;
  }

  refreshing = true;
  try {
    await sendTelegramText('브리핑을 새로 생성하고 있습니다. 완료되면 보내드리겠습니다.');
    const cache = await refreshBriefingCache();
    await sendTelegramText(cache.text);
  } catch (error) {
    console.error('[telegram-bot] refresh failed', error);
    await sendTelegramText('브리핑을 새로 생성하지 못했습니다. 잠시 후 다시 시도해 주세요.');
  } finally {
    refreshing = false;
  }
}

async function handleStatus() {
  const status = await getBriefingCacheStatus();
  const createdAt = status.createdAt
    ? new Intl.DateTimeFormat('ko-KR', {
      timeZone: 'Asia/Seoul',
      dateStyle: 'medium',
      timeStyle: 'short'
    }).format(new Date(status.createdAt))
    : '없음';

  await sendTelegramText([
    `캐시 상태: ${status.isToday ? '오늘 브리핑 있음' : '오늘 브리핑 없음'}`,
    `마지막 생성: ${createdAt}`
  ].join('\n'));
}

async function handleUpdate(update) {
  const message = update?.message;
  if (!message?.text || String(message.chat?.id) !== String(allowedChatId)) {
    return;
  }

  const command = getCommand(message.text);
  if (command === '/refresh') {
    await handleRefresh();
  } else if (command === '/status') {
    await handleStatus();
  } else if (command === '/help' || command === '/start') {
    await sendTelegramText([
      '사용 가능한 명령:',
      '/refresh - 브리핑 새로 생성 후 전송',
      '/status - 마지막 생성 상태 확인'
    ].join('\n'));
  }
}

async function initializeOffset() {
  const updates = await getUpdates({ initialize: true });
  if (updates.length > 0) {
    nextOffset = updates.at(-1).update_id + 1;
  }
}

async function main() {
  await initializeOffset();
  console.log('[telegram-bot] polling started');

  while (!stopping) {
    try {
      const updates = await getUpdates();
      for (const update of updates) {
        nextOffset = update.update_id + 1;
        await handleUpdate(update);
      }
    } catch (error) {
      if (!stopping) {
        console.error('[telegram-bot] polling failed', error);
        await wait(RETRY_DELAY_MS);
      }
    }
  }
}

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.on(signal, () => {
    stopping = true;
  });
}

main().catch((error) => {
  console.error('[telegram-bot] fatal error', error);
  process.exit(1);
});
