export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    await import('./src/env');
    // Inject `after` so cache writes run after the response; it throws outside a request scope, and cache.ts then falls back to awaiting.
    const [{ setDefer }, { after }] = await Promise.all([
      import('./src/server/common/cache'),
      import('next/server'),
    ]);
    setDefer(after);
  }
}
