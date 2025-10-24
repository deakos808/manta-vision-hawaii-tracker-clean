import fs from 'fs';

function patchFile(p, fn){ if(!fs.existsSync(p)) throw new Error('missing '+p); const s=fs.readFileSync(p,'utf8'); const o=fn(s); if(o!==s) fs.writeFileSync(p,o); }

patchFile('src/pages/browse_data/Sightings.tsx', (s) => {
  // widen mapPoints type if it's a strict generic
  s = s.replace(
    /const \[mapPoints, setMapPoints\] = useState<[^>]*>\(\[\]\);/,
    'const [mapPoints, setMapPoints] = useState<Array<{ id:number; lat:number; lon:number; date?:string|null; photographer?:string|null; total?:number|null }>>([]);'
  );

  // ensure selects include details
  s = s.replace(/select\("pk_sighting_id,latitude,longitude"\)/g,
                'select("pk_sighting_id,latitude,longitude,sighting_date,photographer,total_manta_ids")');
  s = s.replace(/select\("pk_sighting_id,latitude,longitude,sighting_date,photographer,total_mantas"\)/g,
                'select("pk_sighting_id,latitude,longitude,sighting_date,photographer,total_manta_ids")');

  // .in(...).select(...) branch
  s = s.replace(/\.in\("pk_sighting_id",\s*chunk\)\.select\("pk_sighting_id,latitude,longitude(?:,sighting_date,photographer,total_manta(?:s|_ids))?"\)/g,
                '.in("pk_sighting_id", chunk).select("pk_sighting_id,latitude,longitude,sighting_date,photographer,total_manta_ids")');

  // map rows -> points with details (species and non-species)
  s = s.replace(
    /map\(\(r: any\) => \(\{ id: Number\(r\.pk_sighting_id\), lat: Number\(r\.latitude\), lon: Number\(r\.longitude\)(?:, [^}]*)?\}\)\)/g,
    'map((r: any) => ({ id: Number(r.pk_sighting_id), lat: Number(r.latitude), lon: Number(r.longitude), date: (r.sighting_date ?? null), photographer: (r.photographer ?? null), total: (typeof r.total_manta_ids === "number" ? r.total_manta_ids : (r.total_manta_ids ? Number(r.total_manta_ids) : null)) }))'
  );

  return s;
});

patchFile('src/components/maps/MapDialog.tsx', (s) => {
  // ensure Point type accepts "total"
  s = s.replace(
    /type\s+Point\s*=\s*\{\s*id\?:?\s*number;?\s*lat:\s*number;?\s*lon:\s*number;?[^}]*\}/,
    'type Point = { id?: number; lat: number; lon: number; date?: string | null; photographer?: string | null; total?: number | null }'
  );

  // Normalize popup rendering to use "total"
  s = s.replace(/\|\s\$\{\s*\(it\.date[^\}]*\}\s*\|\s*\$\{\s*\(it\.photographer[^\}]*\}\s*\|\s*\$\{\s*\([^}]*total[^\}]*\}\s*manta\(s\)/g,
               '| ${ (it.date ?? "—") } | ${ (it.photographer ?? "—") } | ${ (typeof it.total === "number" ? it.total : (it.total ? Number(it.total) : "—")) } manta(s)');
  s = s.replace(/\|\s\$\{\s*\(p\.date[^\}]*\}\s*\|\s*\$\{\s*\(p\.photographer[^\}]*\}\s*\|\s*\$\{\s*\([^}]*total[^\}]*\}\s*manta\(s\)/g,
               '| ${ (p.date ?? "—") } | ${ (p.photographer ?? "—") } | ${ (typeof p.total === "number" ? p.total : (p.total ? Number(p.total) : "—")) } manta(s)');

  return s;
});

console.log('ok: total_manta_ids wired for popup totals');
