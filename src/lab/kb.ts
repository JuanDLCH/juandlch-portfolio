// Files added to the document agent's Knowledge Base (ChatCase.docs): PDFs
// are read into passages with pdf.js (loaded on the first one), images are
// downscaled to a JPEG the model can look at. Everything stays in memory.
import { IMAGE_TYPES, shrinkImage } from './attachments';
import type { Doc } from './chat/docs';

export type KbError = 'docFile' | 'docSize' | 'docPages' | 'docUnreadable';

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
      const img = await shrinkImage(file);
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
