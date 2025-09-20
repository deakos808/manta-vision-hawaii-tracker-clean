// File: src/lib/embedding.ts  (FULL OVERWRITE)
// ---------------------------------------------------------------------------
// Browser‑side utility – generate MobileNet‑v2 feature vectors that work even
// when WebGL is unavailable (falls back to CPU backend).
// ---------------------------------------------------------------------------
// • Uses @tensorflow-models/mobilenet (version 2, alpha 1.0).
// • Returns a 1024‑element Float32Array (or number[]) suitable for pgvector.
// ---------------------------------------------------------------------------
import * as tf from '@tensorflow/tfjs';
import '@tensorflow/tfjs-backend-webgl';
import * as mobilenetModule from '@tensorflow-models/mobilenet';

let model: mobilenetModule.MobileNet | null = null;

async function ensureBackend() {
  try {
    await tf.setBackend('webgl');
    await tf.ready();
    // probe a tiny tensor to check if WebGL really works
    tf.tensor([1]).dataSync();
  } catch {
    console.warn('⚠️ WebGL not supported – falling back to CPU');
    await tf.setBackend('cpu');
    await tf.ready();
  }
}

async function loadModel() {
  if (model) return model;
  await ensureBackend();
  model = await mobilenetModule.load({ version: 2, alpha: 1.0 });
  console.info('✅ MobileNet loaded – backend:', tf.getBackend());
  return model;
}

/**
 * Convert an image Blob to a 1024‑D embedding (Float32[])
 */
export async function getEmbedding(blob: Blob): Promise<number[]> {
  const url = URL.createObjectURL(blob);
  const img = await new Promise<HTMLImageElement>((res, rej) => {
    const el = new Image();
    el.crossOrigin = 'anonymous';
    el.onload = () => res(el);
    el.onerror = rej;
    el.src = url;
  });

  const net = await loadModel();
  // second arg true => returns embedding tensor not logits
  const embeddingTensor = net.infer(img, true) as tf.Tensor<tf.Rank.R2>; // shape [1,1024]
  const emb = (await embeddingTensor.array()) as number[][];
  URL.revokeObjectURL(url);
  console.debug('Embedding length:', emb[0].length, 'backend:', tf.getBackend());
  return emb[0];
}
