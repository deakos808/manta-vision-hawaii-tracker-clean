// File: src/pages/browse_data/BrowseData.tsx

import React from 'react';                         // classic JSX runtime
import Layout from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import hamerLogo from '@/assets/hamer_logo_1.png'; // bundled via Vite

export default function BrowseData() {
  const navigate = useNavigate();

  return (
    <Layout title="Search Database">
      {/* ── hero header ───────────────────────────────────────── */}
      <div className="bg-blue-600 text-white py-6 px-4 sm:px-8 lg:px-16 shadow text-center">
        <h1 className="text-4xl font-bold">Search Database</h1>
      </div>

      {/* ── main content ─────────────────────────────────────── */}
      <div className="max-w-3xl mx-auto py-12 px-4 text-center space-y-8">
        <p className="text-muted-foreground">
          Choose how you want to explore the data. You can search the catalog of identified
          manta rays, browse sightings by date and location, search individual manta IDs,
          or explore photos by ID.
        </p>

        <div className="grid gap-4 sm:grid-cols-4 pt-6">
          <Button
            variant="outline"
            className="text-lg py-6"
            onClick={() => navigate('/browse/catalog')}
          >
            🔍 Search Catalog
          </Button>
          <Button
            variant="outline"
            className="text-lg py-6"
            onClick={() => navigate('/browse/sightings')}
          >
            📍 Search Sightings
          </Button>
          <Button
            variant="outline"
            className="text-lg py-6"
            onClick={() => navigate('/browse/mantas')}
          >
            🐠 Search Mantas
          </Button>
          <Button
            variant="outline"
            className="text-lg py-6"
            onClick={() => navigate('/browse/photos')}
          >
            📸 Search Photos
          </Button>
        </div>

        {/* logo */}
        <div className="pt-10">
          <img
            src={hamerLogo}
            alt="Hawaii Manta Tracker logo"
            className="mx-auto w-24 h-24 opacity-50"
          />
        </div>
      </div>
    </Layout>
  );
}
