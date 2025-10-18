import { supabase } from "@/lib/supabaseClient";

export type SaveHeader = {
  photographer_name: string;
  camera_model: string;
  lens_type: string;
  laser_setup: string;
  default_scale_m: number; // meters
};

export type SavePhotoInput = {
  file: File;
  width: number;
  height: number;
  // measurements:
  scalePx: number;
  objectPx: number;
  actualLengthM: number;   // meters
  // raw points:
  scale: { p0: {x:number,y:number} | null; p1: {x:number,y:number} | null };
  object: { p0: {x:number,y:number} | null; p1: {x:number,y:number} | null };
};

export type SaveResult = {
  sessionId: string;
  photoIds: string[];
};

function req<T>(v: T | null | undefined, msg: string): T {
  if (v === undefined || v === null) throw new Error(msg);
  return v;
}

export async function saveCalibrationSession(
  header: SaveHeader,
  photos: SavePhotoInput[]
): Promise<SaveResult> {
  // 1) who
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr) throw userErr;
  const userId = userData?.user?.id || null;

  // 2) create session
  const { data: sessionRow, error: sErr } = await supabase
    .from("calibration_sessions")
    .insert([{
      created_by: userId,
      photographer_name: header.photographer_name || null,
      camera_model: header.camera_model || null,
      lens_type: header.lens_type || null,
      laser_setup: header.laser_setup || null,
      default_scale_m: header.default_scale_m,
    }])
    .select("id")
    .single();
  if (sErr) throw sErr;
  const sessionId = req(sessionRow?.id, "No session id returned.");

  const photoIds: string[] = [];

  // 3) per-photo: upload, insert photo, insert measurement
  for (const ph of photos) {
    const filenameSafe = ph.file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
    const storagePath = `calibration/${sessionId}/${filenameSafe}`;

    // upload to private bucket
    const { error: upErr } = await supabase.storage
      .from("calibration-images")
      .upload(storagePath, ph.file, { upsert: true });
    if (upErr) throw upErr;

    // insert photo row
    const { data: photoRow, error: pErr } = await supabase
      .from("calibration_photos")
      .insert([{
        session_id: sessionId,
        storage_path: storagePath,
        width_px: ph.width,
        height_px: ph.height,
        actual_length_m: ph.actualLengthM,
      }])
      .select("id")
      .single();
    if (pErr) throw pErr;
    const photoId = req(photoRow?.id, "No photo id returned.");
    photoIds.push(photoId);

    // compute est + error
    const scaleM = header.default_scale_m;
    const estLengthM = ph.scalePx > 0 ? (ph.objectPx / ph.scalePx) * scaleM : null;
    if (estLengthM == null) throw new Error("Invalid measurement (no scale/object px).");
    const errorPct = ph.actualLengthM > 0 ? Math.abs(estLengthM - ph.actualLengthM) / ph.actualLengthM * 100 : null;
    if (errorPct == null) throw new Error("Invalid actual length.");

    // insert measurement row
    const { error: mErr } = await supabase
      .from("calibration_measurements")
      .insert([{
        photo_id: photoId,
        scale_px: ph.scalePx,
        object_px: ph.objectPx,
        scale_p0: ph.scale.p0, scale_p1: ph.scale.p1,
        object_p0: ph.object.p0, object_p1: ph.object.p1,
        scale_m: scaleM,
        est_length_m: estLengthM,
        error_pct: errorPct,
      }]);
    if (mErr) throw mErr;
  }

  return { sessionId, photoIds };
}
