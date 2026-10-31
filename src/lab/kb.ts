// Files added to the document agent's Knowledge Base (ChatCase.docs): PDFs
// are read into passages with pdf.js (loaded on the first one), images are
// downscaled to a JPEG the model can look at. Everything stays in memory.
import { IMAGE_TYPES } from './attachments';
import type { Doc } from './chat/docs';

/** Longest side of a stored image, in pixels: enough to read a receipt. */
const IMAGE_SIDE = 1600;

export type KbError = 'docFile' | 'docSize' | 'docPages' | 'docUnreadable';

const readImage = async (file: File) => {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, IMAGE_SIDE / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * k);
  canvas.height = Math.round(bmp.height * k);
  const ctx = canvas.getContext('2d')!;
  // White behind transparent images.
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  const url = canvas.toDataURL('image/jpeg', 0.85);
  return {
    data: url.slice(url.indexOf(',') + 1),
    w: canvas.width,
    h: canvas.height,
  };
};

const base64 = async (file: File) => {
  const bytes = new Uint8Array(await file.arrayBuffer());
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000)
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};

/** A file as a Knowledge Base document (without its id), or why it was
 * refused. */
export async function readKbFile(
  file: File,
  limits: { maxPages: number; maxMB: number },
): Promise<Omit<Doc, 'id'> | KbError> {
  const pdf = file.type === 'application/pdf';
  if (!pdf && !IMAGE_TYPES.includes(file.type)) return 'docFile';
  if (file.size > limits.maxMB * 1024 * 1024) return 'docSize';
  try {
    if (!pdf) {
      const img = await readImage(file);
      return {
        kind: 'image',
        name: file.name,
        type: 'image/jpeg',
        data: img.data,
        pages: [{ w: img.w, h: img.h, text: false, head: '' }],
        chunks: [],
      };
    }
    const { indexPdf } = await import('./pdf');
    const [data, ix] = await Promise.all([
      base64(file),
      indexPdf(file, limits.maxPages),
    ]);
    return { kind: 'pdf', name: file.name, type: file.type, data, ...ix };
  } catch (e) {
    return (e as { code?: string }).code === 'pdfPages'
      ? 'docPages'
      : 'docUnreadable';
  }
}
