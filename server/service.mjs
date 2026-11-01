import { MODEL, MAX_OUTPUT, MAX_INPUT } from "./config.mjs";
import { SYSTEM, resultSchema } from "../shared/contract.mjs";
import { parseResponseJson } from "./response-json.mjs";
export function createService({ key, transport = fetch }) {
  let busy = false;
  const cache = new Map();
  const repaired = new Set();
  async function post(path, body, signal) {
    signal?.throwIfAborted();
    const response = await transport("https://api.anthropic.com/v1/" + path, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify(body),
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(120000)])
        : AbortSignal.timeout(120000),
    });
    if (!response.ok)
      throw Object.assign(
        new Error(
          response.status === 401
            ? "The backend API key was rejected."
            : response.status === 429
              ? "The service is busy. Please try again shortly."
              : `Scene request failed (${response.status}).`,
        ),
        { status: 502, upstreamStatus: response.status },
      );
    return response.json();
  }
  return async function generate(request) {
    request.signal?.throwIfAborted();
    if (cache.has(request.requestId)) return cache.get(request.requestId);
    if (busy)
      throw Object.assign(
        new Error("A scene is already being generated. Please wait."),
        {
          status: 409,
        },
      );
    if (!key)
      throw Object.assign(
        new Error("The service is not configured. Check the backend settings."),
        {
          status: 503,
        },
      );
    const repairKey = request.mode === "repair" ? request.scene.code : null;
    if (repairKey && repaired.has(repairKey))
      throw Object.assign(
        new Error(
          "This scene already had its one repair attempt. Try a new description.",
        ),
        { status: 409 },
      );
    busy = true;
    try {
      const content = [];
      if (request.mode === "generate")
        content.push({
          type: "image",
          source: {
            type: "base64",
            media_type: request.image.mediaType,
            data: request.image.data,
          },
        });
      content.push({
        type: "text",
        text:
          request.mode === "generate"
            ? `Create a scene for this photo. Target hint: ${request.target || "Identify the main object; clarify if ambiguous."}`
            : JSON.stringify({
                task: request.mode,
                current: request.scene,
                request: request.prompt,
                error: request.error,
              }),
      });
      const base = {
        model: MODEL,
        system: SYSTEM,
        messages: [{ role: "user", content }],
      };
      const counted = await post("messages/count_tokens", base, request.signal);
      if (
        !Number.isInteger(counted.input_tokens) ||
        counted.input_tokens > MAX_INPUT
      )
        throw Object.assign(
          new Error(
            "Request context is too large. Choose a smaller photo or start a new scene.",
          ),
          { status: 400 },
        );
      request.signal?.throwIfAborted();
      if (repairKey) repaired.add(repairKey);
      const response = await post(
        "messages",
        {
          ...base,
          max_tokens: MAX_OUTPUT,
          thinking: { type: "between_tools" },
          output_config: { effort: "low" },
        },
        request.signal,
      );
      request.signal?.throwIfAborted();
      if (response.stop_reason !== "end_turn")
        throw Object.assign(
          new Error(
            "Scene generation was incomplete. Try a simpler object or request.",
          ),
          { status: 502 },
        );
      const text = response.content
        .filter((b) => b.type === "text")
        .map((b) => b.text)
        .join("");
      let result;
      try {
        result = resultSchema.parse(parseResponseJson(text));
      } catch {
        throw Object.assign(
          new Error(
            "An invalid scene response was received. Your previous scene is safe.",
          ),
          { status: 502 },
        );
      }
      if (request.mode !== "generate" && result.kind !== "scene")
        throw Object.assign(
          new Error(
            "That change needs more detail. Please describe the desired change more specifically.",
          ),
          { status: 422 },
        );
      const output = { result };
      cache.set(request.requestId, output);
      if (cache.size > 30) cache.delete(cache.keys().next().value);
      return output;
    } finally {
      if (request.signal?.aborted && repairKey) repaired.delete(repairKey);
      busy = false;
    }
  };
}
