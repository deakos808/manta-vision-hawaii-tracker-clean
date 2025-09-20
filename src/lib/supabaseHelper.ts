
import { supabase } from "@/lib/supabase";
import { MantaImageDeletionLog } from "./supabase";

// Function to get the deletion logs
export const getDeletionLogs = async (): Promise<MantaImageDeletionLog[]> => {
  const { data, error } = await supabase
    .from('manta_image_deletion_log')
    .select('*')
    .order('deleted_at', { ascending: false });
  
  if (error) {
    console.error('Error fetching deletion logs:', error);
    return [];
  }
  
  return data || [];
};

// Function to help apply secure deletion tags
export const tagFileForDeletion = async (path: string, reason: string = 'Admin requested') => {
  try {
    const dummyFile = new File([""], "dummy.txt");

    const { error } = await supabase
      .storage
      .from('manta-images')
      .update(path, dummyFile, {
        upsert: false,
        metadata: {
          'tags': ['approved_for_deletion'],
          'deleteReason': reason,
          'markedForDeletion': new Date().toISOString()
        }
      });
      
    return { success: !error, error };
  } catch (err) {
    console.error('Error tagging file for deletion:', err);
    return { success: false, error: err };
  }
};
