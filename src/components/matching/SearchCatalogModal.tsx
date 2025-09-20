// src/components/matching/SearchCatalogModal.tsx

import { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/lib/supabase';

interface CatalogEntry {
  pk_catalog_id: number;
  name: string;
  best_catalog_photo_url: string | null;
}

interface SearchCatalogModalProps {
  open: boolean;
  onClose: () => void;
  tempMantaId: string;
}

export default function SearchCatalogModal({ open, onClose, tempMantaId }: SearchCatalogModalProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CatalogEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSearch = async () => {
    if (!query) return;
    setLoading(true);
    setError('');
    try {
      const { data, error } = await supabase
        .from('catalog')
        .select('*')
        .or(`name.ilike.%${query}%,pk_catalog_id.eq.${query}`);
      if (error) throw error;
      setResults(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async (catalogId: number) => {
    await supabase
      .from('temp_mantas')
      .update({ suggested_catalog_id: catalogId, match_status: 'confirmed' })
      .eq('id', tempMantaId);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle>🧠 Find a Known Match</DialogTitle>
        </DialogHeader>

        <div className="flex gap-2 mb-4">
          <Input
            placeholder="Enter catalog name or ID"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
          />
          <Button onClick={handleSearch}>🔍 Search</Button>
        </div>

        {loading ? (
          <p className="text-blue-600">Searching...</p>
        ) : error ? (
          <p className="text-red-600">Error: {error}</p>
        ) : results.length === 0 ? (
          <p className="text-gray-500">No matches found.</p>
        ) : (
          <ul className="space-y-2 max-h-[400px] overflow-y-auto">
            {results.map((entry) => (
              <li
                key={entry.pk_catalog_id}
                className="border rounded p-2 flex gap-4 items-center"
              >
                {entry.best_catalog_photo_url ? (
                  <img
                    src={entry.best_catalog_photo_url}
                    alt={entry.name || `Catalog ${entry.pk_catalog_id}`}
                    className="w-20 h-20 object-cover rounded border"
                  />
                ) : (
                  <div className="w-20 h-20 bg-gray-100 flex items-center justify-center border rounded">
                    No Photo
                  </div>
                )}
                <div className="flex-1">
                  <div className="font-semibold">
                    {entry.name || `Catalog ID ${entry.pk_catalog_id}`}
                  </div>
                  <div className="text-sm text-gray-500">ID: {entry.pk_catalog_id}</div>
                </div>
                <Button size="sm" onClick={() => handleConfirm(entry.pk_catalog_id)}>✅ Match</Button>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
