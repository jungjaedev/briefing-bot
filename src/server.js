import 'dotenv/config';
import express from 'express';
import { createBriefing } from './briefing.js';

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

app.get('/briefing', async (req, res, next) => {
  try {
    const briefing = await createBriefing();
    res.type('text/plain; charset=utf-8').send(briefing);
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
