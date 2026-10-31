// Files attached to the next message, kept in memory like the rest of the lab.
import { map } from 'nanostores';

export interface Attachment {
  name: string;
  mediaType: string;
  /** Base64 without the data: prefix. */
  data: string;
  /** PDFs of cases that read them page by page (ChatCase.pdf): each page as
   * a JPEG, base64. Only the first goes with the message. */
  pages?: string[];
}

export const IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
];
/** Largest file any case takes, before images are shrunk. */
export const MAX_MB = 14;
export const MAX_BYTES = MAX_MB * 1024 * 1024;
/** Most pages a PDF may have, except in the document agent (ChatCase.docs),
 * which sets its own: PDFs sent with a message are replayed every turn. */
export const MAX_PDF_PAGES = 5;

/** Longest side of an image as sent to the model, in pixels: enough to read
 * a receipt or a plate, and well under every provider's size limits. */
const IMAGE_SIDE = 1600;

/** An image redrawn as a JPEG of at most IMAGE_SIDE pixels (base64), so a
 * 14 MB photo goes as a few hundred KB and replays cheaply. */
export async function shrinkImage(file: File) {
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
}

export const $attachments = map<Record<string, Attachment[]>>({});

export const readAttachment = (file: File) =>
  new Promise<Attachment>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const url = String(reader.result);
      resolve({
        name: file.name,
        mediaType: file.type,
        data: url.slice(url.indexOf(',') + 1),
      });
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
