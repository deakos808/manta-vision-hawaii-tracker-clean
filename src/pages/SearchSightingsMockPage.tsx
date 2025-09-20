// src/pages/SearchSightingsMockPage.tsx

import { useState, useMemo } from 'react';
import Layout from '@/components/layout/Layout';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectItem, SelectTrigger, SelectContent, SelectValue } from '@/components/ui/select';
import { debounce } from 'lodash';

interface Sighting {
  pk_sighting_id: number;
  sighting_date: string;
  start_time: string;
  end_time: string;
  sitelocation: string;
  island: string;
  latitude: number;
  longitude: number;
  photographer: string;
  organization: string;
  total_mantas: number;
}

const MOCK_DATA: Sighting[] = [
  {
    pk_sighting_id: 1,
    sighting_date: '2024-09-11',
    start_time: '10:00:00',
    end_time: '11:00:00',
    sitelocation: 'Kaneohe Bay',
    island: 'Oahu',
    latitude: 21.444,
    longitude: -157.788,
    photographer: 'Jasmine Reighard',
    organization: 'NOAA',
    total_mantas: 4,
  },
  {
    pk_sighting_id: 2,
    sighting_date: '2024-09-27',
    start_time: '13:00:00',
    end_time: '13:30:00',
    sitelocation: 'Ukumehame',
    island: 'Maui',
    latitude: 20.782,
    longitude: -156.602,
    photographer: 'Corey Nevels',
    organization: 'MPRC',
    total_mantas: 1,
  },
  {
    pk_sighting_id: 3,
    sighting_date: '2024-08-05',
    start_time: '08:00:00',
    end_time: '09:15:00',
    sitelocation: 'Makena Landing',
    island: 'Maui',
    latitude: 20.653,
    longitude: -156.441,
    photographer: 'Mathias Soerensen',
    organization: 'NOAA',
    total_mantas: 7,
  },
];

export default function SearchSightingsMockPage() {
  const [search, setSearch] = useState('');
  const [island, setIsland] = useState('');
  const [photographer, setPhotographer] = useState('');
  const [minMantas, setMinMantas] = useState('0');

  const debouncedSearch = useMemo(() => debounce(setSearch, 200), []);

  const filtered = useMemo(() => {
    return MOCK_DATA.filter((s) => {
      const matchesSearch = [
        s.sighting_date,
        s.sitelocation,
        s.photographer,
        s.organization,
      ]
        .join(' ')
        .toLowerCase()
        .includes(search.toLowerCase());

      const matchesIsland = island ? s.island === island : true;
      const matchesPhotographer = photographer ? s.photographer === photographer : true;
      const matchesMantas = s.total_mantas >= parseInt(minMantas);

      return matchesSearch && matchesIsland && matchesPhotographer && matchesMantas;
    });
  }, [search, island, photographer, minMantas]);

  const uniquePhotographers = [...new Set(MOCK_DATA.map((s) => s.photographer))];
  const uniqueIslands = [...new Set(MOCK_DATA.map((s) => s.island))];

  return (
    <Layout>
      <div className="space-y-4">
        <h1 className="text-2xl font-bold">Search Sightings (Mock)</h1>

        <Input
          placeholder="Search text..."
          onChange={(e) => debouncedSearch(e.target.value)}
          className="w-full max-w-lg"
        />

        <div className="flex flex-wrap gap-4">
          <div className="w-48">
            <Label>Island</Label>
            <Select value={island} onValueChange={setIsland}>
              <SelectTrigger><SelectValue placeholder="All" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">All</SelectItem>
                {uniqueIslands.map((is) => (
                  <SelectItem key={is} value={is}>{is}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="w-48">
            <Label>Photographer</Label>
            <Select value={photographer} onValueChange={setPhotographer}>
              <SelectTrigger><SelectValue placeholder="All" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">All</SelectItem>
                {uniquePhotographers.map((p) => (
                  <SelectItem key={p} value={p}>{p}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="w-32">
            <Label>Min Mantas</Label>
            <Input
              type="number"
              min="0"
              value={minMantas}
              onChange={(e) => setMinMantas(e.target.value)}
            />
          </div>
        </div>

        <div className="space-y-4">
          {filtered.map((sighting) => (
            <Card key={sighting.pk_sighting_id}>
              <CardContent className="p-4 space-y-1">
                <p><strong>ID:</strong> {sighting.pk_sighting_id}</p>
                <p><strong>Date:</strong> {sighting.sighting_date}</p>
                <p><strong>Time:</strong> {sighting.start_time} – {sighting.end_time}</p>
                <p><strong>Location:</strong> {sighting.sitelocation}</p>
                <p><strong>Island:</strong> {sighting.island}</p>
                <p><strong>Lat/Lng:</strong> {sighting.latitude}, {sighting.longitude}</p>
                <p><strong>Photographer:</strong> {sighting.photographer}</p>
                <p><strong>Organization:</strong> {sighting.organization}</p>
                <p><strong>Total Mantas:</strong> {sighting.total_mantas}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    </Layout>
  );
}
