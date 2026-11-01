// Juan Diego's profile as plain text, written at build time for the voice
// Worker (worker/session.ts), which puts it in Sophie's instructions. The
// Worker can't import profile.ts itself: cv.ts imports the CV PDF through
// Vite. It's the same public data the portfolio shows.
import type { APIRoute } from 'astro';
import { profileText } from '../../lab/chat/profile';

export const GET: APIRoute = () =>
  new Response(profileText(), {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
