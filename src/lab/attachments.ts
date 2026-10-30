// Files attached to the next message, kept in memory like the rest of the lab.
import { map } from 'nanostores';

export interface Attachment {
  name: string;
  mediaType: string;
  /** Base64 without the data: prefix. */
  data: string;
}

export const IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
];
export const MAX_BYTES = 20 * 1024 * 1024;

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
