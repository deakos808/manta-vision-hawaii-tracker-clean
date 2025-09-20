// src/components/sightings/SightingCard.tsx

import { Link } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Sighting as SightingType } from '@/lib/supabase';

interface SightingCardProps {
  sighting: Partial<SightingType>;
}

// Local fallback utility to safely construct image URLs
const getImageUrl = (path: string | null | undefined): string =>
  path
    ? `https://apweteosdbgsolmvcmhn.supabase.co/storage/v1/object/public/manta-images/${path}`
    : '/no-photo.png';

const SightingCard = ({ sighting }: SightingCardProps) => {
  const imageUrl = getImageUrl(sighting.image_url);
  const formattedDate = new Date(sighting.date || sighting.sighting_date || new Date()).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  const behaviorText =
    sighting.behavior && typeof sighting.behavior === 'string'
      ? sighting.behavior
      : sighting.behavior
      ? JSON.stringify(sighting.behavior)
      : '';

  return (
    <Link to={`/sightings/${sighting.id}`}>
      <Card className="overflow-hidden h-full transition-all hover:shadow-md">
        <div className="relative h-[200px]">
          {imageUrl ? (
            <img
              src={imageUrl}
              alt={`Manta ray sighting ${sighting.id}`}
              className="w-full h-full object-cover"
              onError={(e) => (e.currentTarget.src = '/no-photo.png')}
            />
          ) : (
            <div className="w-full h-full bg-muted flex items-center justify-center">
              <p className="text-muted-foreground">No image available</p>
            </div>
          )}

          <div className="absolute top-2 right-2 bg-black/50 text-white px-2 py-1 text-xs rounded">
            {formattedDate}
          </div>

          {sighting.catalog_id && (
            <div className="absolute bottom-2 right-2 bg-ocean text-white px-2 py-1 text-xs rounded flex items-center gap-1">
              <span className="h-2 w-2 bg-white rounded-full"></span>
              <span>Identified</span>
            </div>
          )}
        </div>

        <CardContent className="p-4">
          <div className="flex justify-between items-start mb-2">
            <div>
              <h3 className="font-medium">
                {sighting.catalog_id ? `Manta ID: ${sighting.catalog_id}` : 'Unidentified Manta'}
              </h3>
              <p className="text-sm text-muted-foreground">{sighting.location || 'Unknown location'}</p>
            </div>
          </div>

          {behaviorText && (
            <p className="text-sm mt-2">
              <span className="font-medium">Behavior:</span> {behaviorText}
            </p>
          )}
        </CardContent>
      </Card>
    </Link>
  );
};

export default SightingCard;
