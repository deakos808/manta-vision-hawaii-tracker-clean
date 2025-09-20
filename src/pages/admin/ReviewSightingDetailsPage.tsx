// src/pages/ReviewSightingDetailsPage.tsx
import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import Layout from '@/components/layout/Layout';
import { supabase } from '@/lib/supabase';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { toast } from 'react-hot-toast';
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { CheckCircle } from 'lucide-react';

interface TempSighting {
  id: string;
  date: string;
  island: string;
  sitelocation: string;
  photographer: string;
  reviewed?: boolean;
}

interface TempManta {
  id: string;
  fk_temp_sighting_id: string;
  suggested_catalog_id: number | null;
  matching_score: number | null;
  match_status: string;
  best_photo_id: string | null;
  name: string | null;
}

interface TempPhoto {
  id: string;
  fk_temp_manta_id: string;
  photo_url: string;
  is_best_ventral: boolean;
}

export default function ReviewSightingDetailsPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [sighting, setSighting] = useState<TempSighting | null>(null);
  const [mantas, setMantas] = useState<TempManta[]>([]);
  const [photos, setPhotos] = useState<TempPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [newCatalogId, setNewCatalogId] = useState('');
  const [selectedMantaId, setSelectedMantaId] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      if (!id) return;

      const { data: sightingData } = await supabase
        .from('temp_sightings')
        .select('*')
        .eq('id', id)
        .single();

      const { data: mantasData } = await supabase
        .from('temp_mantas')
        .select('*')
        .eq('fk_temp_sighting_id', id);

      const { data: photosData } = await supabase
        .from('temp_photos')
        .select('*')
        .in('fk_temp_manta_id', mantasData?.map((m) => m.id) ?? []);

      if (sightingData) setSighting(sightingData);
      if (mantasData) setMantas(mantasData);
      if (photosData) setPhotos(photosData);

      setLoading(false);
    };

    loadData();
  }, [id]);

  const refreshMantas = async () => {
    if (!id) return;
    const { data: mantasData } = await supabase
      .from('temp_mantas')
      .select('*')
      .eq('fk_temp_sighting_id', id);
    if (mantasData) setMantas(mantasData);
  };

  const checkAndMarkReviewed = async () => {
    const allReviewed = mantas.every(m => ['confirmed', 'rejected', 'new'].includes(m.match_status));
    if (allReviewed && id) {
      const { error } = await supabase
        .from('temp_sightings')
        .update({ reviewed: true })
        .eq('id', id);
      if (!error) toast.success('✅ All mantas reviewed. Sighting marked as complete.');
    }
  };

  const confirmMatch = async (mantaId: string) => {
    const { error } = await supabase
      .from('temp_mantas')
      .update({ match_status: 'confirmed' })
      .eq('id', mantaId);
    if (error) toast.error('Failed to confirm match');
    else {
      toast.success('Match confirmed');
      refreshMantas();
      checkAndMarkReviewed();
    }
  };

  const rejectMatch = async (mantaId: string) => {
    const { error } = await supabase
      .from('temp_mantas')
      .update({ match_status: 'rejected' })
      .eq('id', mantaId);
    if (error) toast.error('Failed to reject match');
    else {
      toast.success('Match rejected');
      refreshMantas();
      checkAndMarkReviewed();
    }
  };

  const createNewCatalogEntry = async () => {
    if (!selectedMantaId) return;
    setLoading(true);
    const { data: maxData, error: maxError } = await supabase
      .from('catalog')
      .select('pk_catalog_id')
      .order('pk_catalog_id', { ascending: false })
      .limit(1)
      .single();

    if (maxError) {
      toast.error('Failed to fetch next catalog ID');
      setLoading(false);
      return;
    }

    const nextCatalogId = (maxData?.pk_catalog_id ?? 0) + 1;
    setNewCatalogId(nextCatalogId.toString());

    const { error } = await supabase
      .from('temp_mantas')
      .update({ match_status: 'new', suggested_catalog_id: nextCatalogId })
      .eq('id', selectedMantaId);

    if (error) toast.error('Failed to create new catalog entry');
    else {
      toast.success(`Marked as new individual (#${nextCatalogId})`);
      refreshMantas();
      checkAndMarkReviewed();
    }

    setNewCatalogId('');
    setSelectedMantaId(null);
    setLoading(false);
  };

  if (loading) return <Layout><p className="p-4">Loading sighting details...</p></Layout>;
  if (!sighting) return <Layout><p className="p-4 text-red-600">Sighting not found.</p></Layout>;

  return (
    <Layout>
      <div className="max-w-5xl mx-auto p-4">
        <h1 className="text-2xl font-bold mb-2">Review Sighting</h1>
        <p className="text-muted-foreground mb-4">{sighting.date} – {sighting.island} – {sighting.sitelocation}</p>

        {mantas.map((manta) => {
          const mantaPhotos = photos.filter(p => p.fk_temp_manta_id === manta.id);
          const bestPhoto = mantaPhotos.find(p => p.is_best_ventral);

          return (
            <Card key={manta.id} className="mb-6 p-4">
              <h2 className="text-lg font-semibold mb-2">
                Manta: {manta.name || 'Unnamed'}
                {['confirmed', 'rejected', 'new'].includes(manta.match_status) && (
                  <span className="text-green-600 ml-2"><CheckCircle size={18} /></span>
                )}
              </h2>

              {bestPhoto && (
                <img src={bestPhoto.photo_url} alt="best ventral" className="w-64 rounded mb-2" />
              )}

              <p><strong>Suggested Catalog ID:</strong> {manta.suggested_catalog_id ?? 'N/A'}</p>
              <p><strong>Match Score:</strong> {manta.matching_score?.toFixed(4) ?? 'N/A'}</p>
              <p><strong>Status:</strong> {manta.match_status}</p>

              <div className="flex gap-2 mt-3">
                <Button onClick={() => confirmMatch(manta.id)}>✅ Confirm Match</Button>
                <Button variant="destructive" onClick={() => rejectMatch(manta.id)}>❌ Reject</Button>
                <Dialog>
                  <DialogTrigger asChild>
                    <Button variant="outline" onClick={() => setSelectedMantaId(manta.id)}>➕ No Match – Create New Catalog Entry</Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Auto-generated Catalog ID</DialogTitle>
                    </DialogHeader>
                    {loading ? (
                      <p className="text-blue-600 px-4 py-2">Generating catalog ID...</p>
                    ) : (
                      <div className="space-y-2">
                        <p>New Catalog ID: <strong>{newCatalogId || '...'}</strong></p>
                        <Button onClick={createNewCatalogEntry} disabled={!selectedMantaId}>
                          Confirm New Entry
                        </Button>
                      </div>
                    )}
                  </DialogContent>
                </Dialog>
              </div>
            </Card>
          );
        })}
      </div>
    </Layout>
  );
}
