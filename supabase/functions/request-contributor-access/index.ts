import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.4';
import { resolveSecretKey } from '../_shared/server-keys.ts';
import { createHandler } from './handler.ts';
import type { AccessRequest } from './contract.ts';

const escapeHtml = (value: unknown) => String(value ?? '—').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
export async function notifyRequest(id: string, value: AccessRequest) {
  const key = Deno.env.get('RESEND_API_KEY');
  const to = Deno.env.get('ADMIN_NOTIFICATION_EMAIL');
  const from = Deno.env.get('NOTIFICATION_FROM_EMAIL');
  if (!key || !to || !from) throw new Error('Notification configuration unavailable');
  const fields = [['Name', value.full_name], ['Email', value.email], ['Organization', value.organization],
    ['Regions', value.regions.join(', ')], ['Approximate photo count', value.photo_count_range],
    ['Earliest year', value.earliest_year], ['Experience / notes', value.experience_notes]];
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST', signal: AbortSignal.timeout(10000),
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'Idempotency-Key': `manta-contributor-request/${id}` },
    body: JSON.stringify({ from, to: [to], subject: `New MantaTracker contributor access request — ${value.full_name}`,
      html: `<h2>Contributor access request</h2>${fields.map(([label, v]) => `<p>${label}: ${escapeHtml(v)}</p>`).join('')}<p><a href="https://www.mantatracker.com/admin/contributor-requests">Review contributor request</a></p>` }),
  });
  if (!response.ok) throw new Error('Notification delivery failed');
}
serve(createHandler({
  // Explicit origins only: no wildcard, suffix match, or reflected arbitrary origin.
  allowedOrigins: (Deno.env.get('ALLOWED_ORIGINS') ?? '').split(',').map(v => v.trim()).filter(v => /^https?:\/\//.test(v) && !v.includes('*')),
  async store(value) {
    const client = createClient(Deno.env.get('SUPABASE_URL')!, resolveSecretKey(), { auth: { persistSession: false, autoRefreshToken: false } });
    const { data, error } = await client.rpc('receive_contributor_access_request', { request: value });
    if (error) throw new Error('Storage unavailable');
    return data as string | null;
  },
  notify: notifyRequest,
  warn: message => console.warn(message), // Never log applicant details or provider responses.
}));
