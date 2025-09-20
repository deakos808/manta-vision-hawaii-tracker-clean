// src/lib/approveTempSighting.ts
import { supabase } from './supabase';

/**
 * Calls the approve_temp_sighting SQL function to move a temp sighting
 * and its mantas/photos into the permanent database tables.
 */
export async function approveTempSighting(tempSightingId: string): Promise<void> {
  const { data, error } = await supabase.rpc('approve_temp_sighting', {
    temp_sighting_id: tempSightingId,
  });

  if (error) {
    console.error('❌ Approval failed:', error.message);
    throw new Error(`Approval failed: ${error.message}`);
  }

  console.log('✅ Temp sighting approved:', data);
}
