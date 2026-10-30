import { MODEL, MAX_OUTPUT, MAX_INPUT } from './budget.mjs';
import { SYSTEM, resultSchema } from '../shared/contract.mjs';
import { createHash } from 'node:crypto';
export function createService({ key, budget, transport = fetch }) {
  let busy = false;
  const cache = new Map();
  const repaired = new Set();
  async function post(path, body) {
    const response = await transport('https://api.anthropic.com/v1/' + path, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01'},
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(90000)});
    if (!response.ok)
      throw Object.assign(
        new Error(
          response.status === 401
            ? 'The backend API key was rejected.'
            : response.status === 429
              ? 'Claude is busy or rate limited. Try again shortly.'
              : `Claude request failed (${response.status}).`),
        { status: 502, upstreamStatus: response.status });
    return response.json();
  }
  return async function generate(request) {
    if (cache.has(request.requestId)) return cache.get(request.requestId);
    if (busy)
      throw Object.assign(new Error('A scene is already being generated. Please wait.'), {
        status: 409});
    if (!key)
      throw Object.assign(new Error('Set CLAUDE_API in the backend .env file.'), { status: 503 });
    const repairKey = request.mode === 'repair' ? request.scene.code : null;
    if (repairKey && repaired.has(repairKey))
      throw Object.assign(
        new Error('This scene already had its one repair attempt. Try a new description.'),
        { status: 409 });
    busy = true;
    let reservation;
    const start = Date.now();
    try {
      const content = [];
      if (request.mode === 'generate')
        content.push({
          type: 'image',
          source: { type: 'base64', media_type: request.image.mediaType, data: request.image.data }});
      content.push({
        type: 'text',
        text:
          request.mode === 'generate'
            ? `Create a scene for this photo. Target hint: ${request.target || 'Identify the main object; clarify if ambiguous.'}`
            : JSON.stringify({
                task: request.mode,
                current: request.scene,
                request: request.prompt,
                error: request.error})});
      const base = { model: MODEL, system: SYSTEM, messages: [{ role: 'user', content }] };
      const counted = await post('messages/count_tokens', base);
      if (!Number.isInteger(counted.input_tokens) || counted.input_tokens > MAX_INPUT)
        throw Object.assign(
          new Error('Request context is too large. Choose a smaller photo or start a new scene.'),
          { status: 400 });
      reservation = budget.reserve(
        request.requestId,
        request.mode,
        repairKey ? createHash('sha256').update(repairKey).digest('hex') : undefined);
      if (repairKey) repaired.add(repairKey);
      const response = await post('messages', {
        ...base,
        max_tokens: MAX_OUTPUT,
        thinking: { type: 'adaptive' },
        output_config: { effort: 'low' }});
      budget.settle(reservation, response.usage, Date.now() - start);
      if (response.stop_reason !== 'end_turn')
        throw Object.assign(
          new Error('Scene generation was incomplete. Try a simpler object or request.'),
          { status: 502 });
      const text = response.content
        .filter(b=> b.type === 'text')
        .map(b=> b.text)
        .join('');
      let result;
      try {
        result = resultSchema.parse(
          JSON.parse(text.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '')));
      } catch {
        throw Object.assign(
          new Error('Claude returned an invalid scene response. Your previous scene is safe.'),
          { status: 502 });
      }
      if (request.mode !== 'generate' && result.kind !== 'scene')
        throw Object.assign(
          new Error(
            'That change needs more detail. Please describe the desired change more specifically.'),
          { status: 422 });
      const output = { result, usage: { ...reservation }, budget: budget.summary() };
      cache.set(request.requestId, output);
      if (cache.size > 30) cache.delete(cache.keys().next().value);
      return output;
    } catch (e) {
      if (reservation?.status === 'reserved') {
        if ([400, 401, 403, 404, 413, 429].includes(e.upstreamStatus)) budget.release(reservation);
        else budget.uncertain(reservation);
      }
      throw e;
    } finally {
      busy = false;
    }
  };
}
