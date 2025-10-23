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
    const { pk_manta_id } = await req.json();
    if (!pk_manta_id) {
      return new Response(JSON.stringify({ error: 'Missing pk_manta_id' }), { status: 400, headers: corsHeaders });
    }

    const url = Deno.env.get('SUPABASE_URL')!;
    const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const sb = createClient(url, service);

    // delete photos for this manta first
    const { error: pErr } = await sb.from('photos')
      .delete()
      .eq('fk_manta_id', pk_manta_id);
    if (pErr) {
      return new Response(JSON.stringify({ error: pErr.message }), { status: 500, headers: corsHeaders });
    }

    // delete manta row
    const { error: mErr } = await sb.from('mantas')
      .delete()
      .eq('pk_manta_id', pk_manta_id);
    if (mErr) {
      return new Response(JSON.stringify({ error: mErr.message }), { status: 500, headers: corsHeaders });
    }

    return new Response(JSON.stringify({ success: true }), { status: 200, headers: corsHeaders });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || 'Unexpected error' }), { status: 500, headers: corsHeaders });
  }
});
