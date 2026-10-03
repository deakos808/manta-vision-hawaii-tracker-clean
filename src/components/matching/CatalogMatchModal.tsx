import MatchModal from '@/components/mantas/MatchModal';
import { supabase } from '@/lib/supabase';

interface Props {
  open: boolean;
  onClose: () => void;
  photoUrl: string;
  tempMantaId: string;
}

/**
 * Compatibility wrapper for the historical photo-upload flow. The ranked
 * workflow itself lives in MatchModal so there is only one uploader/RPC path.
 */
export default function CatalogMatchModal({ open, onClose, photoUrl, tempMantaId }: Props) {
  const confirmMatch = async (catalogId: number | null) => {
    const { error } = await supabase
      .from('temp_mantas')
      .update({
        suggested_catalog_id: catalogId,
        match_status: catalogId == null ? 'new' : 'confirmed',
      })
      .eq('id', tempMantaId);
    if (error) throw new Error('temporary-manta-update-failed');
  };

  return (
    <MatchModal
      open={open}
      onClose={onClose}
      tempUrl={photoUrl}
      onChoose={(catalogId) => {
        void confirmMatch(catalogId).then(onClose);
      }}
      onNoMatch={() => {
        void confirmMatch(null).then(onClose);
      }}
    />
  );
}
