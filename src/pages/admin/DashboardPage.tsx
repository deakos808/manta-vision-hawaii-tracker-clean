import { Link } from "react-router-dom";
import React, { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { supabase } from '@/lib/supabase';
import Layout from '@/components/layout/Layout';
import logo from '@/assets/hamer_logo_1.png';
import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from '@/components/ui/card';

const keyFeatures = [
  {
    icon: '📷',
    title: 'Image Recognition',
    description:
      'Upload photos of manta rays for automatic identification using our advanced pattern matching algorithm.',
  },
  {
    icon: '🗂',
    title: 'Comprehensive Database',
    description:
      'Build and manage a complete catalog of manta ray individuals with sighting histories and metadata.',
  },
  {
    icon: '📊',
    title: 'Analytics & Reporting',
    description:
      'Generate insightful reports and export your data for research and conservation efforts.',
  },
];

type Stats = {
  totalMantas: number;
  totalSightings: number;
  latestActivity: string;
};

export default function DashboardPage() {
  const [stats, setStats] = useState<Stats>({
    totalMantas: 0,
    totalSightings: 0,
    latestActivity: 'Loading...',
  });

  useEffect(() => {
    const fetchData = async () => {
      const { count: mantaCount } = await supabase
        .from('catalog')
        .select('*', { count: 'exact', head: true });

      const { count: sightingCount } = await supabase
        .from('sightings')
        .select('*', { count: 'exact', head: true });

      let latestActivity = 'N/A';
      try {
        const { data: latest } = await supabase
          .from('sightings')
          .select('sighting_date')
          .order('sighting_date', { descending: true })
          .limit(1)
          .single();
        if (latest?.sighting_date) {
          latestActivity = format(new Date(latest.sighting_date), 'MMM d, yyyy');
        }
      } catch {
        latestActivity = 'Error';
      }

      setStats({
        totalMantas: mantaCount ?? 0,
        totalSightings: sightingCount ?? 0,
        latestActivity,
      });
    };

    fetchData();
  }, []);

  return (
    <Layout>
      <div className="w-full bg-gradient-to-r from-blue-600 to-blue-500 text-white py-12 px-4 text-center">
        <div className="max-w-6xl mx-auto">
          <img src={logo} alt="Manta Tracker Logo" className="h-16 mx-auto mb-4" />
          <h1 className="text-4xl sm:text-5xl font-bold mb-2">Hawaii Manta Tracker</h1>
          <p className="text-lg sm:text-xl max-w-2xl mx-auto mb-6">
            Monitor and manage manta ray sightings, identifications, and research data.
          </p>
          <div className="flex flex-col sm:flex-row justify-center gap-4">
            <Link to="/sightings/add">
              <button className="bg-white text-blue-600 font-semibold px-6 py-3 rounded-md shadow hover:bg-blue-100 transition">
                Add New Sighting
              </button>
            </Link>
            <Link to="/browse/data">
              <button className="bg-white text-blue-600 font-semibold px-6 py-3 rounded-md shadow hover:bg-blue-100 transition">
                Browse Data
              </button>
            </Link>
          </div>
        </div>
      </div>

      {/* Stats Group */}
      <div className="max-w-6xl mx-auto mt-8 px-4">
        <div className="bg-gray-50 rounded-xl p-6 grid grid-cols-1 sm:grid-cols-3 gap-6">
          <Card>
            <CardHeader>
              <CardTitle>Total Mantas</CardTitle>
            </CardHeader>
            <CardContent className="text-3xl font-bold">{stats.totalMantas}</CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Total Sightings</CardTitle>
            </CardHeader>
            <CardContent className="text-3xl font-bold">{stats.totalSightings}</CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Latest Activity</CardTitle>
            </CardHeader>
            <CardContent className="text-3xl font-bold">{stats.latestActivity}</CardContent>
          </Card>
        </div>
      </div>

      {/* Key Features Group */}
      <div className="max-w-6xl mx-auto mt-10 px-4">
        <div className="bg-gray-50 rounded-xl p-6">
          <h2 className="text-2xl sm:text-3xl font-semibold text-center mb-6 text-blue-800">Key Features</h2>
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {keyFeatures.map((feature) => (
              <Card key={feature.title} className="p-6 text-center hover:shadow-lg transition">
                <div className="text-4xl mb-2">{feature.icon}</div>
                <CardTitle className="text-lg mb-2">{feature.title}</CardTitle>
                <p className="text-sm text-gray-600">{feature.description}</p>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </Layout>
  );
}
