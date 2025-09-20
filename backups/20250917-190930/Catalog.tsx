import { useEffect, useState, useMemo } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import Layout from '@/components/layout/Layout';
import { supabase } from '@/lib/supabase';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Eye } from 'lucide-react';
import CatalogFilterBox, {
  FiltersState,
} from '@/components/catalog/CatalogFilterBox';

/* ── types ─────────────────────────────────────────── */
interface CatalogEntry {
  pk_catalog_id: number;
  name: string;
  best_catalog_ventral_path?: string;
  best_catalog_dorsal_path?: string;
  species?: string;
  gender?: string;
  age_class?: string;
  first_sighting?: string;
  last_sighting?: string;
  total_sightings?: number;
  population?: string | null;
  island?: string | null;
  location?: string | null;
}

/* ── constants ─────────────────────────────────────── */
const EMPTY_FILTERS: FiltersState = {
  population: [],
  island: [],
  location: [],
  gender: [],
  age_class: [],
};

/* ── component ─────────────────────────────────────── */
export default function Catalog() {
  const [catalog, setCatalog]   = useState<CatalogEntry[]>([]);
  const [search, setSearch]     = useState('');
  const [filters, setFilters]   = useState<FiltersState>(EMPTY_FILTERS);
  const [sortAsc, setSortAsc]   = useState(true);
  const [viewMode, setViewMode] = useState<'ventral' | 'dorsal'>('ventral');

  const [searchParams] = useSearchParams();
  const catalogIdParam = searchParams.get('catalogId');
  const navigate       = useNavigate();

  /* fetch */
  useEffect(() => {
    const fetchData = async () => {
      let q = supabase.from('catalog_with_photo_view').select('*');
      if (catalogIdParam) q = q.eq('pk_catalog_id', catalogIdParam);
      const { data, error } = await q;
      if (error) console.error('[Load Catalog]', error.message);
      else setCatalog(data);
    };
    fetchData();
  }, [catalogIdParam]);

  /* derived list */
  const filtered = useMemo(() => {
    const lower = search.toLowerCase();
    const matchArray = (arr: string[], val?: string | null) =>
      arr.length === 0 || (val ? arr.includes(val) : false);

    return catalog
      .filter((c) => {
        const text =
          (c.name?.toLowerCase().includes(lower) ?? false) ||
          c.pk_catalog_id.toString().includes(lower);

        const byFilters =
          matchArray(filters.population, c.population) &&
          matchArray(filters.island,     c.island)     &&
          matchArray(filters.location,   c.location)   &&
          matchArray(filters.gender,     c.gender)     &&
          matchArray(filters.age_class,  c.age_class);

        return text && byFilters;
      })
      .sort((a, b) =>
        sortAsc ? a.pk_catalog_id - b.pk_catalog_id
                : b.pk_catalog_id - a.pk_catalog_id,
      );
  }, [catalog, search, filters, sortAsc]);

  /* build summary string */
  const labelMap: Record<keyof FiltersState, string> = {
    population: 'Population',
    island: 'Island',
    location: 'Location',
    gender: 'Gender',
    age_class: 'Age Class',
  };

  const summary = useMemo(() => {
    const parts = Object.entries(filters)
      .filter(([, arr]) => arr.length > 0)
      .map(
        ([k, arr]) =>
          `${labelMap[k as keyof FiltersState]}: ${arr.join(', ')}`,
      );
    return parts.join('; ');
  }, [filters]);

  /* clear */
  const clearAll = () => {
    if (catalogIdParam) navigate('/browse/catalog');
    setSearch('');
    setFilters(EMPTY_FILTERS);
    setSortAsc(true);
  };

  /* ── render ───────────────────────────────────────── */
  return (
    <Layout title="Catalog">
      {/* hero */}
      <div className="bg-blue-600 text-white py-6 px-4 sm:px-8 lg:px-16 shadow text-center">
        <h1 className="text-4xl font-bold">Catalog</h1>
      </div>

      {/* filters */}
      <div className="bg-blue-50 px-4 sm:px-8 lg:px-16 py-4 shadow-sm">
        <div className="text-sm text-blue-800 mb-2">
          <Link to="/browse/data" className="hover:underline">
            ← Return to Browse Data
          </Link>
        </div>

        <input
          className="mb-3 border rounded px-3 py-2 w-full sm:w-64 text-sm"
          placeholder="Search name or ID…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />

        <CatalogFilterBox
          catalog={catalog}
          filters={filters}
          setFilters={setFilters}
          sortAsc={sortAsc}
          setSortAsc={setSortAsc}
          onClearAll={clearAll}
        />

        {/* view toggle */}
        <div className="mt-3 flex flex-col gap-2">
          <div>
            <label className="text-sm font-medium mr-4">Photo View:</label>
            <Button
              variant={viewMode === 'ventral' ? 'default' : 'outline'}
              className="mr-2"
              onClick={() => setViewMode('ventral')}
            >
              Ventral
            </Button>
            <Button
              variant={viewMode === 'dorsal' ? 'default' : 'outline'}
              onClick={() => setViewMode('dorsal')}
            >
              Dorsal
            </Button>
          </div>

          {/* banner */}
          <div className="text-sm text-gray-700">
            {filtered.length} records showing of {catalog.length} total records
            {summary ? `, filtered by ${summary}` : ''}
          </div>
        </div>
      </div>

      {/* list */}
      <div className="px-4 sm:px-6 lg:px-12 pb-16 space-y-4">
        {filtered.map((e) => {
          const imagePath =
            viewMode === 'ventral'
              ? e.best_catalog_ventral_path
              : e.best_catalog_dorsal_path;

          const imageUrl = imagePath
            ? `https://apweteosdbgsolmvcmhn.supabase.co/storage/v1/object/public/manta-images/${imagePath}`
            : '/manta-logo.svg';

          return (
            <Card key={e.pk_catalog_id} className="flex items-center p-4 gap-6">
              <img
                src={imageUrl}
                alt="Catalog"
                className="w-28 h-28 object-cover rounded border"
                onError={(ev) => (ev.currentTarget.src = '/manta-logo.svg')}
              />

              <div className="flex-1">
                <div className="text-blue-600 font-bold text-lg">
                  <Link
                    to={`/browse/catalog?catalogId=${e.pk_catalog_id}`}
                    className="hover:underline"
                  >
                    {e.name}
                  </Link>
                </div>
                <div className="text-sm text-gray-700">Catalog&nbsp;ID: {e.pk_catalog_id}</div>
                <div className="text-sm text-gray-600">Species: {e.species || '—'}</div>
                <div className="text-sm text-gray-600">Gender: {e.gender || '—'}</div>
                <div className="text-sm text-gray-600">Age Class: {e.age_class || '—'}</div>
              </div>

              <div className="flex-1">
                <div className="text-sm text-gray-600">
                  First Sighting: {e.first_sighting || '—'}
                </div>
                <div className="text-sm text-gray-600">
                  Last Sighting: {e.last_sighting || '—'}
                </div>
                <div className="text-sm text-gray-600 mb-2">
                  Total Sightings: {e.total_sightings ?? 0}
                </div>
                <Button
                  className="text-white bg-blue-600 hover:bg-blue-700"
                  onClick={() =>
                    navigate(`/browse/sightings?catalogId=${e.pk_catalog_id}`)
                  }
                >
                  <Eye className="w-4 h-4 mr-2" />
                  View Sightings
                </Button>
              </div>
            </Card>
          );
        })}
      </div>
    </Layout>
  );
}
