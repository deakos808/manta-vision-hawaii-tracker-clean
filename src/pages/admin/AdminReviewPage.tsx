// src/pages/AdminReviewPage.tsx

import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import Layout from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { useUserRole } from '@/hooks/useUserRole';

export default function AdminReviewPage() {
  const { sightingId } = useParams();
  const navigate = useNavigate();
  const { role } = useUserRole();
  const [sighting, setSighting] = useState<any>(null);
  const [mantas, setMantas] = useState<any[]>([]);
  const [photosByManta, setPhotosByManta] = useState<Record<string, any[]>>({});
  const [committedMantas, setCommittedMantas] = useState<Set<string>>(new Set());
  const [committing, setCommitting] = useState(false);

  useEffect(() => {
    if (sightingId) {
      loadData(sightingId);
    }
  }, [sightingId]);

  const loadData = async (id: string) => {
    const { data: sightingData } = await supabase.from('temp_sightings').select('*').eq('id', id).single();
    setSighting(sightingData);

    const { data: mantaList } = await supabase.from('temp_mantas').select('*').eq('fk_temp_sighting_id', id);
    setMantas(mantaList || []);

    const photoMap: Record<string, any[]> = {};
    for (const manta of mantaList || []) {
      const { data: photos } = await supabase.from('temp_photos').select('*').eq('fk_temp_manta_id', manta.id);
      photoMap[manta.id] = photos || [];
    }
    setPhotosByManta(photoMap);
  };

  const commitNewIndividual = async (manta: any) => {
    setCommitting(true);
    const { data: catalogInsert, error: catalogError } = await supabase.from('catalog').insert({}).select();
    const newCatalogId = catalogInsert?.[0]?.pk_catalog_id;

    if (!newCatalogId || catalogError) {
      toast.error('Catalog creation failed');
      setCommitting(false);
      return;
    }

    const { data: mantaInsert, error: mantaError } = await supabase.from('mantas').insert({
      fk_catalog_id: newCatalogId,
      fk_sighting_id: sightingId,
      name: manta.name,
      gender: manta.gender,
      size: manta.size
    }).select();

    const newMantaId = mantaInsert?.[0]?.id;
    const photos = photosByManta[manta.id] || [];

    for (const p of photos) {
      const filename = p.photo_url.split('/').pop();
      const newPath = `manta-images/${filename}`;
      await supabase.storage.from('temp-images').move(p.photo_url, newPath);

      const { data: photoInsert, error: photoError } = await supabase.from('photos').insert({
        fk_manta_id: newMantaId,
        photo_url: `https://apweteosdbgsolmvcmhn.supabase.co/storage/v1/object/public/manta-images/${filename}`,
        photo_path: newPath,
        is_best_catalog_photo: p.is_best_ventral,
        is_best_sighting_photo: p.is_best_ventral,
        view: p.photo_type,
      }).select();

      if (photoError) toast.error('Error inserting photo');

      if (p.is_best_ventral && photoInsert?.[0]?.pk_photo_id) {
        await supabase.from('catalog').update({ best_photo_id: photoInsert[0].pk_photo_id }).eq('pk_catalog_id', newCatalogId);
        await supabase.from('sightings').update({ best_photo_id: photoInsert[0].pk_photo_id }).eq('pk_sighting_id', sighting.pk_sighting_id);
      }
    }

    toast.success(`✅ Manta ${manta.name || manta.id} committed`);
    setCommittedMantas(prev => new Set(prev).add(manta.id));
    setCommitting(false);
  };

  const commitSighting = async () => {
    if (committedMantas.size !== mantas.length) return;
    await supabase.from('temp_sightings').update({ reviewed: true }).eq('id', sighting.pk_sighting_id);
    toast.success('🚀 Sighting marked as reviewed');
    navigate('/admin');
  };

  return (
    <Layout>
      <div className="space-y-6">
        <h1 className="text-2xl font-bold">Review Sighting</h1>
        {sighting && (
          <div className="border p-4 rounded">
            <p><strong>Date:</strong> {sighting.sighting_date}</p>
            <p><strong>Island:</strong> {sighting.island}</p>
            <p><strong>Photographer:</strong> {sighting.photographer}</p>
            <p><strong>Notes:</strong> {sighting.notes || 'None'}</p>
          </div>
        )}

        <h2 className="text-xl font-semibold">Mantas</h2>
        {mantas.map(m => (
          <div key={m.id} className="border rounded p-4 mb-4">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold">Manta: {m.name || '(unnamed)'}</h3>
              {committedMantas.has(m.id) && <Badge variant="outline">✅ Committed</Badge>}
            </div>
            <p>Gender: {m.gender}, Size: {m.size}</p>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mt-3">
              {(photosByManta[m.id] || []).map((photo, idx) => (
                <div key={idx} className="relative border p-1 rounded">
                  <img src={photo.photo_url} alt={`Photo ${idx}`} className="rounded w-full" />
                  <p className="text-xs text-center">{photo.photo_type}{photo.is_best_ventral && ' 🌟 Best'}</p>
                </div>
              ))}
            </div>
            {!committedMantas.has(m.id) && role === 'admin' && (
              <div className="mt-4 space-x-2">
                <Button onClick={() => commitNewIndividual(m)} disabled={committing}>Commit New Individual</Button>
                <Button variant="secondary" disabled>Match to Existing (TBD)</Button>
                <Button variant="destructive" disabled>Delete</Button>
              </div>
            )}
          </div>
        ))}

        {role === 'admin' && (
          <div className="pt-6">
            <Button onClick={commitSighting} disabled={committedMantas.size !== mantas.length}>🚀 Commit Entire Sighting</Button>
          </div>
        )}
      </div>
    </Layout>
  );
}
