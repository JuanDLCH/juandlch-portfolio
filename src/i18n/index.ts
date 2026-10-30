import { content, type Lang } from './content';

export type { Content, Lang } from './content';
export const langs: Lang[] = ['en', 'es'];
export const getContent = (lang: Lang) => content[lang];
