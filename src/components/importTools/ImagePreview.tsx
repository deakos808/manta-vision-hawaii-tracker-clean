
import { useState } from 'react';
import { Card, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { X, CheckCircle, AlertCircle } from 'lucide-react';

type ImageFile = {
  file: File;
  id: string;
  preview: string;
  progress: number;
  status: 'pending' | 'uploading' | 'complete' | 'error';
  metadata: {
    filename: string;
    island: string;
    ageClass: 'juvenile' | 'adult' | 'unknown';
    gender: 'male' | 'female' | 'unknown';
  };
};

type ImagePreviewProps = {
  file: ImageFile;
  onUpdate: (metadata: Partial<ImageFile['metadata']>) => void;
  onRemove: () => void;
  disabled?: boolean;
};

const ImagePreview = ({ file, onUpdate, onRemove, disabled = false }: ImagePreviewProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  
  const hawaiianIslands = [
    'BigIsland',
    'Maui',
    'Oahu',
    'Kauai',
    'Molokai',
    'Lanai',
    'Unknown'
  ];
  
  return (
    <Card className={`overflow-hidden ${isExpanded ? 'col-span-full' : ''}`}>
      <div className="relative">
        <img 
          src={file.preview}
          alt={file.metadata.filename}
          className={`w-full object-cover ${isExpanded ? 'h-[400px]' : 'h-[200px]'}`}
          onClick={() => setIsExpanded(!isExpanded)}
        />
        
        {file.status === 'uploading' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/20">
            <Progress value={file.progress} className="w-3/4 h-2" />
          </div>
        )}
        
        {file.status === 'complete' && (
          <div className="absolute top-2 right-2">
            <CheckCircle className="h-6 w-6 text-green-500 bg-white rounded-full" />
          </div>
        )}
        
        {file.status === 'error' && (
          <div className="absolute top-2 right-2">
            <AlertCircle className="h-6 w-6 text-red-500 bg-white rounded-full" />
          </div>
        )}
        
        {!disabled && file.status === 'pending' && (
          <Button
            variant="ghost"
            size="icon"
            onClick={onRemove}
            className="absolute top-2 right-2 bg-black/50 hover:bg-black/70 text-white rounded-full h-7 w-7"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
      
      <CardContent className="pt-4">
        <div className="text-sm font-medium truncate mb-2" title={file.metadata.filename}>
          {file.metadata.filename}
        </div>
        
        <div className="grid grid-cols-2 gap-2">
          <div>
            <Label htmlFor={`island-${file.id}`} className="text-xs">
              Island
            </Label>
            <Select
              disabled={disabled}
              value={file.metadata.island}
              onValueChange={(value) => onUpdate({ island: value })}
            >
              <SelectTrigger id={`island-${file.id}`} className="h-8">
                <SelectValue placeholder="Select location" />
              </SelectTrigger>
              <SelectContent>
                {hawaiianIslands.map((island) => (
                  <SelectItem key={island} value={island}>
                    {island}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          
          <div>
            <Label htmlFor={`age-${file.id}`} className="text-xs">
              Age Class
            </Label>
            <Select
              disabled={disabled}
              value={file.metadata.ageClass}
              onValueChange={(value) => onUpdate({ 
                ageClass: value as 'juvenile' | 'adult' | 'unknown'
              })}
            >
              <SelectTrigger id={`age-${file.id}`} className="h-8">
                <SelectValue placeholder="Select age" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="juvenile">Juvenile</SelectItem>
                <SelectItem value="adult">Adult</SelectItem>
                <SelectItem value="unknown">Unknown</SelectItem>
              </SelectContent>
            </Select>
          </div>
          
          <div className="col-span-2">
            <Label htmlFor={`gender-${file.id}`} className="text-xs">
              Gender
            </Label>
            <Select
              disabled={disabled}
              value={file.metadata.gender}
              onValueChange={(value) => onUpdate({
                gender: value as 'male' | 'female' | 'unknown'
              })}
            >
              <SelectTrigger id={`gender-${file.id}`} className="h-8">
                <SelectValue placeholder="Select gender" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="male">Male</SelectItem>
                <SelectItem value="female">Female</SelectItem>
                <SelectItem value="unknown">Unknown</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default ImagePreview;
