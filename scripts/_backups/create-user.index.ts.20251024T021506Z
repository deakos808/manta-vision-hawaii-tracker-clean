// supabase/functions/create-user/index.ts
import { serve } from 'https://deno.land/std@0.192.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': '*',
  'Content-Type': 'application/json',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), { status: 405, headers: corsHeaders });
  }

  try {
    const { email, password, role, admin_id } = await req.json();
    if (!email || !password || !role || !admin_id) {
      return new Response(JSON.stringify({ error: 'Missing required fields' }), { status: 400, headers: corsHeaders });
    }

    const url = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const sb = createClient(url, serviceKey);

    const emailLower = String(email).trim().toLowerCase();
    let userId: string | null = null;

    // 1) Create auth user (or detect conflict)
    const { data: created, error: createErr } = await sb.auth.admin.createUser({
      email: emailLower,
      password,
      email_confirm: false,
    });

    if (created?.user?.id) {
      userId = created.user.id;
    } else {
      const already = (createErr?.message || '').toLowerCase().includes('already been registered');
      if (!already) {
        return new Response(JSON.stringify({ error: createErr?.message || 'Auth user creation failed' }), { status: 500, headers: corsHeaders });
      }

      // Find existing user via Auth Admin (not PostgREST)
      let page = 1; const perPage = 200;
      while (!userId) {
        const { data, error } = await sb.auth.admin.listUsers({ page, perPage });
        if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: corsHeaders });
        const hit = data?.users?.find((u: any) => (u.email || '').toLowerCase() === emailLower);
        if (hit) { userId = hit.id; break; }
        if (!data?.users?.length || data.users.length < perPage) break;
        page += 1;
      }
      if (!userId) {
        return new Response(JSON.stringify({ error: 'Auth user exists but could not be located' }), { status: 500, headers: corsHeaders });
      }
    }

    // 2) Idempotent profile upsert
    const upsertPayload = {
      id: userId,
      email: emailLower,
      role,
      is_active: true,
      created_by: admin_id,
      updated_at: new Date().toISOString(),
    };
    const { error: upsertErr } = await sb.from('profiles').upsert(upsertPayload, { onConflict: 'id' });
    if (upsertErr) {
      return new Response(JSON.stringify({ error: upsertErr.message }), { status: 500, headers: corsHeaders });
    }

    // 3) Generate a password set link and email it via Resend (optional)
    let emailed = false;
    try {
      // Supabase will return an action_link for password recovery (set-password)
      const { data: linkData, error: linkErr } = await sb.auth.admin.generateLink({
        type: 'recovery',
        email: emailLower,
      });
      const actionLink = linkData?.properties?.action_link;
      const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY');

      if (!linkErr && actionLink && RESEND_API_KEY) {
        const mail = await fetch('https://api.resend.com/emails', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${RESEND_API_KEY}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    from: 'Acme <onboarding@resend.dev>',
    to: [emailLower],
    subject: 'You have been invited to Hawaii Manta Tracker',
    html: `
      <p>You have been invited to the Hawaii Manta Tracker.</p>
      <p>Click the button below to set your password and sign in:</p>
      <p><a href="${actionLink}" style="padding:10px 16px;background:#0b66ff;color:#fff;border-radius:6px;text-decoration:none">Set Password</a></p>
      <p>If the button does not work, copy and paste this URL into your browser:</p>
      <p><a href="${actionLink}">${actionLink}</a></p>
    `,
  }),
});
if (!mail.ok) {
  const e = await mail.text().catch(() => '');
  console.log('[resend] status', mail.status, e);
}
emailed = mail.ok;
      }
    } catch (_) {
      // do not fail the request if email sending fails; frontend can show success and you can resend manually
    }

    return new Response(JSON.stringify({ success: true, user_id: userId, emailed }), { status: 200, headers: corsHeaders });
  } catch (err: any) {
    return new Response(JSON.stringify({ error: err?.message || 'Unexpected error' }), { status: 500, headers: corsHeaders });
  }
});
