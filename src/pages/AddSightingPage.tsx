import { useEffect, useState } from 'react';
import Layout from "@/components/layout/Layout";
import TempMantaModal from "@/components/photos/TempMantaModal";
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import MapboxMap from '@/components/maps/MapboxMap';
import PhotoUploadForm from '@/components/photos/PhotoUploadForm';
import { v4 as uuidv4 } from 'uuid';

interface MantaEntry {
  id: string;
  name: string;
  gender: string;
  size: string;
}

export default function AddSightingPage() { const [sightingId] = useState<string>(() => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID() : Math.random().toString(36).slice(2))); const [mantaModalOpen, setMantaModalOpen] = useState(false);
  const [date, setDate] = useState('');
  const [startTime, setStartTime] = useState('');
  const [stopTime, setStopTime] = useState('');
  const [island, setIsland] = useState('');
  const [population, setPopulation] = useState('');
  const [location, setLocation] = useState('');
  const [lat, setLat] = useState('');
  const [lon, setLon] = useState('');
  const [notes, setNotes] = useState('');
  const [photographer, setPhotographer] = useState('');
  const [photographerEmail, setPhotographerEmail] = useState('');
  const [photographerPhone, setPhotographerPhone] = useState('');
  const [totalMantasSeen, setTotalMantasSeen] = useState<number | ''>('');
  const [noPhotosTaken, setNoPhotosTaken] = useState(false);
  const [mantas, setMantas] = useState<MantaEntry[]>([]);

  useEffect(() => {
    const islandToPopulation = (island: string) => {
      if (["Maui", "Kahoʻolawe", "Lānaʻi", "Molokaʻi"].includes(island)) return "Maui Nui";
      if (["Kauaʻi", "Niʻihau"].includes(island)) return "Kauaʻi";
      return island;
    };
    setPopulation(islandToPopulation(island));
  }, [island]);

  const handleAddManta = () => {
    setMantas((prev) => [...prev, {
      id: uuidv4(),
      name: '',
      gender: '',
      size: '',
    }]);
  };

  const handlePinDrop = (newLat: string, newLon: string) => {
    setLat(newLat);
    setLon(newLon);
  };

  return (
    <Layout>
      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6">
        <h1 className="text-xl font-bold">Add New Sighting</h1>

        <Card className="p-4 space-y-4">
          <Label>Date *</Label>
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Start Time</Label>
              <Input type="time" value={startTime} onChange={(e) => setStartTime(e.target.value)} />
            </div>
            <div>
              <Label>Stop Time</Label>
              <Input type="time" value={stopTime} onChange={(e) => setStopTime(e.target.value)} />
            </div>
          </div>

          <Label>Island *</Label>
          <select value={island} onChange={(e) => setIsland(e.target.value)} className="w-full border rounded p-2">
            <option value="">Select island</option>
            {["Hawaiʻi", "Maui", "Oʻahu", "Kauaʻi", "Molokaʻi", "Lānaʻi", "Niʻihau"].map((name) => (
              <option key={name} value={name}>{name}</option>
            ))}
          </select>

          <Label>Population</Label>
          <Input value={population} readOnly />

          <Label>Location / Site *</Label>
          <Input value={location} onChange={(e) => setLocation(e.target.value)} />

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label>Latitude</Label>
              <Input value={lat} readOnly />
            </div>
            <div>
              <Label>Longitude</Label>
              <Input value={lon} readOnly />
            </div>
          </div>

          <MapboxMap lat={lat} lon={lon} onPinDrop={handlePinDrop} />
        </Card>

        <Card className="p-4 space-y-4">
          <Label>Photographer Name *</Label>
          <Input value={photographer} onChange={(e) => setPhotographer(e.target.value)} />

          <Label>Email *</Label>
          <Input type="email" value={photographerEmail} onChange={(e) => setPhotographerEmail(e.target.value)} />

          <Label>Phone</Label>
          <Input type="tel" value={photographerPhone} onChange={(e) => setPhotographerPhone(e.target.value)} />

          <Label>Notes</Label>
          <Input value={notes} onChange={(e) => setNotes(e.target.value)} />

          <Label>Total Mantas Seen</Label>
          <Input
            type="number"
            value={totalMantasSeen}
            onChange={(e) => setTotalMantasSeen(e.target.value === '' ? '' : Number(e.target.value))}
          />
        </Card>

        <div className="flex items-center space-x-2">
          <Checkbox id="noPhotos" checked={noPhotosTaken} onCheckedChange={(v) => setNoPhotosTaken(!!v)} />
          <Label htmlFor="noPhotos" className="text-red-600 font-medium">No photos taken for this sighting</Label>
        </div>

        <Card className="p-4">
          <h2 className="text-lg font-bold mb-2">+ Add Manta Individuals ({mantas.length})</h2>
          {mantas.map((m, i) => (
            <div key={m.id} className="border-b pb-4 mb-4 space-y-2">
              <Label>Name</Label>
              <Input
                value={m.name}
                onChange={(e) => {
                  const val = e.target.value;
                  setMantas((prev) => prev.map((x, idx) => idx === i ? { ...x, name: val } : x));
                }}
              />
              <PhotoUploadForm tempMantaId={m.id} />
            </div>
          ))}
          <div className="flex gap-2 mt-2"><Button onClick={handleAddManta}>+ Add Another Manta (inline)</Button><Button variant="secondary" type="button" onClick={() => setMantaModalOpen(true)}>+ Add Manta (modal)</Button></div>
        </Card>

        <Button className="mt-6" disabled>Submit Sighting (Step 3)</Button>
      </div>
    <TempMantaModal open={mantaModalOpen} onOpenChange={setMantaModalOpen} sightingId={sightingId} />
    </Layout>
  );
}
