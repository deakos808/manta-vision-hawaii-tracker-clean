import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  createRankedMatchAttempt,
  type RankedMatchAttempt,
  type RankedMatchCandidate,
  type RankedMatchDependencies,
  type RankedMatchProgress,
} from './rankedMatchAttempt';

export type { RankedMatchCandidate, RankedMatchProgress } from './rankedMatchAttempt';

function productionDependencies(): RankedMatchDependencies {
  return {
    createId: () => crypto.randomUUID(),
    fetchPhoto: async (url, signal) => {
      const response = await fetch(url, { signal });
      if (!response.ok) throw new Error("photo-fetch-failed");
      return response.blob();
    },
    uploadDerivative: async (path, blob) => {
      const { error } = await supabase.storage.from("temp-images").upload(path, blob, {
        cacheControl: "3600",
        contentType: blob.type || "image/jpeg",
        upsert: false,
      });
      if (error) throw new Error("temporary-upload-failed");
    },
    publicDerivativeUrl: (path) =>
      supabase.storage.from("temp-images").getPublicUrl(path).data.publicUrl,
    insertTempPhoto: async (id, photoUrl) => {
      const { error } = await supabase.from("temp_photos").insert({ id, photo_url: photoUrl });
      if (error) throw new Error("temporary-row-failed");
    },
    invokeEmbedding: async (id) => {
      const { error } = await supabase.functions.invoke("generate-newphoto-embedding", {
        body: { photo_id: id },
      });
      if (error) throw new Error("embedding-function-failed");
    },
    readEmbedding: async (id) => {
      const { data, error } = await supabase
        .from("temp_photos")
        .select("embedding")
        .eq("id", id)
        .maybeSingle();
      if (error) throw new Error("embedding-read-failed");
      return Array.isArray(data?.embedding) ? data.embedding : null;
    },
    matchTempPhoto: async (id) => {
      const { data, error } = await supabase.rpc("match_temp_photo", {
        query_photo_id: id,
        result_limit: 50,
        result_offset: 0,
      });
      if (error) throw new Error("match-rpc-failed");
      if (!Array.isArray(data)) throw new Error("match-response-invalid");
      return data as RankedMatchCandidate[];
    },
    deleteTempPhoto: async (id) => {
      const { error } = await supabase.from("temp_photos").delete().eq("id", id);
      if (error) throw new Error("temporary-row-cleanup-failed");
    },
    removeDerivative: async (path) => {
      const { error } = await supabase.storage.from("temp-images").remove([path]);
      if (error) throw new Error("temporary-object-cleanup-failed");
    },
    wait: (milliseconds) => new Promise((resolve) => window.setTimeout(resolve, milliseconds)),
  };
}

type RankedMatchState = {
  matches: RankedMatchCandidate[];
  progress: RankedMatchProgress | null;
  loading: boolean;
  error: string | null;
};

const INITIAL_STATE: RankedMatchState = {
  matches: [],
  progress: null,
  loading: false,
  error: null,
};

export function useRankedCatalogMatch(open: boolean, sourceUrl?: string | null) {
  const [state, setState] = useState<RankedMatchState>(INITIAL_STATE);
  const attemptRef = useRef<RankedMatchAttempt | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const generationRef = useRef(0);

  useEffect(() => {
    const generation = ++generationRef.current;
    let disposed = false;
    let ownedAttempt: RankedMatchAttempt | null = null;
    const controller = new AbortController();
    abortRef.current = controller;

    if (!open || !sourceUrl) {
      setState({ ...INITIAL_STATE, error: open ? "No ventral photo is available for suggestions." : null });
      return () => {
        disposed = true;
        controller.abort();
      };
    }

    setState({ ...INITIAL_STATE, loading: true, progress: "preparing" });
    queueMicrotask(async () => {
      if (disposed || generation !== generationRef.current) return;
      ownedAttempt = createRankedMatchAttempt(productionDependencies());
      attemptRef.current = ownedAttempt;
      const timeout = window.setTimeout(() => controller.abort(), 60_000);
      try {
        const matches = await ownedAttempt.run(sourceUrl, controller.signal, (progress) => {
          if (!disposed && generation === generationRef.current) {
            setState((current) => ({ ...current, progress }));
          }
        });
        if (!disposed && generation === generationRef.current) {
          setState({ matches, progress: "complete", loading: false, error: null });
        }
      } catch {
        if (!disposed && generation === generationRef.current) {
          setState({
            matches: [],
            progress: null,
            loading: false,
            error: "Suggested matches are temporarily unavailable. Browse the catalog manually instead.",
          });
        }
      } finally {
        window.clearTimeout(timeout);
      }
    });

    return () => {
      disposed = true;
      controller.abort();
      if (ownedAttempt) void ownedAttempt.cleanup();
    };
  }, [open, sourceUrl]);

  const cleanup = useCallback(async () => {
    abortRef.current?.abort();
    const attempt = attemptRef.current;
    if (!attempt) return true;
    const complete = await attempt.cleanup();
    if (complete) attemptRef.current = null;
    return complete;
  }, []);

  return { ...state, cleanup };
}
