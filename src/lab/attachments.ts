// Files attached to the next message, kept in memory like the rest of the lab.
import { map } from 'nanostores';
import type { DocIndex } from './chat/docs';

export interface Attachment {
  name: string;
  mediaType: string;
  /** Base64 without the data: prefix. */
  data: string;
  /** PDFs of cases that read them page by page (ChatCase.pdf): each page as
   * a JPEG, base64. Only the first goes with the message. */
  pages?: string[];
  /** PDFs of the document agent (ChatCase.docs): their text as passages.
   * The file itself never goes to the model. */
  doc?: DocIndex;
  /** Its id in the conversation (d1, d2…), given when it's sent. */
  docId?: string;
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
