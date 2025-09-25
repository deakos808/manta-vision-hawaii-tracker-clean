import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

type Props = { open: boolean; onOpenChange: (v:boolean)=>void; };

export default function AddMantasModal({ open, onOpenChange }: Props){
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader><DialogTitle>Add Mantas</DialogTitle></DialogHeader>
        <div className="text-sm text-muted-foreground">
          Add-mantas workflow will go here. You can plug in your existing modal later.
        </div>
        <div className="mt-4 flex justify-end">
          <Button variant="default" onClick={()=>onOpenChange(false)}>Done</Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
