import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  sightingId: number | null;
  notes: string | null | undefined;
};

function SightingNotesModal({ open, onOpenChange, sightingId, notes }: Props) {
  const text = (notes ?? "").trim();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Notes — Sighting {sightingId ?? "—"}</DialogTitle>
          <DialogDescription>
            Scroll to read the full note. Close to return to the sightings list.
          </DialogDescription>
        </DialogHeader>

        {text ? (
          <div className="whitespace-pre-wrap text-sm leading-6">{text}</div>
        ) : (
          <div className="text-sm text-muted-foreground">No notes for this sighting.</div>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default SightingNotesModal;
