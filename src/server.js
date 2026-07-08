import 'dotenv/config';
import dns from 'node:dns';
import express from 'express';
import { getBriefingCacheStatus, getCachedBriefing } from './services/briefingCache.js';

dns.setDefaultResultOrder('ipv4first');

const app = express();
const port = Number.parseInt(process.env.PORT ?? '3000', 10);
const host = process.env.HOST ?? '127.0.0.1';

app.disable('x-powered-by');

app.get('/', (req, res) => {
  res.type('text/plain').send('Morning briefing bot is running.');
});

app.get('/health', (req, res) => {
  res.json({ ok: true });
});

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
    const refreshToken = process.env.BRIEFING_REFRESH_TOKEN;

    if (!refreshToken || req.query.token !== refreshToken) {
      res.status(403).type('text/plain; charset=utf-8').send('Forbidden');
      return;
    }

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
    const refreshToken = process.env.BRIEFING_REFRESH_TOKEN;
    const forceRefresh = req.query.refresh === 'true' && refreshToken && req.query.token === refreshToken;
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
