import fs from 'fs';

function patchSightings() {
  const P = 'src/pages/browse_data/Sightings.tsx';
  if (!fs.existsSync(P)) { console.error('missing', P); process.exit(1); }
  let s = fs.readFileSync(P,'utf8');

  // Widen mapPoints type to carry details
  s = s.replace(
    /const \[mapPoints, setMapPoints\] = useState<[^>]*>\(\[\]\);/,
    'const [mapPoints, setMapPoints] = useState<Array<{ id:number; lat:number; lon:number; date?:string|null; photographer?:string|null; total_mantas?:number|null }>>([]);'
  );

  // Select extra fields anywhere we fetch points
  s = s.replace(/select\("pk_sighting_id,latitude,longitude"\)/g,
                'select("pk_sighting_id,latitude,longitude,sighting_date,photographer,total_mantas")');

  // When selecting after .in(...), also include extra fields
  s = s.replace(/\.in\("pk_sighting_id",\s*chunk\)\.select\("pk_sighting_id,latitude,longitude"\)/g,
                '.in("pk_sighting_id", chunk).select("pk_sighting_id,latitude,longitude,sighting_date,photographer,total_mantas")');

  // Map rows -> points with details (species and non-species paths)
  s = s.replace(
    /map\(\(r: any\) => \(\{ id: Number\(r\.pk_sighting_id\), lat: Number\(r\.latitude\), lon: Number\(r\.longitude\) \}\)\)/g,
    'map((r: any) => ({ id: Number(r.pk_sighting_id), lat: Number(r.latitude), lon: Number(r.longitude), date: (r.sighting_date ?? null), photographer: (r.photographer ?? null), total_mantas: (typeof r.total_mantas === "number" ? r.total_mantas : (r.total_mantas ? Number(r.total_mantas) : null)) }))'
  );

  fs.writeFileSync(P, s);
  console.log('Sightings.tsx patched (points now include date, photographer, total_mantas).');
}

function patchMapDialog() {
  const P = 'src/components/maps/MapDialog.tsx';
  if (!fs.existsSync(P)) { console.error('missing', P); process.exit(1); }
  let s = fs.readFileSync(P,'utf8');

  // Expand Point type to accept the extra fields
  s = s.replace(
    /type\s+Point\s*=\s*\{\s*id:\s*number;\s*lat:\s*number;\s*lon:\s*number;\s*\}/,
    'type Point = { id: number; lat: number; lon: number; date?: string | null; photographer?: string | null; total_mantas?: number | null }'
  );

  // Replace the placeholder row " | - | - | - manta(s)" with live fields (variable in loop is usually "it")
  s = s.replace(
    /\|\s-\s\|\s-\s\|\s-\s+manta\(s\)/,
    '| ${ (it.date ?? "—") } | ${ (it.photographer ?? "—") } | ${ (typeof it.total_mantas === "number" ? it.total_mantas : (it.total_mantas ? Number(it.total_mantas) : "—")) } manta(s)'
  );

  // In case the loop variable is "p" instead of "it", try a second pass (no-op if already changed)
  s = s.replace(
    /\|\s-\s\|\s-\s\|\s-\s+manta\(s\)/,
    '| ${ (p.date ?? "—") } | ${ (p.photographer ?? "—") } | ${ (typeof p.total_mantas === "number" ? p.total_mantas : (p.total_mantas ? Number(p.total_mantas) : "—")) } manta(s)'
  );

  fs.writeFileSync(P, s);
  console.log('MapDialog.tsx patched (popup rows show date | photographer | total mantas).');
}

patchSightings();
patchMapDialog();
