const TELEGRAM_API_BASE = 'https://api.telegram.org';
const TELEGRAM_MESSAGE_LIMIT = 4000;

function getTelegramConfig() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    return null;
  }

  return { token, chatId };
}

function splitMessage(text, limit = TELEGRAM_MESSAGE_LIMIT) {
  const normalized = String(text ?? '').trim();

  if (normalized.length <= limit) {
    return [normalized];
  }

  const lines = normalized.split('\n');
  const chunks = [];
  let current = '';

  for (const line of lines) {
    const candidate = current ? `${current}\n${line}` : line;
    if (candidate.length <= limit) {
      current = candidate;
      continue;
    }

    if (current) {
      chunks.push(current);
      current = '';
    }

    if (line.length <= limit) {
      current = line;
      continue;
    }

    for (let index = 0; index < line.length; index += limit) {
      chunks.push(line.slice(index, index + limit));
    }
  }

  if (current) {
    chunks.push(current);
  }

  return chunks;
}

async function sendTelegramMessage(token, chatId, text) {
  const response = await fetch(`${TELEGRAM_API_BASE}/bot${token}/sendMessage`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      disable_web_page_preview: true
    })
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Telegram API failed: ${response.status} ${body}`);
  }

  return response.json();
}

export async function sendBriefingToTelegram(text) {
  const config = getTelegramConfig();

  if (!config) {
    return { sent: false, reason: 'missing_config' };
  }

  const chunks = splitMessage(text);

  for (const chunk of chunks) {
    await sendTelegramMessage(config.token, config.chatId, chunk);
  }

  return {
    sent: true,
    chunks: chunks.length
  };
}

export async function sendTelegramText(text) {
  return sendBriefingToTelegram(text);
}
