// The live CV in the browser: /cv/cv.json (worker/cv.ts, from the CV repo),
// fetched once per page and checked, else the bundled copy. The profile tools
// build their entries from it and the CV viewer renders it, so citations and
// highlights match the CV the visitor can download.
import { atom } from 'nanostores';
import { BUNDLED_CV, parseCv, type CvData } from './cv';

/** The CV the chat uses: the bundled copy until the live one loads. */
export const $cv = atom<CvData>(BUNDLED_CV);

let loading: Promise<CvData> | null = null;
export const loadCv = () =>
  (loading ??= fetch('/cv/cv.json')
    .then((r) => (r.ok ? r.json() : null))
    .then((raw: unknown) => {
      const cv = parseCv(raw);
      if (cv) $cv.set(cv);
      return cv ?? BUNDLED_CV;
    })
    .catch(() => BUNDLED_CV));
