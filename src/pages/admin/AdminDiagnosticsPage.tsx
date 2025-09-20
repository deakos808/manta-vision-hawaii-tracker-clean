// src/pages/admin/AdminDiagnosticsPage.tsx

import { useEffect, useState } from 'react';
import Layout from '@/components/layout/Layout';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { supabase } from '@/lib/supabase';

interface DiagnosticTestResult {
  name: string;
  status: 'pass' | 'fail';
  message: string;
}

export default function AdminDiagnosticsPage() {
  const [results, setResults] = useState<DiagnosticTestResult[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const runDiagnostics = async () => {
      const newResults: DiagnosticTestResult[] = [];

      // Test 1: Supabase connectivity
      try {
        const { data, error } = await supabase.from('photos').select('id').limit(1);
        if (error) throw error;
        newResults.push({ name: 'Supabase Connection', status: 'pass', message: 'Connected successfully' });
      } catch (err) {
        newResults.push({ name: 'Supabase Connection', status: 'fail', message: String(err) });
      }

      // Test 2: Check if Docker backend is up (if applicable)
      try {
        const response = await fetch('/api/docker-status'); // placeholder endpoint
        if (!response.ok) throw new Error(`Status ${response.status}`);
        newResults.push({ name: 'Docker Status', status: 'pass', message: 'Docker backend responding' });
      } catch (err) {
        newResults.push({ name: 'Docker Status', status: 'fail', message: String(err) });
      }

      // Add more test conditions here as needed

      setResults(newResults);
      setLoading(false);
    };

    runDiagnostics();
  }, []);

  const passed = results.filter((r) => r.status === 'pass').length;
  const failed = results.filter((r) => r.status === 'fail').length;

  return (
    <Layout>
      <div className="p-6 space-y-6">
        <h1 className="text-2xl font-bold">System Diagnostics</h1>
        {loading ? (
          <p>Running tests...</p>
        ) : (
          <>
            <p className="text-sm">Tests Run: {results.length} | ✅ Passed: {passed} | ❌ Failed: {failed}</p>
            <div className="grid gap-4">
              {results.map((result, idx) => (
                <Card key={idx} className="border border-gray-300">
                  <CardContent className="p-4">
                    <p className="font-semibold">
                      {result.name} <Badge variant={result.status === 'pass' ? 'success' : 'destructive'}>{result.status.toUpperCase()}</Badge>
                    </p>
                    <p className="text-sm text-muted-foreground mt-2">{result.message}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
          </>
        )}
      </div>
    </Layout>
  );
}
