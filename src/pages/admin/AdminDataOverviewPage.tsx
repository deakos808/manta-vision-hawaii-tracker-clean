// src/pages/AdminDataOverviewPage.tsx

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import Layout from '@/components/layout/Layout';

type OverviewStats = {
  total_catalogs: number | null;
  total_sightings: number | null;
  total_mantas: number | null;
  total_photos: number | null;
  avg_sightings_per_catalog: number | null;
  min_sightings_per_catalog: number | null;
  max_sightings_per_catalog: number | null;
  avg_mantas_per_sighting: number | null;
  min_mantas_per_sighting: number | null;
  max_mantas_per_sighting: number | null;
  avg_photos_per_manta: number | null;
};

type IntegrityStats = {
  mantas_missing_catalog: number | null;
  mantas_missing_sighting: number | null;
  sightings_without_mantas: number | null;
  catalogs_without_sightings: number | null;
};

export default function AdminDataOverviewPage() {
  const [stats, setStats] = useState<OverviewStats>({
    total_catalogs: null,
    total_sightings: null,
    total_mantas: null,
    total_photos: null,
    avg_sightings_per_catalog: null,
    min_sightings_per_catalog: null,
    max_sightings_per_catalog: null,
    avg_mantas_per_sighting: null,
    min_mantas_per_sighting: null,
    max_mantas_per_sighting: null,
    avg_photos_per_manta: null,
  });

  const [integrity, setIntegrity] = useState<IntegrityStats>({
    mantas_missing_catalog: null,
    mantas_missing_sighting: null,
    sightings_without_mantas: null,
    catalogs_without_sightings: null,
  });

  useEffect(() => {
    const fetchStats = async () => {
      const [overviewRes, integrityRes] = await Promise.all([
        supabase.rpc('get_admin_data_overview'),
        supabase.rpc('get_data_integrity_stats'),
      ]);

      if (overviewRes.error) {
        console.error('Overview stats error:', overviewRes.error);
      } else if (overviewRes.data && overviewRes.data.length > 0) {
        setStats(overviewRes.data[0]);
      }

      if (integrityRes.error) {
        console.error('Integrity stats error:', integrityRes.error);
      } else if (integrityRes.data && integrityRes.data.length > 0) {
        setIntegrity(integrityRes.data[0]);
      }
    };

    fetchStats();
  }, []);

  return (
    <Layout>
      <div className="max-w-5xl mx-auto py-10 px-4">
        <h1 className="text-3xl font-bold mb-6">Data Overview</h1>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
          <StatCard title="Catalogs" value={stats.total_catalogs} />
          <StatCard title="Sightings" value={stats.total_sightings} />
          <StatCard title="Mantas" value={stats.total_mantas} />
          <StatCard title="Photos" value={stats.total_photos} />
        </div>

        <div className="bg-blue-50 rounded-xl shadow p-6 mt-10">
          <h2 className="font-semibold text-lg mb-4">Relationship Averages</h2>
          <StatDetail label="📄 Avg. Sightings per Catalog" value={stats.avg_sightings_per_catalog} />
          <StatDetail label="🌐 Min Sightings per Catalog" value={stats.min_sightings_per_catalog} />
          <StatDetail label="🚀 Max Sightings per Catalog" value={stats.max_sightings_per_catalog} />
          <StatDetail label="🔥 Avg. Mantas per Sighting" value={stats.avg_mantas_per_sighting} />
          <StatDetail label="🪑 Min Mantas per Sighting" value={stats.min_mantas_per_sighting} />
          <StatDetail label="🍋 Max Mantas per Sighting" value={stats.max_mantas_per_sighting} />
          <StatDetail label="🌟 Avg. Photos per Manta" value={stats.avg_photos_per_manta} />
        </div>

        <div className="bg-red-50 rounded-xl shadow p-6 mt-10">
          <h2 className="font-semibold text-lg mb-4">Data Integrity Checks</h2>
          <StatDetail label="🟥 Mantas missing CatalogID" value={integrity.mantas_missing_catalog} />
          <StatDetail label="🟧 Mantas missing SightingID" value={integrity.mantas_missing_sighting} />
          <StatDetail label="🟨 Sightings without Mantas" value={integrity.sightings_without_mantas} />
          <StatDetail label="🟦 Catalogs without Sightings" value={integrity.catalogs_without_sightings} />
        </div>
      </div>
    </Layout>
  );
}

function StatCard({ title, value }: { title: string; value: number | null }) {
  return (
    <div className="bg-white rounded-xl shadow p-4">
      <h2 className="font-semibold text-lg">{title}</h2>
      <p className="text-3xl">{value ?? '—'}</p>
    </div>
  );
}

function StatDetail({ label, value }: { label: string; value: number | null }) {
  return (
    <p className="mb-1">
      {label}: <strong>{value ?? '—'}</strong>
    </p>
  );
}
