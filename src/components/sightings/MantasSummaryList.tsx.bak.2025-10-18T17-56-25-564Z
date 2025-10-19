import { useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

type TempPhoto = {
  id?: string;
  url?: string;
  photo_url?: string;
  view?: "ventral" | "dorsal" | "other";
  is_best_ventral?: boolean;
  is_best_dorsal?: boolean;
  isBestVentral?: boolean;
  isBestDorsal?: boolean;
};

type TempManta = {
  id?: string;
  tempMantaId?: string;
  name?: string;
  photos?: TempPhoto[];
};

function photoURL(p?: TempPhoto): string | undefined {
  if (!p) return undefined;
  return p.url || p.photo_url;
}

function isBestVentral(p?: TempPhoto): boolean {
  if (!p) return false;
  return !!(p.is_best_ventral || p.isBestVentral);
}

function isBestDorsal(p?: TempPhoto): boolean {
  if (!p) return false;
  return !!(p.is_best_dorsal || p.isBestDorsal);
}

export default function MantasSummaryList(props: {
  mantas?: TempManta[];
  onEdit?: (index: number) => void;
  onRemove?: (index: number) => void;
}) {
  const list = useMemo<TempManta[]>(() => {
    if (props.mantas && Array.isArray(props.mantas)) return props.mantas;
    if (typeof window !== "undefined" && (window as any).__mantas && Array.isArray((window as any).__mantas)) {
      return (window as any).__mantas;
    }
    return [];
  }, [props.mantas]);

  return (
    <div className="space-y-3" data-probe="mantas-summary-v1">
      <h3 className="text-lg font-semibold">Mantas in this sighting</h3>

      {list.length === 0 ? (
        <Card>
          <CardContent className="py-6 text-sm text-muted-foreground">
            No mantas added yet. Use “Add Manta Photos” to add one or more mantas before submitting.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3">
          {list.map((m, idx) => {
            const name = m?.name || m?.tempMantaId || `Manta ${idx + 1}`;
            const photos = Array.isArray(m?.photos) ? m.photos! : [];
            const bestVentral = photos.find(p => isBestVentral(p));
            const bestDorsal = photos.find(p => isBestDorsal(p));
            const thumbs = photos.slice(0, 4);

            return (
              <Card key={m?.id || m?.tempMantaId || idx}>
                <CardHeader className="flex flex-row items-center justify-between space-y-0">
                  <CardTitle className="text-base">{name}</CardTitle>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => props.onEdit?.(idx)}>Edit</Button>
                    <Button variant="destructive" size="sm" onClick={() => props.onRemove?.(idx)}>Remove</Button>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap items-start gap-3">
                    {bestVentral ? (
                      <div className="text-xs">
                        <div className="mb-1 font-medium">Best ventral</div>
                        <img
                          src={photoURL(bestVentral)}
                          alt="best ventral"
                          className="h-20 w-20 rounded-md object-cover"
                        />
                      </div>
                    ) : null}

                    {bestDorsal ? (
                      <div className="text-xs">
                        <div className="mb-1 font-medium">Best dorsal</div>
                        <img
                          src={photoURL(bestDorsal)}
                          alt="best dorsal"
                          className="h-20 w-20 rounded-md object-cover"
                        />
                      </div>
                    ) : null}

                    <div className="text-xs">
                      <div className="mb-1 font-medium">Photos</div>
                      <div className="flex gap-2">
                        {thumbs.map((p, i) => (
                          <img
                            key={(p.id || photoURL(p) || "") + i}
                            src={photoURL(p)}
                            alt={p.view || "photo"}
                            className="h-16 w-16 rounded-md object-cover"
                            title={p.view}
                          />
                        ))}
                        {photos.length === 0 ? <div className="text-muted-foreground">None</div> : null}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
