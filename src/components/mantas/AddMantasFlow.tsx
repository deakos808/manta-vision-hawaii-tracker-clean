
import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import MantaPhotosModal from "@/components/mantas/MantaPhotosModal";

type View = "ventral" | "dorsal" | "other";
type Uploaded = { id: string; name: string; url: string; path: string; view: View; isBestVentral?: boolean; isBestDorsal?: boolean; };

type MantaDraft = { id?: string; name?: string; age_class?: string; gender?: string; size?: string; photos?: Uploaded[] };

type Props = {
  open: boolean;
  onOpenChange: (v:boolean)=>void;
  sightingId: string;
  onAddManta: (manta: { id: string; name: string; age_class?: string; gender?: string; size?: string; photos: Uploaded[] }) => void;
  initialManta?: MantaDraft | null;
};

function uuid(){ if(typeof crypto!=="undefined" && "randomUUID" in crypto) return crypto.randomUUID(); return Math.random().toString(36).slice(2); }

const GENDERS = ["Male","Female","Unknown"];
const AGE_CLASSES = ["Adult","Juvenile","Yearling","Unknown"];

export default function AddMantasFlow({ open, onOpenChange, sightingId, onAddManta, initialManta }: Props){
  const [tempId, setTempId] = useState(()=>uuid());
  const [name,setName]=useState("");
  const [age,setAge]=useState("");
  const [gender,setGender]=useState("");
  const [size,setSize]=useState("");
  const [photos,setPhotos]=useState<Uploaded[]>([]);
  const [photosOpen,setPhotosOpen]=useState(false);

  const suggested = useMemo(()=> name.trim() || "A", [name]);

  useEffect(()=>{
    if(open){
      setTempId(initialManta?.id || uuid());
      setName(initialManta?.name || "");
      setAge(initialManta?.age_class || "");
      setGender(initialManta?.gender || "");
      setSize(initialManta?.size || "");
      setPhotos(initialManta?.photos || []);
    }
  },[open, initialManta?.id]);

  function handleAddPhotos(m:{id:string; name:string; photos:Uploaded[]}) {
    if(m.name) setName(m.name);
    setPhotos(m.photos||[]);
    setPhotosOpen(false);
  }

  function saveManta(){
    const finalName=(name||"").trim() || suggested;
    onAddManta({ id: tempId, name: finalName, age_class: age || undefined, gender: gender || undefined, size: size || undefined, photos });
    onOpenChange(false);
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add Manta Individual</DialogTitle>
            <DialogDescription>Give this manta a temporary name and add details. Upload photos and select best ventral/dorsal.</DialogDescription>
          </DialogHeader>

          <div className="grid gap-4">
            <div>
              <Label>Temp Name</Label>
              <Input placeholder={`e.g., ${suggested}`} value={name} onChange={(e)=>setName(e.target.value)} />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <div>
                <Label>Gender</Label>
                <Select value={gender} onValueChange={setGender}>
                  <SelectTrigger><SelectValue placeholder="Select gender" /></SelectTrigger>
                  <SelectContent>
                    {GENDERS.map(g => (<SelectItem key={g} value={g}>{g}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Age Class</Label>
                <Select value={age} onValueChange={setAge}>
                  <SelectTrigger><SelectValue placeholder="Select age class" /></SelectTrigger>
                  <SelectContent>
                    {AGE_CLASSES.map(a => (<SelectItem key={a} value={a}>{a}</SelectItem>))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Size</Label>
                <Input placeholder="e.g., 3.2 m" value={size} onChange={(e)=>setSize(e.target.value)} />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">{photos.length} photos added</div>
              <Button variant="default" type="button" onClick={()=>{ setPhotosOpen(true); }}>Add Photos</Button>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button variant="secondary" onClick={()=>onOpenChange(false)}>Close</Button>
            <Button variant="default" onClick={saveManta} disabled={photos.length===0}>Save Manta</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <MantaPhotosModal
        open={photosOpen}
        onClose={()=>setPhotosOpen(false)}
        sightingId={sightingId}
        initialTempName={name || suggested}
        onAddManta={handleAddPhotos}
      />
    </>
  );
}
