import { useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import PhotoUploadForm from "@/components/photos/PhotoUploadForm";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  sightingId: string;
};

function nextTempName(existing: string[]): string {
  // Generate A, B, C... then AA, AB...
  const toLabel = (n: number) => {
    let s = "";
    while (n >= 0) {
      s = String.fromCharCode((n % 26) + 65) + s;
      n = Math.floor(n / 26) - 1;
    }
    return s;
  };
  const used = new Set(existing.map(x => x.toUpperCase()));
  let i = 0;
  while (true) {
    const label = toLabel(i);
    if (!used.has(label)) return label;
    i++;
  }
}

export default function TempMantaModal({ open, onOpenChange, sightingId }: Props) {
  const [existingNames] = useState<string[]>([]);
  const [tempMantaId] = useState<string>(() =>
    typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2)
  );
  const [name, setName] = useState<string>("");
  const suggested = useMemo(() => (name.trim() ? name.trim() : nextTempName(existingNames)), [name, existingNames]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add Manta Individual</DialogTitle>
          <DialogDescription>
            Give this manta a temporary name (e.g., A, B, C) and upload photos. You can add more mantas later.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Temp Name</Label>
            <Input
              placeholder={`e.g., ${suggested}`}
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
            <p className="text-xs text-muted-foreground mt-1">Leave blank to use suggested “{suggested}”.</p>
          </div>

          <div className="space-y-2">
            <Label>Photos</Label>
            <PhotoUploadForm sightingId={sightingId} tempMantaId={tempMantaId} />
            <p className="text-xs text-muted-foreground">After upload, you’ll be able to mark best ventral/dorsal.</p>
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="secondary" onClick={() => onOpenChange(false)}>Close</Button>
          <Button onClick={() => onOpenChange(false)}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
