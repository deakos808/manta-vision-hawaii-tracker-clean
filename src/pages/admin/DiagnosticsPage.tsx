import { useEffect, useState } from 'react';
import Layout from '@/components/layout/Layout';
import { supabase } from '@/lib/supabase';
import { v4 as uuidv4 } from 'uuid';

// Utility type for diagnostics
type TestResult = {
  name: string;
  category: string;
  status: 'pass' | 'fail';
  message: string;
};

export default function DiagnosticsPage() {
  const [results, setResults] = useState<TestResult[]>([]);
  const [loading, setLoading] = useState(true);

  const projectId =
    import.meta.env.VITE_SUPABASE_URL?.split('.')[0].replace('https://', '') ?? 'unknown';
  const deployedAt = import.meta.env.VITE_DEPLOYED_AT;

  const getEdgeFunctionUrl = (name: string) =>
    `https://${projectId}.supabase.co/functions/v1/${name}`;

  useEffect(() => {
    const runDiagnostics = async () => {
      const newResults: TestResult[] = [];

      // AUTH & TABLE TESTS
      const {
        data: { user },
        error: authError,
      } = await supabase.auth.getUser();
      newResults.push({
        name: 'Supabase Auth',
        category: 'Auth & Tables',
        status: user ? 'pass' : 'fail',
        message: user ? `Authenticated as ${user.email}` : authError?.message || 'No session',
      });

      const { error: profileError } = await supabase.from('profiles').select('id').limit(1);
      newResults.push({
        name: 'Profiles Table Access',
        category: 'Auth & Tables',
        status: profileError ? 'fail' : 'pass',
        message: profileError?.message || 'Table read successful',
      });

      // STORAGE BUCKETS
      const buckets = ['temp-images', 'manta-images', 'csv-uploads'];
      for (const bucket of buckets) {
        const { error } = await supabase.storage.from(bucket).list('');
        newResults.push({
          name: `Bucket Exists & Readable: ${bucket}`,
          category: 'Storage Buckets',
          status: error ? 'fail' : 'pass',
          message: error ? error.message : 'Accessible',
        });
      }

      // UPLOAD & DELETE
      const file = new File(['diagnostic test file'], 'diagnostic.txt', { type: 'text/plain' });
      const path = `diagnostics/diagnostic-${Date.now()}.txt`;
      const { error: uploadErr } = await supabase.storage.from('temp-images').upload(path, file);
      newResults.push({
        name: 'Storage Upload: temp-images',
        category: 'Storage Upload/Delete',
        status: uploadErr ? 'fail' : 'pass',
        message: uploadErr ? uploadErr.message : `Uploaded to ${path}`,
      });
      if (!uploadErr) {
        const { error: delErr } = await supabase.storage.from('temp-images').remove([path]);
        newResults.push({
          name: 'Storage Delete: temp-images',
          category: 'Storage Upload/Delete',
          status: delErr ? 'fail' : 'pass',
          message: delErr ? delErr.message : 'Deleted successfully',
        });
      }

      // EDGE FUNCTION TEST
      const token = (await supabase.auth.getSession()).data.session?.access_token;
      try {
        const res = await fetch(getEdgeFunctionUrl('list-users'), {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}` },
        });
        newResults.push({
          name: 'Edge Function: list-users',
          category: 'Edge Functions',
          status: res.ok ? 'pass' : 'fail',
          message: res.ok ? 'Function call succeeded' : `HTTP ${res.status}`,
        });
      } catch (err: any) {
        newResults.push({
          name: 'Edge Function: list-users',
          category: 'Edge Functions',
          status: 'fail',
          message: err?.message || 'Request failed',
        });
      }

      // DATABASE TABLE TESTS
      try {
        // 1. Insert temp_sighting
        const tempSightingPayload = {
          id: uuidv4(),
          date: '2025-06-15',
          island: 'diagnostic',
          sitelocation: 'test-site',
          photographer: 'Test User',
          photographer_email: 'test@example.com',
        };
        const { error: tsErr } = await supabase.from('temp_sightings').insert(tempSightingPayload);
        newResults.push({
          name: 'Insert Test: temp_sightings',
          category: 'Database Tables',
          status: tsErr ? 'fail' : 'pass',
          message: tsErr ? tsErr.message : 'Inserted temp_sighting',
        });

        // 2. Insert temp_manta
        if (!tsErr) {
          const tempMantaPayload = {
            id: uuidv4(),
            fk_temp_sighting_id: tempSightingPayload.id,
            name: 'Test Manta',
          };
          const { error: tmErr } = await supabase.from('temp_mantas').insert(tempMantaPayload);
          newResults.push({
            name: 'Insert Test: temp_mantas',
            category: 'Database Tables',
            status: tmErr ? 'fail' : 'pass',
            message: tmErr ? tmErr.message : 'Inserted temp_manta',
          });

          // 3. Insert temp_photo
          if (!tmErr) {
            const tempPhotoPayload = {
              id: uuidv4(),
              fk_temp_manta_id: tempMantaPayload.id,
              photo_url: 'diagnostic.jpg',
            };
            const { error: tpErr } = await supabase.from('temp_photos').insert(tempPhotoPayload);
            newResults.push({
              name: 'Insert Test: temp_photos',
              category: 'Database Tables',
              status: tpErr ? 'fail' : 'pass',
              message: tpErr ? tpErr.message : 'Inserted temp_photo',
            });

            // Cleanup temp_photos
            await supabase.from('temp_photos').delete().eq('id', tempPhotoPayload.id);
          }

          // Cleanup temp_mantas
          await supabase.from('temp_mantas').delete().eq('id', tempMantaPayload.id);
        }

        // Cleanup temp_sightings
        await supabase.from('temp_sightings').delete().eq('id', tempSightingPayload.id);
      } catch (err: any) {
        newResults.push({
          name: 'Insert Test Chain: temp_*',
          category: 'Database Tables',
          status: 'fail',
          message: err?.message || 'Unexpected failure',
        });
      }

      setResults(newResults);
      setLoading(false);
    };
    runDiagnostics();
  }, []);

  const passCount = results.filter(r => r.status === 'pass').length;
  const failCount = results.filter(r => r.status === 'fail').length;
  const grouped = results.reduce<Record<string, TestResult[]>>((acc, r) => {
    acc[r.category] ||= [];
    acc[r.category].push(r);
    return acc;
  }, {});

  return (
    <Layout>
      <div className="max-w-4xl mx-auto mt-10 px-4">
        <h1 className="text-2xl font-bold mb-2">Application Diagnostics</h1>
        {loading ? (
          <p className="text-blue-600 font-semibold">Running Tests...</p>
        ) : (
          <>
            <div
              className={`mb-6 p-3 text-sm font-semibold rounded border ${
                failCount > 0
                  ? 'text-yellow-800 bg-yellow-100 border-yellow-300'
                  : 'text-green-800 bg-green-100 border-green-300'
              }`}
            >
              ✅ {passCount} passed | ❌ {failCount} failed
            </div>

            {Object.entries(grouped).map(([category, tests]) => (
              <div key={category} className="mb-6">
                <h2 className="text-lg font-semibold mb-2">{category}</h2>
                <div className="space-y-3">
                  {tests.map((res, i) => (
                    <div
                      key={i}
                      className={`border rounded px-4 py-2 ${
                        res.status === 'fail' ? 'border-red-500' : 'border-green-500'
                      }`}
                    >
                      <p className="font-medium">
                        {res.status === 'pass' ? '✅' : '❌'} {res.name}
                      </p>
                      <p className="text-sm text-gray-600">{res.message}</p>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </>
        )}

        <hr className="my-6" />
        <div className="text-sm text-gray-500">
          <p>
            <strong>Deployed At:</strong> {deployedAt}
          </p>
          <p>
            <strong>Supabase Project ID:</strong> {projectId}
          </p>
        </div>
      </div>
    </Layout>
  );
}
