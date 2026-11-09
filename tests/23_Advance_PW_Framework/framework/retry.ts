// Retry NON-UI work (API calls, file reads). For page checks use web-first assertions or expect.poll.
export async function retry<T>(
  fn: (attempt: number) => Promise<T>,
  { attempts = 3, delayMs = 50, backoff = 2 }: { attempts?: number; delayMs?: number; backoff?: number } = {},
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await fn(attempt);
    } catch (error) {
      lastError = error;
      if (attempt < attempts) await new Promise((r) => setTimeout(r, delayMs * backoff ** (attempt - 1)));
    }
  }
  throw lastError;
}
