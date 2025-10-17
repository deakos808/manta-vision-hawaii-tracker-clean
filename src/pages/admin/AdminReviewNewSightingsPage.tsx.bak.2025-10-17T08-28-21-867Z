// src/pages/AdminReviewNewSightingsPage.tsx
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Layout from '@/components/layout/Layout';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';

interface TempSighting {
  id: string;
  date: string;
  island: string;
  sitelocation: string;
  photographer: string;
  created_at: string;
}

export default function AdminReviewNewSightingsPage() {
  const [pendingSightings, setPendingSightings] = useState<TempSighting[]>([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const fetchSightings = async () => {
      const { data, error } = await supabase
        .from('temp_sightings')
        .select('id, date, island, sitelocation, photographer, created_at')
        .eq('reviewed', false)
        .order('created_at', { ascending: false });

      if (!error && data) setPendingSightings(data);
      setLoading(false);
    };
    fetchSightings();
  }, []);

  return (
    <Layout>
      <div className="max-w-4xl mx-auto px-4 py-10">
        <h1 className="text-2xl font-bold mb-4">🕵️‍♂️ New Sightings Needing Review</h1>

        {loading ? (
          <p className="text-blue-600">Loading sightings...</p>
        ) : pendingSightings.length === 0 ? (
          <div className="text-green-600 font-medium">✅ All sightings have been reviewed!</div>
        ) : (
          <ul className="space-y-4">
            {pendingSightings.map((sighting) => (
              <li
                key={sighting.id}
                className="border rounded px-4 py-3 bg-white shadow-sm"
              >
                <p className="text-sm text-gray-600">📅 {sighting.date}</p>
                <p className="text-lg font-semibold">
                  {sighting.island} – {sighting.sitelocation}
                </p>
                <p className="text-sm">Photographer: {sighting.photographer}</p>
                <p className="text-xs text-gray-500">
                  Submitted: {new Date(sighting.created_at).toLocaleString()}
                </p>
                <div className="mt-3">
                  <Button onClick={() => navigate(`/admin/review/sighting/${sighting.id}`)}>
                    🔍 Review
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </Layout>
  );
}
