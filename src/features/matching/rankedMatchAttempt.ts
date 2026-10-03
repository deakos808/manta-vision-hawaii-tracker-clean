export type RankedMatchCandidate = {
  catalog_id: number | string;
  name: string | null;
  score: number;
  thumb_url?: string | null;
};

export type RankedMatchProgress =
  | 'preparing'
  | 'uploading'
  | 'embedding'
  | 'matching'
  | 'complete';

export type RankedMatchDependencies = {
  createId: () => string;
  fetchPhoto: (url: string, signal: AbortSignal) => Promise<Blob>;
  uploadDerivative: (path: string, blob: Blob) => Promise<void>;
  publicDerivativeUrl: (path: string) => string;
  insertTempPhoto: (id: string, photoUrl: string) => Promise<void>;
  invokeEmbedding: (id: string) => Promise<void>;
  readEmbedding: (id: string) => Promise<number[] | null>;
  matchTempPhoto: (id: string) => Promise<RankedMatchCandidate[]>;
  deleteTempPhoto: (id: string) => Promise<void>;
  removeDerivative: (path: string) => Promise<void>;
  wait: (milliseconds: number) => Promise<void>;
};

export type RankedMatchAttempt = {
  run: (
    sourceUrl: string,
    signal: AbortSignal,
    onProgress: (progress: RankedMatchProgress) => void,
  ) => Promise<RankedMatchCandidate[]>;
  cleanup: () => Promise<boolean>;
};

function throwIfAborted(signal: AbortSignal) {
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
}

export function createRankedMatchAttempt(deps: RankedMatchDependencies): RankedMatchAttempt {
  let tempPhotoId: string | null = null;
  let derivativePath: string | null = null;
  let cleanupInFlight: Promise<boolean> | null = null;
  let runInFlight: Promise<RankedMatchCandidate[]> | null = null;

  const cleanupArtifacts = async () => {
    if (cleanupInFlight) return cleanupInFlight;
    cleanupInFlight = (async () => {
      let complete = true;
      if (tempPhotoId) {
        try {
          await deps.deleteTempPhoto(tempPhotoId);
          tempPhotoId = null;
        } catch {
          complete = false;
        }
      }
      if (derivativePath) {
        try {
          await deps.removeDerivative(derivativePath);
          derivativePath = null;
        } catch {
          complete = false;
        }
      }
      return complete;
    })();
    try {
      return await cleanupInFlight;
    } finally {
      cleanupInFlight = null;
    }
  };

  const execute: RankedMatchAttempt['run'] = async (sourceUrl, signal, onProgress) => {
    try {
      onProgress('preparing');
      throwIfAborted(signal);
      const blob = await deps.fetchPhoto(sourceUrl, signal);
      throwIfAborted(signal);

      const id = deps.createId();
      const path = `find-match/${id}/source.jpg`;
      tempPhotoId = id;
      derivativePath = path;
      onProgress('uploading');
      await deps.uploadDerivative(path, blob);
      throwIfAborted(signal);

      await deps.insertTempPhoto(id, deps.publicDerivativeUrl(path));
      onProgress('embedding');
      await deps.invokeEmbedding(id);
      throwIfAborted(signal);

      let embedding: number[] | null = null;
      for (let attempt = 0; attempt < 10 && !embedding; attempt += 1) {
        throwIfAborted(signal);
        embedding = await deps.readEmbedding(id);
        if (!embedding) await deps.wait(750);
      }
      if (!embedding || embedding.length !== 1024 || !embedding.every(Number.isFinite)) {
        throw new Error('embedding-unavailable');
      }

      onProgress('matching');
      const matches = await deps.matchTempPhoto(id);
      if (!Array.isArray(matches)) throw new Error('match-response-invalid');
      const validated = matches.map((candidate) => {
        if (
          candidate == null ||
          (typeof candidate.catalog_id !== 'number' && typeof candidate.catalog_id !== 'string') ||
          !Number.isFinite(Number(candidate.score))
        ) {
          throw new Error('match-response-invalid');
        }
        return candidate;
      });
      onProgress('complete');
      return validated;
    } catch (error) {
      await cleanupArtifacts();
      throw error;
    }
  };

  const run: RankedMatchAttempt['run'] = async (sourceUrl, signal, onProgress) => {
    if (runInFlight) throw new Error('match-attempt-already-running');
    const pending = execute(sourceUrl, signal, onProgress);
    runInFlight = pending;
    try {
      return await pending;
    } finally {
      if (runInFlight === pending) runInFlight = null;
    }
  };

  const cleanup = async () => {
    const running = runInFlight;
    if (running) {
      try {
        await running;
      } catch {
        // The run path performs its own first cleanup attempt.
      }
    }
    return cleanupArtifacts();
  };

  return { run, cleanup };
}
