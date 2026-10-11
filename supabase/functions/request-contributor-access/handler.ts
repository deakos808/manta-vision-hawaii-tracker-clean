import { validateAccessRequest, type AccessRequest } from './contract.ts';
export const MAX_BODY_BYTES = 12_000;
export type Dependencies = {
  allowedOrigins: string[];
  store: (value: AccessRequest) => Promise<string | null>;
  notify: (id: string, value: AccessRequest) => Promise<void>;
  warn: (message: string) => void;
};
// Strict browser origins are a CORS boundary, not protection against non-browser spam.
export function createHandler(deps: Dependencies) {
  return async (req: Request): Promise<Response> => {
    const origin = req.headers.get('origin');
    const allowed = !!origin && deps.allowedOrigins.includes(origin);
    const headers = { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', Vary: 'Origin',
      ...(allowed ? { 'Access-Control-Allow-Origin': origin } : {}),
      'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
    const reply = (status: number, error?: string) => new Response(JSON.stringify(error ? { error } : { success: true }), { status, headers });
    if (!allowed) return reply(403, 'Request origin not allowed.');
    if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers });
    if (req.method !== 'POST') return reply(405, 'POST required.');
    if (req.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') return reply(415, 'JSON required.');
    if (Number(req.headers.get('content-length') || 0) > MAX_BODY_BYTES) return reply(413, 'Request too large.');
    // Enforce actual streamed bytes too; Content-Length alone is untrusted.
    let input: unknown;
    try {
      const reader = req.body?.getReader();
      if (!reader) return reply(400, 'Request body required.');
      let size = 0; const chunks: Uint8Array[] = [];
      try {
        while (true) {
          const { done, value } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > MAX_BODY_BYTES) { await reader.cancel(); return reply(413, 'Request too large.'); }
          chunks.push(value);
        }
      } finally { reader.releaseLock(); }
      const bytes = new Uint8Array(size); let offset = 0;
      for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
      input = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    } catch { return reply(400, 'Invalid request.'); }
    const validation = validateAccessRequest(input);
    if (validation.kind === 'honeypot') return reply(200);
    if (validation.kind === 'invalid') return reply(400, validation.message);
    try {
      const id = await deps.store(validation.value);
      if (id) {
        try { await deps.notify(id, validation.value); }
        catch { deps.warn('contributor-access: notification failed after request stored'); }
      }
      return reply(200); // Same response for a stored request, duplicate, or honeypot.
    } catch {
      deps.warn('contributor-access: storage unavailable');
      return reply(503, 'Unable to receive your request right now. Please try again later.');
    }
  };
}
