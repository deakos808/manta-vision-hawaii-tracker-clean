import { supabase } from "@/lib/supabase";

export async function deleteManta(pk_manta_id: number) {
  const { data, error } = await supabase.functions.invoke("delete-manta", {
    body: { pk_manta_id },
  });
  if (error) throw error;
  return data;
}

export async function deletePhoto(pk_photo_id: number) {
  const { data, error } = await supabase.functions.invoke("delete-photo", {
    body: { pk_photo_id },
  });
  if (error) throw error;
  return data;
}
