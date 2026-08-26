import { MediaPayload } from '../types';

/** Reads a File as a `data:` URL, suitable for previews and localStorage. */
export function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener('load', () => resolve(reader.result as string), { once: true });
    reader.addEventListener(
      'error',
      () => reject(reader.error ?? new Error('Falha ao ler o arquivo.')),
      { once: true }
    );
    reader.readAsDataURL(file);
  });
}

/** Rebuilds a File from a `data:` URL without hitting the network. */
export function dataUrlToFile(dataUrl: string, filename: string): File {
  const [header, base64] = dataUrl.split(',');
  if (!header || base64 === undefined) {
    throw new Error('Data URL inválida.');
  }
  const mimeType = header.match(/data:([^;]+)/)?.[1] ?? 'application/octet-stream';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new File([bytes], filename, { type: mimeType });
}

/** Converts a File into the inline payload the Gemini API expects. */
export async function fileToMediaPayload(file: File, fallbackMime = 'image/png'): Promise<MediaPayload> {
  const dataUrl = await fileToDataUrl(file);
  const base64 = dataUrl.split(',')[1];
  if (!base64) {
    throw new Error('Não foi possível codificar o arquivo.');
  }
  return { data: base64, mimeType: file.type || fallbackMime };
}

/**
 * Runs `worker` over every item with a bounded number of in-flight calls.
 * Results keep the input order; a rejected worker rejects the whole batch, so
 * callers that need per-item failures should catch inside the worker.
 */
export async function mapWithConcurrency<T, R>(
  items: readonly T[],
  limit: number,
  worker: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = Array.from({ length: items.length });
  let cursor = 0;

  const runners = Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index], index);
    }
  });

  await Promise.all(runners);
  return results;
}
