import React from 'react';
import Layout from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { useNavigate, Link } from "react-router-dom";
import hamerLogo from '@/assets/hamer_logo_1.png';
import { useUserRole } from "@/hooks/useUserRole";

export default function BrowseData() {
  const { role } = useUserRole();
  const navigate = useNavigate();

  return (
    <Layout title="Search Database">
      <div className="bg-blue-600 text-white py-6 px-4 sm:px-8 lg:px-16 shadow text-center">
        <h1 className="text-4xl font-bold">Search Database</h1>
      </div>

      <div className="px-4 sm:px-8 lg:px-16 py-3 text-sm">
        <a href="/dashboard" className="text-blue-600 hover:underline">
          &larr; Return to Dashboard
        </a>
      </div>

      <div className="max-w-3xl mx-auto py-12 px-4 text-center space-y-8">
        <p className="text-muted-foreground">
          Choose how you want to explore the data. You can search the catalog of identified
          manta rays, browse sightings by date and location, search individual manta IDs,
          explore photos by ID, or browse size measurements by catalog.
        </p>

        <div className="grid gap-4 sm:grid-cols-4 pt-6">
          <Button variant="outline" onClick={() => navigate('/browse/catalog')}>
            🔍 Search Catalog
          </Button>
          <Button variant="outline" onClick={() => navigate('/browse/sightings')}>
            📍 Search Sightings
          </Button>
          <Button variant="outline" onClick={() => navigate('/browse/mantas')}>
            🐠 Search Mantas
          </Button>
          <Button variant="outline" onClick={() => navigate('/browse/photos')}>
            📸 Search Photos
          </Button>

          {role === "admin" && (
            <Link
              to="/browse/sizes"
              className="px-4 py-2 rounded bg-slate-100 border shadow-sm text-sm inline-flex items-center justify-center"
            >
              🔎 Search Sizes
            </Link>
          )}

          {role === "admin" && (
            <Link
              to="/browse/drone"
              className="px-4 py-2 rounded bg-slate-100 border shadow-sm text-sm inline-flex items-center justify-center"
            >
              🚁 Drone Surveys
            </Link>
          )}

          {role === "admin" && (
            <Link
              to="/browse/biopsies"
              className="px-4 py-2 rounded bg-slate-100 border shadow-sm text-sm inline-flex items-center justify-center"
            >
              🔬 Search Biopsies
            </Link>
          )}
        </div>

        <div className="pt-10">
          <img src={hamerLogo} alt="Hawaii Manta Tracker logo" className="mx-auto w-24 h-24 opacity-50" />
        </div>
      </div>
    </Layout>
  );
}
