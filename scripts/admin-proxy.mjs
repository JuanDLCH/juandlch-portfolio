// Dev proxy for the dashboard's API, imported by astro.config.mjs.
import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

// Dev only: with ADMIN_PROD_COOKIE in .env (the CF_Authorization cookie of
// juandlch.dev, after signing in to /admin there), the local dashboard reads
// production's data, read-only: anything but GET is refused here.
const { ADMIN_PROD_COOKIE } = existsSync('.env')
  ? parseEnv(readFileSync('.env', 'utf8'))
  : {};
export const adminProxy = ADMIN_PROD_COOKIE
  ? {
      target: 'https://juandlch.dev',
      changeOrigin: true,
      headers: { Cookie: `CF_Authorization=${ADMIN_PROD_COOKIE}` },
      bypass(req, res) {
        if (req.method === 'GET' || !res) return;
        res.statusCode = 403;
        res.setHeader('Content-Type', 'application/json');
        res.end('{"error":"read_only"}');
        return req.url;
      },
    }
  : 'http://localhost:8787';
