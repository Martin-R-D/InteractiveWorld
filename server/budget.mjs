import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';

export const MODEL = 'claude-sonnet-4-6';
export const MAX_OUTPUT = 6000;
// Max input is additionally checked with Anthropic's free token-count endpoint.
export const MAX_INPUT = 16000;
export const RESERVATION = (MAX_INPUT * 3 + MAX_OUTPUT * 15) / 1e6;
export const costOf = u => (u.input_tokens * 3 + u.output_tokens * 15) / 1e6;
export class Budget {
  constructor(path, limit = 5) {
    this.path = path;
    this.limit = Math.min(5, Number(limit));
    if (!Number.isFinite(this.limit) || this.limit <= 0) throw new Error('Invalid budget');
    this.entries = existsSync(path) ? JSON.parse(readFileSync(path, 'utf8')) : [];
    if (
      !Array.isArray(this.entries) ||
      this.entries.some(e=> !Number.isFinite(e.cost) || e.cost < 0)
    )
      throw new Error('Usage ledger is invalid; refusing paid requests');
  }
  save() {
    mkdirSync(dirname(this.path), { recursive: true });
    writeFileSync(this.path + '.tmp', JSON.stringify(this.entries, null, 2));
    renameSync(this.path + '.tmp', this.path);
  }
  summary() {
    const spent = this.entries.reduce((s, e) => s + e.cost, 0);
    return {
      model: MODEL,
      effort: 'low',
      spent,
      limit: this.limit,
      remaining: Math.max(0, this.limit - spent),
      requests: this.entries.length,
      entries: this.entries.map(
        ({ id, status, cost, input_tokens, output_tokens, durationMs, mode }) => ({
          id,
          status,
          cost,
          input_tokens,
          output_tokens,
          durationMs,
          mode}))};
  }
  reserve(id, mode) {
    if (this.entries.some(e=> e.id === id))
      throw Object.assign(
        new Error('This request was already submitted. Check the existing result before retrying.'),
        { status: 409 });
    if (this.summary().remaining + 1e-9 < RESERVATION)
      throw Object.assign(new Error('Testing budget reached. No paid request was sent.'), {
        status: 402});
    const entry = {
      id,
      mode,
      model: MODEL,
      effort: 'low',
      status: 'reserved',
      cost: RESERVATION,
      at: new Date().toISOString()};
    this.entries.push(entry);
    this.save();
    return entry;
  }
  settle(entry, usage, durationMs) {
    if (
      !Number.isInteger(usage?.input_tokens) ||
      !Number.isInteger(usage?.output_tokens) ||
      usage.input_tokens < 0 ||
      usage.output_tokens < 0
    ) {
      entry.status = 'uncertain';
      this.save();
      return;
    }
    Object.assign(entry, usage, { cost: costOf(usage), durationMs, status: 'complete' });
    this.save();
  }
  uncertain(entry) {
    entry.status = 'uncertain';
    this.save();
  }
  release(entry) {
    entry.status = 'rejected';
    entry.cost = 0;
    this.save();
  }
}
