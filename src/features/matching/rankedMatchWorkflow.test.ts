import assert from 'node:assert/strict';
import test from 'node:test';
import {
  createRankedMatchAttempt,
  type RankedMatchCandidate,
  type RankedMatchDependencies,
} from './rankedMatchAttempt';

function fixture(overrides: Partial<RankedMatchDependencies> = {}) {
  const calls: string[] = [];
  const matches: RankedMatchCandidate[] = [
    { catalog_id: 17, name: 'First', score: 0.98, thumb_url: '/first.jpg' },
    { catalog_id: 4, name: 'Second', score: 0.81, thumb_url: '/second.jpg' },
  ];
  const dependencies: RankedMatchDependencies = {
    createId: () => 'temporary-photo-id',
    fetchPhoto: async (url) => {
      calls.push(`fetch:${url}`);
      return new Blob(['synthetic-image'], { type: 'image/jpeg' });
    },
    uploadDerivative: async (path) => { calls.push(`upload:${path}`); },
    publicDerivativeUrl: (path) => `https://temporary.invalid/${path}`,
    insertTempPhoto: async (id, url) => { calls.push(`insert:${id}:${url}`); },
    invokeEmbedding: async (id) => { calls.push(`embed:${id}`); },
    readEmbedding: async (id) => {
      calls.push(`read:${id}`);
      return Array.from({ length: 1024 }, (_, index) => index / 1024);
    },
    matchTempPhoto: async (id) => {
      calls.push(`match:${id}`);
      return matches;
    },
    deleteTempPhoto: async (id) => { calls.push(`delete-row:${id}`); },
    removeDerivative: async (path) => { calls.push(`delete-object:${path}`); },
    wait: async () => undefined,
    ...overrides,
  };
  return { calls, dependencies, matches };
}

test('selected source reaches the existing ranked workflow and preserves returned order', async () => {
  const { calls, dependencies, matches } = fixture();
  const progress: string[] = [];
  const attempt = createRankedMatchAttempt(dependencies);
  const result = await attempt.run(
    'blob:selected-ventral-photo',
    new AbortController().signal,
    (value) => progress.push(value),
  );

  assert.deepEqual(result, matches);
  assert.deepEqual(result.map((item) => item.catalog_id), [17, 4]);
  assert.deepEqual(progress, ['preparing', 'uploading', 'embedding', 'matching', 'complete']);
  assert.equal(calls[0], 'fetch:blob:selected-ventral-photo');
  assert.ok(calls.includes('embed:temporary-photo-id'));
  assert.ok(calls.includes('match:temporary-photo-id'));
});

test('selection cleanup removes only generated artifacts and repeated cleanup is harmless', async () => {
  const { calls, dependencies } = fixture();
  const attempt = createRankedMatchAttempt(dependencies);
  await attempt.run('blob:original-photo', new AbortController().signal, () => undefined);

  assert.equal(await attempt.cleanup(), true);
  assert.equal(await attempt.cleanup(), true);
  assert.equal(calls.filter((call) => call === 'delete-row:temporary-photo-id').length, 1);
  assert.equal(calls.filter((call) => call === 'delete-object:find-match/temporary-photo-id/source.jpg').length, 1);
  assert.equal(calls.some((call) => call.includes('delete-object:blob:original-photo')), false);
});

test('upload failure cleans the reserved derivative path and temporary row id', async () => {
  const { calls, dependencies } = fixture({
    uploadDerivative: async (path) => {
      calls.push(`upload-failed:${path}`);
      throw new Error('synthetic-upload-failure');
    },
  });
  const attempt = createRankedMatchAttempt(dependencies);

  await assert.rejects(
    attempt.run('blob:source', new AbortController().signal, () => undefined),
    /synthetic-upload-failure/,
  );
  assert.ok(calls.includes('delete-row:temporary-photo-id'));
  assert.ok(calls.includes('delete-object:find-match/temporary-photo-id/source.jpg'));
});

test('embedding failure cleans temporary row and derivative', async () => {
  const { calls, dependencies } = fixture({
    invokeEmbedding: async () => { throw new Error('synthetic-embedding-failure'); },
  });
  const attempt = createRankedMatchAttempt(dependencies);

  await assert.rejects(
    attempt.run('blob:source', new AbortController().signal, () => undefined),
    /synthetic-embedding-failure/,
  );
  assert.ok(calls.includes('delete-row:temporary-photo-id'));
  assert.ok(calls.includes('delete-object:find-match/temporary-photo-id/source.jpg'));
});

test('timeout or cancel aborts without continuing to the match RPC', async () => {
  const controller = new AbortController();
  const { calls, dependencies } = fixture({
    invokeEmbedding: async () => { controller.abort(); },
  });
  const attempt = createRankedMatchAttempt(dependencies);

  await assert.rejects(
    attempt.run('blob:source', controller.signal, () => undefined),
    (error: unknown) => error instanceof DOMException && error.name === 'AbortError',
  );
  assert.equal(calls.some((call) => call.startsWith('match:')), false);
  assert.ok(calls.includes('delete-row:temporary-photo-id'));
  assert.ok(calls.includes('delete-object:find-match/temporary-photo-id/source.jpg'));
});

test('failed cleanup can be retried without repeating completed deletion', async () => {
  let objectAttempts = 0;
  const { calls, dependencies } = fixture({
    removeDerivative: async (path) => {
      objectAttempts += 1;
      calls.push(`delete-object-attempt:${objectAttempts}:${path}`);
      if (objectAttempts === 1) throw new Error('synthetic-cleanup-failure');
    },
  });
  const attempt = createRankedMatchAttempt(dependencies);
  await attempt.run('blob:source', new AbortController().signal, () => undefined);

  assert.equal(await attempt.cleanup(), false);
  assert.equal(await attempt.cleanup(), true);
  assert.equal(calls.filter((call) => call === 'delete-row:temporary-photo-id').length, 1);
  assert.equal(objectAttempts, 2);
});

test('cleanup waits for an in-flight upload before deleting generated artifacts', async () => {
  let releaseUpload!: () => void;
  const uploadStarted = new Promise<void>((resolve) => {
    releaseUpload = resolve;
  });
  let uploadMayFinish!: () => void;
  const uploadFinished = new Promise<void>((resolve) => {
    uploadMayFinish = resolve;
  });
  const controller = new AbortController();
  const { calls, dependencies } = fixture({
    uploadDerivative: async (path) => {
      calls.push(`upload-start:${path}`);
      releaseUpload();
      await uploadFinished;
      calls.push(`upload-finish:${path}`);
    },
  });
  const attempt = createRankedMatchAttempt(dependencies);
  const run = attempt.run('blob:source', controller.signal, () => undefined);
  await uploadStarted;
  controller.abort();
  const cleanup = attempt.cleanup();
  uploadMayFinish();

  await assert.rejects(run);
  assert.equal(await cleanup, true);
  assert.ok(
    calls.indexOf('upload-finish:find-match/temporary-photo-id/source.jpg') <
      calls.indexOf('delete-object:find-match/temporary-photo-id/source.jpg'),
  );
});
