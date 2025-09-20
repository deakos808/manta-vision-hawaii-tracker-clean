// src/components/MantaEntryForm.tsx
import React, { useState } from 'react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';

interface Manta {
  id: number;
  tempName: string;
  gender: string;
  ageClass: string;
  size: string;
  behavior: string;
  photos: File[];
  bestVentralIndex: number | null;
}

interface Props {
  mantas: Manta[];
  setMantas: (mantas: Manta[]) => void;
}

export default function MantaEntryForm({ mantas, setMantas }: Props) {
  const addManta = () => {
    const newManta: Manta = {
      id: Date.now(),
      tempName: '',
      gender: '',
      ageClass: '',
      size: '',
      behavior: '',
      photos: [],
      bestVentralIndex: null,
    };
    setMantas([...mantas, newManta]);
  };

  const updateManta = (index: number, field: keyof Manta, value: any) => {
    const updated = [...mantas];
    updated[index][field] = value;
    setMantas(updated);
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold">Manta Rays ({mantas.length})</h3>
        <Button onClick={addManta} variant="outline">+ Add Manta</Button>
      </div>
      <Accordion type="multiple">
        {mantas.map((manta, index) => (
          <AccordionItem key={manta.id} value={`manta-${manta.id}`}>
            <AccordionTrigger>Manta #{index + 1}</AccordionTrigger>
            <AccordionContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  placeholder="Temp Name"
                  value={manta.tempName}
                  onChange={(e) => updateManta(index, 'tempName', e.target.value)}
                />
                <Input
                  placeholder="Gender (Male, Female, Unknown)"
                  value={manta.gender}
                  onChange={(e) => updateManta(index, 'gender', e.target.value)}
                />
                <Input
                  placeholder="Age Class (Adult, Juvenile, Unknown)"
                  value={manta.ageClass}
                  onChange={(e) => updateManta(index, 'ageClass', e.target.value)}
                />
                <Input
                  placeholder="Size (disc width in cm)"
                  value={manta.size}
                  onChange={(e) => updateManta(index, 'size', e.target.value)}
                />
                <Textarea
                  placeholder="Behavior (e.g., feeding, cruising)"
                  value={manta.behavior}
                  onChange={(e) => updateManta(index, 'behavior', e.target.value)}
                />
              </div>
              {/* File upload and match UI will be added here later */}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}