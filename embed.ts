import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const SUPABASE_URL = 'https://apweteosdbgsolmvcmhn.supabase.co';
const SUPABASE_SERVICE_ROLE_KEY =
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImFwd2V0ZW9zZGJnc29sbXZjbWhuIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0Njk4NzgyOSwiZXhwIjoyMDYyNTYzODI5fQ.z0CMeV4Sqyzpan-Sj3hVSr6xIXg380T7LXV70JMuFcs';

const LOCAL_EMBEDDING_SERVER_URL = 'http://192.168.1.15:5050/embed';

console.log('⚡️ Edge Function: test-embed-fix is live');

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: corsHeaders(),
    });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { photo_id } = await req.json();
    console.log('[STEP 1] Received photo_id:', photo_id);

    if (!photo_id) {
      return jsonResponse({ error: 'Missing photo_id' }, 400);
    }

    const { data: metadata, error: fetchError } = await supabase
      .from('temp_photos')
      .select('photo_url')
      .eq('id', photo_id)
      .maybeSingle();

    if (fetchError || !metadata?.photo_url) {
      console.log('[STEP 2] Photo URL not found:', fetchError?.message);
      return jsonResponse({ error: 'Photo URL not found' }, 404);
    }

    const imageUrl = metadata.photo_url;
    console.log('[STEP 3] Fetching image from:', imageUrl);

    const imageRes = await fetch(imageUrl);

    if (!imageRes.ok) {
      console.log('[STEP 4] Failed to fetch image:', imageRes.status);
      return jsonResponse({ error: 'Failed to fetch image', detail: imageUrl }, 502);
    }

    const imageBuffer = await imageRes.arrayBuffer();
    const base64Image = btoa(String.fromCharCode(...new Uint8Array(imageBuffer)));
    console.log('[STEP 5] Image fetched and base64 encoded');

    const embedRes = await fetch(LOCAL_EMBEDDING_SERVER_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ image_base64: base64Image }),
    });

    if (!embedRes.ok) {
      const errText = await embedRes.text();
      console.log('[STEP 6] Embedding server failed:', errText);
      return jsonResponse({ error: 'Embedding server error', detail: errText }, 500);
    }

    const { embedding } = await embedRes.json();
    if (!embedding || !Array.isArray(embedding)) {
      console.log('[STEP 7] Invalid embedding received');
      return jsonResponse({ error: 'Invalid embedding received' }, 422);
    }

    console.log('[STEP 8] Storing embedding to temp_photos');
    const { error: updateError } = await supabase
      .from('temp_photos')
      .update({ embedding })
      .eq('id', photo_id);

    if (updateError) {
      console.log('[STEP 9] Failed to update embedding:', updateError.message);
      return jsonResponse(
        { error: 'Failed to update temp_photos', detail: updateError.message },
        500
      );
    }

    console.log('[✅ DONE] Embedding successfully stored for:', photo_id);
    return jsonResponse({ status: 'ok', photo_id });
  } catch (err: any) {
    console.error('[❌ UNCAUGHT ERROR]', err);
    return jsonResponse({ error: 'Unexpected error', detail: err.message }, 500);
  }
});

function corsHeaders(): Record<string, string> {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json',
  };
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: corsHeaders(),
  });
}
