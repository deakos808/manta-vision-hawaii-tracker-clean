
import { supabase } from '@/lib/supabase';

// Optional fallback if @/types is unavailable
export type MantaImage = {
  id: string;
  catalog_id: string;
  storage_path: string;
  public_url: string;
  metadata?: {
    tags?: string[];
    [key: string]: any;
  };
};

// Generate a public URL for a stored image
export function getPublicUrl(path: string): string {
  const { data } = supabase.storage.from('manta-images').getPublicUrl(path);
  return data?.publicUrl ?? '';
}

// Upload a new manta image to Supabase storage
export async function uploadMantaImage(
  file: File,
  catalogId: string,
  metadata: Record<string, any> = {}
): Promise<{ success: boolean; path?: string; url?: string }> {
  const path = `${catalogId}/${file.name}`;

  const { data, error } = await supabase.storage
    .from('manta-images')
    .upload(path, file, {
      upsert: false,
      contentType: file.type,
      cacheControl: '3600',
      metadata,
    });

  if (error || !data?.path) {
    console.error('Upload failed:', error);
    return { success: false };
  }

  const publicUrl = getPublicUrl(data.path);
  return { success: true, path: data.path, url: publicUrl };
}

// 🆕 Add a tag to mark an image as approved for deletion
export async function tagImageForDeletion(path: string): Promise<boolean> {
  // Workaround to update metadata without reuploading content
  const dummyFile = new File([""], "dummy.txt");

  const { error } = await supabase.storage
    .from('manta-images')
    .update(path, dummyFile, {
      upsert: false,
      metadata: {
        tags: ['approved_for_deletion'],
      },
    });

  if (error) {
    console.error('Failed to tag image for deletion:', error);
    return false;
  }

  return true;
}

// Fetch all images tagged for deletion using a direct storage query
export async function getImagesTaggedForDeletion(): Promise<MantaImage[]> {
  // Using a direct query instead of an RPC
  const { data, error } = await supabase.storage
    .from('manta-images')
    .list('', {
      limit: 100,
      sortBy: { column: 'created_at', order: 'desc' }
    });

  if (error) {
    console.error('Failed to fetch tagged images:', error);
    return [];
  }

  // Filter for objects with the approved_for_deletion tag
  const taggedImages = data
    .filter(item => {
      // Check if this object has metadata with the approved_for_deletion tag
      return item.metadata && 
             item.metadata.tags && 
             Array.isArray(item.metadata.tags) && 
             item.metadata.tags.includes('approved_for_deletion');
    })
    .map(item => ({
      id: item.id,
      catalog_id: item.name.split('/')[0] || '',
      storage_path: item.name,
      public_url: getPublicUrl(item.name),
      metadata: item.metadata
    }));

  return taggedImages;
}

// Parse CatalogID, Island, AgeClass, Gender, and Filename from image name
export function parseMetadataFromFilename(filename: string) {
  const [catalogId, island, ageClass, gender, ...rest] = filename.split('_');
  const originalFilename = rest.join('_');

  return {
    catalog_id: catalogId,
    island,
    age_class: ageClass,
    gender,
    original_filename: originalFilename,
  };
}
