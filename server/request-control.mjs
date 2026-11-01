// Disconnecting the client also aborts the provider fetch and releases its slot.
export async function withClientSignal(
  req,
  res,
  operation,
  timeoutMs = 120000,
) {
  const controller = new AbortController();
  const abort = () => {
    if (!res.writableEnded) controller.abort();
  };
  const timer = setTimeout(
    () =>
      controller.abort(
        Object.assign(
          new Error(
            "This request took longer than 2 minutes and was stopped. Please try again.",
          ),
          { status: 408 },
        ),
      ),
    timeoutMs,
  );
  res.once("close", abort);
  if (req.aborted || res.destroyed) controller.abort();
  try {
    controller.signal.throwIfAborted();
    const result = await operation(controller.signal);
    controller.signal.throwIfAborted();
    return result;
  } finally {
    clearTimeout(timer);
    res.off("close", abort);
  }
}

export function createPhotoLimiter({
  now = Date.now,
  limit = 10,
  windowMs = 180000,
} = {}) {
  const accounts = new Map();
  function status(id, consume = false) {
    const time = now();
    // Remove expired buckets without retaining account identifiers indefinitely.
    for (const [key, times] of accounts) {
      if (times.at(-1) <= time - windowMs) accounts.delete(key);
    }
    const times = (accounts.get(id) ?? []).filter((t) => t > time - windowMs);
    const allowed = times.length < limit;
    if (consume && allowed) times.push(time);
    if (times.length) accounts.set(id, times);
    else accounts.delete(id);
    return {
      allowed,
      remaining: Math.max(0, limit - times.length),
      retryAfterMs:
        times.length >= limit ? Math.max(0, times[0] + windowMs - time) : 0,
    };
  }
  return { status: (id) => status(id), consume: (id) => status(id, true) };
}
