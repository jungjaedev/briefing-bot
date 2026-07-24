import 'dotenv/config';
import crypto from 'node:crypto';
import express from 'express';
import './config/network.js';
import { getBriefingCacheStatus, getCachedBriefing } from './services/briefingCache.js';

const app = express();
const port = Number.parseInt(process.env.PORT ?? '3000', 10);
const host = process.env.HOST ?? '127.0.0.1';

app.disable('x-powered-by');

function tokensMatch(actual, expected) {
  const actualBuffer = Buffer.from(actual);
  const expectedBuffer = Buffer.from(expected);

  return actualBuffer.length === expectedBuffer.length
    && crypto.timingSafeEqual(actualBuffer, expectedBuffer);
}

function requireBriefingToken(req, res, next) {
  const expectedToken = process.env.BRIEFING_ACCESS_TOKEN;
  const authorization = req.get('authorization') ?? '';
  const match = authorization.match(/^Bearer ([^\s]+)$/i);

  if (!expectedToken) {
    res.status(503).type('text/plain; charset=utf-8').send('Briefing access is not configured.');
    return;
  }

  if (!match || !tokensMatch(match[1], expectedToken)) {
    res
      .status(401)
      .set('WWW-Authenticate', 'Bearer')
      .type('text/plain; charset=utf-8')
      .send('Unauthorized');
    return;
  }

  next();
}

app.get('/', (req, res) => {
  res.type('text/plain').send('Morning briefing bot is running.');
});

app.get('/health', (req, res) => {
  res.json({ ok: true });
});

app.use('/briefing', requireBriefingToken);

app.get('/briefing/status', async (req, res, next) => {
  try {
    res.json({
      ok: true,
      cache: await getBriefingCacheStatus()
    });
  } catch (error) {
    next(error);
  }
});

app.get('/briefing/refresh', async (req, res, next) => {
  try {
    const briefing = await getCachedBriefing({ forceRefresh: true });
    res
      .set('Cache-Control', 'no-store')
      .type('text/plain; charset=utf-8')
      .send(briefing.text);
  } catch (error) {
    next(error);
  }
});

app.get('/briefing', async (req, res, next) => {
  try {
    const forceRefresh = req.query.refresh === 'true';
    const briefing = await getCachedBriefing({ forceRefresh });
    res
      .set('Cache-Control', 'no-store')
      .type('text/plain; charset=utf-8')
      .send(briefing.text);
  } catch (error) {
    next(error);
  }
});

app.use((req, res) => {
  res.status(404).json({ ok: false, error: 'Not Found' });
});

app.use((error, req, res, next) => {
  console.error('[server] unhandled error', error);
  res.status(500).type('text/plain; charset=utf-8').send('브리핑을 생성하는 중 오류가 발생했습니다.');
});

const server = app.listen(port, host, () => {
  console.log(`Morning briefing bot listening on ${host}:${port}`);
});

server.on('error', (error) => {
  console.error('[server] listen error', error);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('[server] unhandled rejection', reason);
});

process.on('uncaughtException', (error) => {
  console.error('[server] uncaught exception', error);
});
