import 'dotenv/config';
import { checkMobilifeMarket } from '../src/services/mobilifeMarket.js';
import { sendTelegramText } from '../src/services/telegram.js';

async function main() {
  const result = await checkMobilifeMarket();
  const telegram = result.alert ? await sendTelegramText(result.message) : { sent: false };

  console.log(JSON.stringify({
    ok: result.ok,
    alert: result.alert ?? false,
    reason: result.reason,
    item: result.item ? { name: result.item.name, price: result.item.price } : null,
    telegram
  }));
}

main().catch((error) => {
  console.error('[mobilife-market-alert] failed', error);
  process.exit(1);
});
