import React from "react";
import { Link2, Pencil } from "lucide-react";
import type { MantaDraft } from "@/components/mantas/UnifiedMantaModal";
import { resolvePhotoUrl } from "@/lib/photoUrl";

type Props = {
  mantas: MantaDraft[];
  setMantas: React.Dispatch<React.SetStateAction<MantaDraft[]>>;
  onEdit: (m: MantaDraft) => void;
  onEditPhoto?: (m: MantaDraft, photo: any) => void;
  onReplacePhoto?: (m: MantaDraft, photo: any) => void;
  onRemove: (id: string) => void;
  openMatch: (m: MantaDraft, ventralUrl?: string) => void;
  totalPhotosAll: number;
  selectedIds?: string[];
  onToggleSelect?: (id: string, checked: boolean) => void;
  onToggleAll?: (checked: boolean) => void;
};

function urlFor(p: any): string | undefined {
  return resolvePhotoUrl(p) || undefined;
}

function strictPhoto(photos: any[] | undefined, view: "ventral" | "dorsal") {
  const list = Array.isArray(photos) ? photos : [];
  const flagKey = view === "ventral" ? "is_best_manta_ventral_photo" : "is_best_manta_dorsal_photo";
  const localFlagKey = view === "ventral" ? "isBestVentral" : "isBestDorsal";
  const byFlag = list.find((p) => (p as any)[flagKey] || (p as any)[localFlagKey]);
  if (byFlag) return byFlag;
  return list.find((p) => (p?.photo_view ?? p?.view ?? p?.photoView ?? p?.view_label) === view);
}

function tempName(m: any) {
  const v = m?.name ?? m?.tempName ?? m?.mantaName ?? m?.label ?? m?.temp_name ?? m?.mp_number;
  const s = v != null ? String(v).trim() : "";
  return s || "-";
}

function fmtMeters(v: any) {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return "-";
  const meters = n >= 10 ? n / 100 : n;
  return `${meters.toFixed(2)} m`;
}

function Thumb({ url, label }: { url?: string; label: string }) {
  return (
    <div className="h-10 w-14 overflow-hidden rounded border bg-slate-50 grid place-items-center">
      {url ? (
        <img src={url} alt={label} className="h-full w-full object-cover object-center" />
      ) : (
        <span className="text-[10px] text-slate-400">{label}</span>
      )}
    </div>
  );
}

function PhotoCell({
  url,
  label,
  onEdit,
  onReplace,
}: {
  url?: string;
  label: string;
  onEdit?: () => void;
  onReplace?: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <Thumb url={url} label={label} />
      {url ? (
        <div className="flex flex-col gap-1">
          {onEdit ? (
            <button
              type="button"
              className="rounded border px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
              onClick={onEdit}
            >
              Edit photo
            </button>
          ) : null}
          {onReplace ? (
            <button
              type="button"
              className="rounded border px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
              onClick={onReplace}
            >
              Replace
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

export default function MantasList({
  mantas,
  onEdit,
  onEditPhoto,
  onReplacePhoto,
  openMatch,
  selectedIds = [],
  onToggleSelect,
  onToggleAll,
}: Props) {
  const selected = new Set(selectedIds);
  const allSelected = mantas.length > 0 && mantas.every((m: any) => selected.has(String(m?.id)));

  if (mantas.length === 0) {
    return (
      <div className="rounded-md border border-dashed bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
        No mantas added yet.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-md border bg-white">
      <table className="w-full min-w-[900px] text-sm">
        <thead className="bg-slate-50 text-left text-xs font-medium text-slate-600">
          <tr>
            <th className="w-10 px-3 py-2">
              <input
                type="checkbox"
                aria-label="Select all mantas"
                checked={allSelected}
                onChange={(event) => onToggleAll?.(event.target.checked)}
              />
            </th>
            <th className="px-3 py-2">Temp Name</th>
            <th className="px-3 py-2">Species</th>
            <th className="px-3 py-2">Photos</th>
            <th className="px-3 py-2">Ventral</th>
            <th className="px-3 py-2">Dorsal</th>
            <th className="px-3 py-2">Gender</th>
            <th className="px-3 py-2">Age</th>
            <th className="px-3 py-2">Size</th>
            <th className="px-3 py-2">Match</th>
            <th className="w-16 px-3 py-2 text-right">Edit</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {mantas.map((m: any, idx: number) => {
            const id = String(m?.id ?? idx);
            const photos = Array.isArray(m?.photos) ? m.photos : [];
            const ventPhoto = strictPhoto(photos, "ventral");
            const dorPhoto = strictPhoto(photos, "dorsal");
            const ventUrl = urlFor(ventPhoto);
            const dorUrl = urlFor(dorPhoto);
            const matchedId = (m?.matchedCatalogId ?? m?.matched_catalog_id ?? m?.fk_catalog_id) ?? null;
            const noMatch = !!(m?.noMatch || m?.no_match);

            return (
              <tr key={id} className="align-middle">
                <td className="px-3 py-2">
                  <input
                    type="checkbox"
                    aria-label={`Select manta ${tempName(m)}`}
                    checked={selected.has(id)}
                    onChange={(event) => onToggleSelect?.(id, event.target.checked)}
                  />
                </td>
                <td className="px-3 py-2 font-medium text-slate-900">{tempName(m)}</td>
                <td className="px-3 py-2 text-slate-700">{m?.species || "-"}</td>
                <td className="px-3 py-2 text-slate-700">{photos.length}</td>
                <td className="px-3 py-2"><PhotoCell url={ventUrl} label="ventral" onEdit={ventPhoto ? () => onEditPhoto?.(m, ventPhoto) : undefined} onReplace={ventPhoto ? () => onReplacePhoto?.(m, ventPhoto) : undefined} /></td>
                <td className="px-3 py-2"><PhotoCell url={dorUrl} label="dorsal" onEdit={dorPhoto ? () => onEditPhoto?.(m, dorPhoto) : undefined} onReplace={dorPhoto ? () => onReplacePhoto?.(m, dorPhoto) : undefined} /></td>
                <td className="px-3 py-2 text-slate-700">{m?.gender || "-"}</td>
                <td className="px-3 py-2 text-slate-700">{m?.ageClass || "-"}</td>
                <td className="px-3 py-2 text-slate-700">{fmtMeters(m?.size)}</td>
                <td className="px-3 py-2">
                  {matchedId != null ? (
                    <button
                      type="button"
                      className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-1 text-xs font-medium text-emerald-700"
                      onClick={() => openMatch(m, ventUrl)}
                    >
                      <Link2 size={12} /> Catalog #{matchedId}
                    </button>
                  ) : noMatch ? (
                    <button
                      type="button"
                      className="rounded-full bg-slate-100 px-2 py-1 text-xs font-medium text-slate-700"
                      onClick={() => openMatch(m, ventUrl)}
                    >
                      New
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="rounded-full bg-sky-100 px-2 py-1 text-xs font-medium text-sky-700 hover:bg-sky-200"
                      onClick={() => openMatch(m, ventUrl)}
                    >
                      Match
                    </button>
                  )}
                </td>
                <td className="px-3 py-2 text-right">
                  <button
                    type="button"
                    aria-label={`Edit manta ${tempName(m)}`}
                    className="inline-flex h-8 w-8 items-center justify-center rounded border text-slate-600 hover:bg-slate-50"
                    onClick={() => onEdit(m)}
                    title="Edit manta"
                  >
                    <Pencil size={15} />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
