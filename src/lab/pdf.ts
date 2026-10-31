// PDFs as page images, for cases that read documents page by page instead of
// sending the whole file (see ChatCase.pdf). pdf.js loads on the first PDF, in
// the browser only, and parses in its own worker.
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';

/** Longest side of a rendered page, in pixels: enough to read an invoice. */
const MAX_SIDE = 1400;

export class PdfError extends Error {
  constructor(
    readonly code: 'pdfPages' | 'pdfUnreadable',
    readonly pages = 0,
  ) {
    super(code);
  }
}

/** Renders every page as a JPEG (base64, no data: prefix). Throws PdfError
 * when the file can't be read or has more than `maxPages` pages, before
 * rendering anything. */
export async function pdfPages(file: File, maxPages: number) {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const task = pdfjs.getDocument({ data: await file.arrayBuffer() });
  let doc;
  try {
    doc = await task.promise;
  } catch {
    // Damaged, password protected or not a PDF at all.
    throw new PdfError('pdfUnreadable');
  }
  try {
    if (doc.numPages > maxPages) throw new PdfError('pdfPages', doc.numPages);
    const pages: string[] = [];
    for (let n = 1; n <= doc.numPages; n++) {
      const page = await doc.getPage(n);
      const base = page.getViewport({ scale: 1 });
      const viewport = page.getViewport({
        scale: MAX_SIDE / Math.max(base.width, base.height),
      });
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(viewport.width);
      canvas.height = Math.round(viewport.height);
      const ctx = canvas.getContext('2d')!;
      // White behind transparent pages.
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, canvas, viewport }).promise;
      const url = canvas.toDataURL('image/jpeg', 0.8);
      pages.push(url.slice(url.indexOf(',') + 1));
      page.cleanup();
    }
    return pages;
  } catch (e) {
    if (e instanceof PdfError) throw e;
    throw new PdfError('pdfUnreadable');
  } finally {
    void task.destroy();
  }
}
