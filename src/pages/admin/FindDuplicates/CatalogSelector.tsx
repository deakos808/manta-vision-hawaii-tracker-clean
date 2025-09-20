import { useEffect, useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { cn } from "@/lib/utils";
import { searchCatalogsByIdOrName, getCatalogById } from "./data/catalog.service";
import type { CatalogSummary } from "./data/types";
import BestVentralPreview from "./BestVentralPreview";

type Props = {
  label: string;
  value: number | null;
  onChange: (id: number | null, record: CatalogSummary | null) => void;
};

type NumericStatus = "idle" | "match" | "no-match";

export default function CatalogSelector({ label, value, onChange }: Props) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<CatalogSummary[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [numStatus, setNumStatus] = useState<NumericStatus>("idle");

  // Debounced search that:
  // - For numeric queries: exact-id lookup -> select or clear + "No matches"
  // - For name queries: list results for click selection
  useEffect(() => {
    const t = setTimeout(async () => {
      if (!q) {
        setResults([]);
        setOpen(false);
        setNumStatus("idle");
        return;
      }

      const isNumeric = /^\d+$/.test(q);

      if (isNumeric) {
        // Numeric: exact match or no-match (clear selection)
        const id = Number(q);
        try {
          const rec = await getCatalogById(id);
          if (rec) {
            onChange(id, rec);
            setNumStatus("match");
            setOpen(false); // no dropdown for exact id
          } else {
            onChange(null, null);
            setNumStatus("no-match");
            setOpen(false);
          }
        } catch {
          onChange(null, null);
          setNumStatus("no-match");
          setOpen(false);
        }
      } else {
        // Name search: show dropdown, no auto-select
        setNumStatus("idle");
        setLoading(true);
        try {
          const rows = await searchCatalogsByIdOrName(q);
          setResults(rows);
          setOpen(true);
        } catch {
          setResults([]);
          setOpen(true);
        } finally {
          setLoading(false);
        }
      }
    }, 200);

    return () => clearTimeout(t);
  }, [q, onChange]);

  // Fallback text when not typing (keeps the input visually in sync with current selection)
  const selectedText = useMemo(() => (value ? `#${value}` : ""), [value]);

  return (
    <div className="w-full">
      <label className="mb-1 block text-xs font-medium text-muted-foreground">
        {label}
      </label>

      <Input
        value={q !== "" ? q : selectedText}
        onChange={(e) => {
          setQ(e.target.value);
          // typing cancels dropdown until results arrive
        }}
        onFocus={() => {
          if (q && !/^\d+$/.test(q)) setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setOpen(false);
          }
        }}
        placeholder="Type ID (auto) or Name…"
        aria-label={label}
      />

      {/* Numeric hint or general tip */}
      <div className="mt-1 text-xs">
        {numStatus === "no-match" ? (
          <span className="text-destructive">No matches</span>
        ) : (
          <span className="text-muted-foreground">Tip: typing an exact ID selects automatically.</span>
        )}
      </div>

      {/* Name results dropdown */}
      {open && (
        <div className="relative">
          <Command className="absolute z-50 mt-1 w-full rounded-md border bg-popover text-popover-foreground shadow">
            <CommandList>
              <CommandEmpty>{loading ? "Searching…" : "No results"}</CommandEmpty>
              {!loading && results.length > 0 && (
                <CommandGroup>
                  {results.map((r) => (
                    <CommandItem
                      key={r.pk_catalog_id}
                      className={cn("cursor-pointer")}
                      onSelect={() => {
                        onChange(r.pk_catalog_id, r);
                        setQ("");     // show fallback "#id" after selection
                        setOpen(false);
                      }}
                    >
                      <div className="flex w-full items-center justify-between">
                        <span className="font-medium">#{r.pk_catalog_id}</span>
                        <span className="ml-2 truncate text-sm text-muted-foreground">
                          {r.name ?? "—"}
                        </span>
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </div>
      )}

      <div className="mt-1">
        {value && (
          <a
            href="#"
            className="text-xs text-muted-foreground hover:underline"
            onClick={(e) => {
              e.preventDefault();
              setQ("");
              onChange(null, null);
              setResults([]);
              setOpen(false);
              setNumStatus("idle");
            }}
          >
            Clear
          </a>
        )}
      </div>

    </div>
  );
}
