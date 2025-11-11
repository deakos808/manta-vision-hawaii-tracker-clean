import { useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";

type Props = { value: boolean; onChange: (v: boolean) => void; };

export default function MprfFilter({ value, onChange }: Props) {
  const [count, setCount] = useState<number>(0);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { count } = await supabase
        .from("catalog")
        .select("pk_catalog_id", { count: "exact", head: true })
        .eq("is_mprf_added", true);
      if (!cancelled) setCount(count ?? 0);
    })();
    return () => { cancelled = true; };
  }, []);

  // click-outside to close
  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!ref.current) return;
      if (open && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className={`rounded-md border px-3 py-1.5 text-sm hover:bg-muted transition
          ${value ? "border-primary text-primary" : ""}`}
        aria-expanded={open}
      >
        MPRF
      </button>

      {open && (
        <div className="absolute z-50 mt-2 w-64 rounded-md border bg-popover p-2 shadow-md">
          <div className="px-2 pb-2 text-xs font-semibold text-muted-foreground">
            MPRF Filters
          </div>
          <button
            type="button"
            onClick={() => onChange(!value)}
            className="flex w-full items-center justify-between rounded-md px-2 py-2 hover:bg-muted"
          >
            <span className="flex items-center gap-2">
              <span className={`inline-block h-4 w-4 rounded border ${value ? "bg-primary" : "bg-background"}`} />
              <span>MPRF Records</span>
            </span>
            <span className="text-muted-foreground text-xs">{count}</span>
          </button>
        </div>
      )}
    </div>
  );
}
