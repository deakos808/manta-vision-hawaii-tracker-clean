import fs from 'fs';
import path from 'path';

function read(p){ return fs.existsSync(p) ? fs.readFileSync(p,'utf8') : null }
function write(p,s){ fs.writeFileSync(p,s) }
function insertBeforeReturnInsideComponent(src, componentName, block, marker){
  if(src.includes(marker)) return src;
  const start = src.indexOf(`function ${componentName}`) >= 0
    ? src.indexOf(`function ${componentName}`)
    : src.indexOf(`export default function ${componentName}`);
  if(start < 0) return src;
  const ret = src.indexOf('return (', start);
  if(ret < 0) return src;
  return src.slice(0, ret) + `\n  ${marker}\n` + block + '\n' + src.slice(ret);
}

function addPropToPropsBlock(src, propLine){
  const t = 'type Props = {';
  const i = src.indexOf(t);
  if(i < 0 || src.includes(propLine.trim())) return src;
  const end = src.indexOf('};', i);
  if(end < 0) return src;
  return src.slice(0, end) + `\n  ${propLine}\n` + src.slice(end);
}

function addOnSelectPropInJSX(src){
  // add onSelect={handleSelectFromMap} before "/>" if not already present
  return src.replace(/<MapDialog\b([^>]*?)\/>/, (m, props) => {
    if (/onSelect=/.test(props)) return m;
    return `<MapDialog${props} onSelect={handleSelectFromMap} />`;
  });
}

function addDataAttrOnCard(src){
  return src.replace(
    /<Card\s+key=\{s\.pk_sighting_id\}(?=[^>]*>)/,
    (m) => m.includes('data-sighting-id') ? m : m.replace(
      /<Card\s+key=\{s\.pk_sighting_id\}/,
      '<Card key={s.pk_sighting_id} data-sighting-id={s.pk_sighting_id}'
    )
  );
}

(function main(){
  const root = process.cwd();

  // --- Patch MapDialog.tsx ---
  const mapDialogPath = path.join(root, 'src/components/maps/MapDialog.tsx');
  let md = read(mapDialogPath);
  if(!md){
    console.error('[patch] MapDialog.tsx not found at', mapDialogPath);
  } else {
    // 1) Props: add onSelect
    md = addPropToPropsBlock(md, 'onSelect?: (sid: number) => void;');

    // 2) Bridge: define window callbacks inside component (back-compat for handleSelectFromMap)
    const marker = '// [map-bridge:onSelect]';
    const bridge =
`useEffect(() => {
    (window as any).__map_onSelect = (sid: number) => onSelect?.(sid);
    (window as any).handleSelectFromMap = (sid: number) => onSelect?.(sid); // back-compat
    return () => {
      try {
        delete (window as any).__map_onSelect;
        delete (window as any).handleSelectFromMap;
      } catch {}
    };
  }, [onSelect]);`;
    md = insertBeforeReturnInsideComponent(md, 'MapDialog', bridge, marker);

    write(mapDialogPath, md);
    console.log('[patch] MapDialog.tsx updated');
  }

  // --- Patch Sightings.tsx ---
  const sightingsPath = path.join(root, 'src/pages/browse_data/Sightings.tsx');
  let sg = read(sightingsPath);
  if(!sg){
    console.error('[patch] Sightings.tsx not found at', sightingsPath);
  } else {
    // 1) Insert handler function inside component (before return)
    if(!sg.includes('// [map-bridge:handler]')){
      const start = sg.indexOf('function Sightings') >= 0
        ? sg.indexOf('function Sightings')
        : sg.indexOf('export default function Sightings');
      if(start >= 0){
        const ret = sg.indexOf('return (', start);
        if(ret > 0){
          const handler =
`// [map-bridge:handler]
  function handleSelectFromMap(sid: number) {
    try { setShowMap(false); } catch {}
    const sp = new URLSearchParams(window.location.search);
    sp.set("sightingId", String(sid));
    window.history.replaceState({}, "", \`\${window.location.pathname}?\${sp.toString()}\`);
    setTimeout(() => {
      document
        .querySelector(\`[data-sighting-id="\${sid}"]\`)
        ?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 50);
  }`;
          sg = sg.slice(0, ret) + '\n  ' + handler + '\n' + sg.slice(ret);
        }
      }
    }

    // 2) Pass prop to MapDialog
    sg = addOnSelectPropInJSX(sg);

    // 3) Add data attribute on Card
    sg = addDataAttrOnCard(sg);

    write(sightingsPath, sg);
    console.log('[patch] Sightings.tsx updated');
  }
})();
