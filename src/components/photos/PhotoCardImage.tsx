import { mantaPhotoSource } from "@/features/photos/authenticatedPhotoUrl";
import { MantaImage } from "@/features/photos/MantaImage";
import { useState } from 'react';
import fallbackImage from '@/assets/hamer_logo_1.png';
import { Loader2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface PhotoCardImageProps {
  storagePath: string | null;
  photoId: number;
}

export default function PhotoCardImage({ storagePath, photoId }: PhotoCardImageProps) {
  const [isLoaded, setIsLoaded] = useState(false);
  const [isError, setIsError] = useState(false);

  const photoUrl = storagePath
    ? mantaPhotoSource({storage_path: storagePath})
    : fallbackImage;

  return (
    <div className="relative w-full h-48 bg-gray-200 overflow-hidden">
      {!isLoaded && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-100 z-10">
          <Loader2 className="w-6 h-6 animate-spin text-gray-500" />
        </div>
      )}
      <MantaImage
        src={isError ? fallbackImage : photoUrl}
        alt={`Photo ${photoId}`}
        className={`w-full h-full object-cover transition-opacity duration-300 ${
          isLoaded ? 'opacity-100' : 'opacity-0'
        } ${isError ? 'grayscale' : ''}`}
        loading="lazy"
        onLoad={() => setIsLoaded(true)}
        onError={() => {
          setIsError(true);
          setIsLoaded(true);
        }}
      />
      {isError && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/50 text-white text-sm font-medium">
          No image available
        </div>
      )}
    </div>
  );
}
