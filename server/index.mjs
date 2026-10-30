import express from 'express';
import { Budget } from './budget.mjs';
import { createService } from './service.mjs';
import { requestSchema } from '../shared/contract.mjs';
import { networkInterfaces } from 'node:os';
import { openSync, closeSync, unlinkSync } from 'node:fs';
import { mkdirSync } from 'node:fs';

// One backend process owns the budget ledger; never permit competing spenders.
mkdirSync('.local', { recursive: true });
let lock;
try {
  lock = openSync('.local/server.lock', 'wx');
} catch {
  throw new Error(
    'Another backend may be running. If it crashed, remove .local/server.lock only after confirming it has stopped.');
}
process.on('exit', () => {
  closeSync(lock);
  unlinkSync('.local/server.lock');
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => process.exit(0));
const budget = new Budget('.local/usage.json', process.env.AI_BUDGET_USD ?? 5);
const generate = createService({ key: process.env.CLAUDE_API, budget });
const app = express();
app.disable('x-powered-by');
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (
    origin &&
    !/^http:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+):\d+$/.test(origin)
  )
    return res.status(403).json({ error: 'Origin is not allowed' });
  if (origin) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use(express.json({ limit: '2mb' }));
app.get('/health', (_, res) =>
  res.json({
    name: 'InteractiveWorld',
    ready: !!process.env.CLAUDE_API,
    model: 'claude-sonnet-4-6',
    effort: 'low'}));
app.get('/usage', (_, res) => res.json(budget.summary()));
app.post('/scene', async (req, res, next) => {
  try {
    const parsed = requestSchema.safeParse(req.body);
    if (!parsed.success)
      return res.status(400).json({ error: 'Invalid request. Check the image, scene and prompt.' });
    res.json(await generate(parsed.data));
  } catch (e) {
    next(e);
  }
});
app.use((err, req, res, next) => {
  const status = err.status ?? 500;
  res
    .status(status)
    .json({
      error:
        status === 413
          ? 'Photo is too large. Choose a smaller image.'
          : status === 500
            ? 'Scene request failed. Your previous scene is safe.'
            : err.message});
});
const port = Number(process.env.PORT ?? 3001);
app.listen(port, '0.0.0.0', () => {
  console.log(
    `InteractiveWorld backend ready at http://localhost:${port}; budget $${budget.limit.toFixed(2)}, accounted $${budget.summary().spent.toFixed(4)}`);
  for (const addresses of Object.values(networkInterfaces()))
    for (const a of addresses ?? [])
      if (a.family === 'IPv4' && !a.internal)
        console.log(`Phone connection: http://${a.address}:${port}`);
});
