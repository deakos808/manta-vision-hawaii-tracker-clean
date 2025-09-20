import * as React from "react";
import { getSightingsForCatalog } from "./data/catalog.service";

export default function SightingsCount({ pkCatalogId }: { pkCatalogId?: number | null }) {
  const id = typeof pkCatalogId === "number" ? pkCatalogId : Number(pkCatalogId);
  const [count, setCount] = React.useState(0);

  React.useEffect(() => {
    let cancel = false;
    async function load() {
      if (!Number.isInteger(id)) {
        if (!cancel) setCount(0);
        return;
      }
      try {
        const rows = await getSightingsForCatalog(id);
        if (!cancel) setCount(Array.isArray(rows) ? rows.length : 0);
      } catch {
        if (!cancel) setCount(0);
      }
    }
    load();
    return () => { cancel = true; };
  }, [id]);

  return <>View Sightings ({count})</>;
}
