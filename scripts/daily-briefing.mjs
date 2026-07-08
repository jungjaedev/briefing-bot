import 'dotenv/config';
import { refreshBriefingCache } from '../src/services/briefingCache.js';
import { sendBriefingToTelegram } from '../src/services/telegram.js';

async function main() {
  const cache = await refreshBriefingCache();
  const telegramResult = await sendBriefingToTelegram(cache.text);

  console.log(JSON.stringify({
    ok: true,
    dateKey: cache.dateKey,
    telegram: telegramResult
  }));
}

main().catch((error) => {
  console.error('[daily-briefing] failed', error);
  process.exit(1);
});
