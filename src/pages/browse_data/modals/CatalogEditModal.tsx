import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type CatalogEditable = {
  pk_catalog_id: number;
  name: string | null;
  species?: string | null;
  notes?: string | null;
  is_retired?: boolean | null;
  deceased?: boolean | null;
};

type Props = {
  open: boolean;
  catalog: CatalogEditable | null;
  onOpenChange: (open: boolean) => void;
  onSaved: (row: CatalogEditable) => void;
};

const SPECIES_OPTIONS = ["mobula alfredi", "mobula birostris"] as const;

export default function CatalogEditModal({ open, catalog, onOpenChange, onSaved }: Props) {
  const [name, setName] = useState("");
  const [species, setSpecies] = useState("");
  const [notes, setNotes] = useState("");
  const [isRetired, setIsRetired] = useState(false);
  const [deceased, setDeceased] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !catalog) return;
    setName(catalog.name ?? "");
    setSpecies(catalog.species ?? "");
    setNotes(catalog.notes ?? "");
    setIsRetired(!!catalog.is_retired);
    setDeceased(!!catalog.deceased);
    setSaving(false);
    setError(null);
  }, [open, catalog]);

  if (!catalog) return null;

  async function save() {
    if (!catalog) return;

    const ok = window.confirm(
      `Are you sure you want to permanently change catalog ${catalog.pk_catalog_id}?`
    );
    if (!ok) return;

    setSaving(true);
    setError(null);

    const patch = {
      name: name.trim() || null,
      species: species.trim() || null,
      notes: notes.trim() || null,
      is_retired: isRetired,
      deceased,
    };

    const { data, error: updateError } = await supabase
      .from("catalog")
      .update(patch)
      .eq("pk_catalog_id", catalog.pk_catalog_id)
      .select("pk_catalog_id,name,species,notes,is_retired,deceased")
      .single();

    setSaving(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    onSaved((data ?? { ...catalog, ...patch }) as CatalogEditable);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit Catalog {catalog.pk_catalog_id}</DialogTitle>
        </DialogHeader>

        <div className="space-y-3">
          {error ? <div className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">{error}</div> : null}

          <label className="block">
            <div className="mb-1 text-xs font-medium text-slate-600">Name</div>
            <input
              className="h-9 w-full rounded border px-3 text-sm"
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
          </label>

          <label className="block">
            <div className="mb-1 text-xs font-medium text-slate-600">Species</div>
            <select
              className="h-9 w-full rounded border px-3 text-sm"
              value={species}
              onChange={(event) => setSpecies(event.target.value)}
            >
              <option value="">(missing)</option>
              {SPECIES_OPTIONS.map((value) => (
                <option key={value} value={value}>{value}</option>
              ))}
            </select>
          </label>

          <label className="block">
            <div className="mb-1 text-xs font-medium text-slate-600">Notes</div>
            <textarea
              className="min-h-24 w-full rounded border px-3 py-2 text-sm"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </label>

          <div className="grid gap-2 sm:grid-cols-2">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={isRetired} onChange={(event) => setIsRetired(event.target.checked)} />
              Retired
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={deceased} onChange={(event) => setDeceased(event.target.checked)} />
              Deceased
            </label>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="secondary" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button type="button" onClick={save} disabled={saving}>
            {saving ? "Saving..." : "Save Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
