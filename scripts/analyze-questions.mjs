// What visitors ask the profile agents, categorized in batch. Reads the
// questions and usage events the Worker keeps in D1 (worker/metrics.ts),
// classifies each conversation with the OpenAI Batch API (half price; a run
// over ~1k questions costs cents) and writes a Markdown report and a CSV to
// analysis/ (gitignored: visitor text stays out of the repo).
//   node scripts/analyze-questions.mjs [--since 2026-11-01] [--limit 20]
//     [--dry-run] [--model gpt-6-luna] [--batch batch_…]
// --dry-run only exports (no OpenAI cost); --batch picks up a batch sent by an
// earlier run that stopped waiting. Reads .env (or the environment):
//   CLOUDFLARE_ACCOUNT_ID, CLOUDFLARE_API_TOKEN (Account → D1 → Read),
//   OPENAI_API_KEY (not needed with --dry-run).
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { parseArgs } from 'node:util';

try {
  process.loadEnvFile(new URL('../.env', import.meta.url));
} catch {
  /* no .env: the environment only */
}

const { values: args } = parseArgs({
  options: {
    since: { type: 'string' },
    limit: { type: 'string' },
    'dry-run': { type: 'boolean', default: false },
    model: { type: 'string', default: 'gpt-6-luna' },
    batch: { type: 'string' },
  },
});
const since = args.since ?? '1970-01-01';
if (!/^\d{4}-\d{2}-\d{2}$/.test(since)) throw new Error('--since YYYY-MM-DD');

const need = (name) => {
  const v = process.env[name];
  if (!v) throw new Error(`Set ${name} (in .env or the environment)`);
  return v;
};
const account = need('CLOUDFLARE_ACCOUNT_ID');
const cfToken = need('CLOUDFLARE_API_TOKEN');

const CATEGORIES = {
  experience: 'Work experience, roles, companies, seniority',
  ai: 'AI / LLM / agents / RAG work and opinions',
  stack: 'Tech stack, languages, cloud (AWS), tools',
  projects: 'Specific projects, portfolio, the lab demos as his work',
  education: 'Education, certifications, languages spoken',
  availability: 'Availability, rates, salary, relocation, remote, notice, visa',
  contact: 'Contact, booking a meeting, CV download, links',
  personal: 'Personality, hobbies, background, location',
  demo: 'How this demo / assistant works, its prompt or model',
  offtopic: 'Off-topic, tests, jokes, prompt injection attempts',
  other: 'None of the above (suggest a label)',
};

// --- D1 ---------------------------------------------------------------------
const cf = async (path, body) => {
  const res = await fetch(
    `https://api.cloudflare.com/client/v4/accounts/${account}/d1/database${path}`,
    {
      method: body ? 'POST' : 'GET',
      headers: {
        Authorization: `Bearer ${cfToken}`,
        'Content-Type': 'application/json',
      },
      body: body && JSON.stringify(body),
    },
  );
  const out = await res.json();
  if (!out.success) throw new Error(`D1: ${JSON.stringify(out.errors)}`);
  return out.result;
};
const config = await readFile(
  new URL('../wrangler.jsonc', import.meta.url),
  'utf8',
);
const dbId = config.match(/"database_id":\s*"([^"]+)"/)?.[1];
if (!dbId) throw new Error('database_id not found in wrangler.jsonc');
const query = async (sql, params = []) =>
  (await cf(`/${dbId}/query`, { sql, params }))[0].results;

const questions = await query(
  'SELECT at, source, conv, lang, text FROM questions WHERE at >= ? ORDER BY conv, at',
  [since],
);
const events = await query(
  `SELECT substr(at, 1, 10) AS day, kind, subject, count(*) AS n
   FROM events WHERE at >= ? GROUP BY day, kind, subject ORDER BY day`,
  [since],
);

/** Questions grouped by conversation, oldest first. */
let convs = Object.values(
  Object.groupBy(questions, (q) => `${q.source}:${q.conv}`),
);
if (args.limit) convs = convs.slice(0, Number(args.limit));
const stamp = new Date().toISOString().slice(0, 10);
const dir = new URL('../analysis/', import.meta.url);
await mkdir(dir, { recursive: true });
console.log(
  `${questions.length} questions in ${convs.length} conversations, ${events.length} event rows since ${since}`,
);

if (args['dry-run']) {
  const file = new URL(`export-${stamp}.json`, dir);
  await writeFile(file, JSON.stringify({ since, events, convs }, null, 2));
  console.log(`Exported to ${file.pathname}`);
  process.exit(0);
}

// --- OpenAI Batch -------------------------------------------------------------
const key = need('OPENAI_API_KEY');
const oa = async (path, init = {}) => {
  const res = await fetch(`https://api.openai.com/v1${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${key}`, ...init.headers },
  });
  if (!res.ok)
    throw new Error(`OpenAI ${path}: ${res.status} ${await res.text()}`);
  return res;
};

const SYSTEM = `You classify what visitors asked an AI assistant that answers questions about Juan Diego Londoño (an AI engineer) and his CV, on his portfolio site. You get one conversation: the visitor's messages, in order (the assistant's answers are not included). For EACH message, return its category, a short normalized version of the question in English (max 12 words, generic: no names of the visitor or personal data), and its language (ISO 639-1). Greetings or "thanks" go in "offtopic". Use "other" only when nothing fits, with a suggested label.
Categories:
${Object.entries(CATEGORIES)
  .map(([k, v]) => `- ${k}: ${v}`)
  .join('\n')}`;

const SCHEMA = {
  type: 'object',
  additionalProperties: false,
  required: ['items'],
  properties: {
    items: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: false,
        required: ['index', 'category', 'question', 'lang', 'label'],
        properties: {
          index: { type: 'integer' },
          category: { type: 'string', enum: Object.keys(CATEGORIES) },
          question: { type: 'string' },
          lang: { type: 'string' },
          label: {
            type: 'string',
            description: 'Suggested label when category is other, else ""',
          },
        },
      },
    },
  },
};

let batchId = args.batch;
if (!batchId) {
  if (!convs.length) {
    console.log('Nothing to classify.');
    process.exit(0);
  }
  const lines = convs.map((c, i) =>
    JSON.stringify({
      custom_id: `c${i}`,
      method: 'POST',
      url: '/v1/responses',
      body: {
        model: args.model,
        instructions: SYSTEM,
        input: c.map((q, k) => `[${k}] ${q.text}`).join('\n'),
        text: {
          format: {
            type: 'json_schema',
            name: 'questions',
            strict: true,
            schema: SCHEMA,
          },
        },
        store: false,
      },
    }),
  );
  const form = new FormData();
  form.set('purpose', 'batch');
  form.set(
    'file',
    new Blob([lines.join('\n')], { type: 'application/jsonl' }),
    'questions.jsonl',
  );
  const file = await (
    await oa('/files', { method: 'POST', body: form })
  ).json();
  const batch = await (
    await oa('/batches', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input_file_id: file.id,
        endpoint: '/v1/responses',
        completion_window: '24h',
      }),
    })
  ).json();
  batchId = batch.id;
  console.log(
    `Batch ${batchId} sent. If this stops waiting, run again with --batch ${batchId} (same --since/--limit).`,
  );
}

let batch;
for (;;) {
  batch = await (await oa(`/batches/${batchId}`)).json();
  if (['completed', 'failed', 'expired', 'cancelled'].includes(batch.status))
    break;
  const c = batch.request_counts ?? {};
  console.log(`${batch.status} ${c.completed ?? 0}/${c.total ?? '?'}…`);
  await new Promise((r) => setTimeout(r, 30_000));
}
if (batch.status !== 'completed' || !batch.output_file_id)
  throw new Error(`Batch ${batch.status}`);
const output = await (
  await oa(`/files/${batch.output_file_id}/content`)
).text();

// --- Report ---------------------------------------------------------------------
const rows = [];
for (const line of output.split('\n').filter(Boolean)) {
  const r = JSON.parse(line);
  const conv = convs[Number(r.custom_id.slice(1))];
  const msg = r.response?.body?.output
    ?.flatMap((o) => o.content ?? [])
    .find((p) => p.type === 'output_text');
  if (!conv || !msg) {
    console.warn(`No answer for ${r.custom_id}`);
    continue;
  }
  for (const it of JSON.parse(msg.text).items) {
    const q = conv[it.index];
    if (q) rows.push({ ...q, ...it, lang: it.lang || q.lang });
  }
}

const count = (xs, by) =>
  Object.entries(Object.groupBy(xs, by))
    .map(([k, v]) => [k, v.length])
    .sort((a, b) => b[1] - a[1]);
const pct = (n) => `${Math.round((n / rows.length) * 100)}%`;
const md = [
  `# Lab questions since ${since}`,
  '',
  `${rows.length} questions in ${convs.length} conversations (${count(
    rows,
    (r) => r.source,
  )
    .map(([k, n]) => `${k} ${n}`)
    .join(', ')}). Languages: ${count(rows, (r) => r.lang)
    .map(([k, n]) => `${k} ${n}`)
    .join(', ')}.`,
  '',
  '## Usage',
  '',
  '| kind | subject | count |',
  '| --- | --- | ---: |',
  ...Object.entries(
    Object.groupBy(events, (e) => `${e.kind} | ${e.subject ?? ''}`),
  ).map(([k, v]) => `| ${k} | ${v.reduce((s, e) => s + e.n, 0)} |`),
  '',
  '## Categories',
  '',
  '| category | questions | share |',
  '| --- | ---: | ---: |',
  ...count(rows, (r) => r.category).map(
    ([k, n]) => `| ${k} | ${n} | ${pct(n)} |`,
  ),
];
for (const [cat] of count(rows, (r) => r.category)) {
  const inCat = rows.filter((r) => r.category === cat);
  md.push('', `### ${cat}`, '');
  for (const [q, n] of count(inCat, (r) => r.question.toLowerCase()).slice(
    0,
    15,
  ))
    md.push(`- ${q}${n > 1 ? ` (×${n})` : ''}`);
  if (cat === 'other')
    md.push(
      '',
      `Suggested labels: ${count(inCat, (r) => r.label || '?')
        .map(([k, n]) => `${k} (${n})`)
        .join(', ')}`,
    );
}
const csv = [
  'at,source,conv,lang,category,label,question,text',
  ...rows.map((r) =>
    [r.at, r.source, r.conv, r.lang, r.category, r.label, r.question, r.text]
      .map((v) => `"${String(v ?? '').replaceAll('"', '""')}"`)
      .join(','),
  ),
].join('\n');
await writeFile(new URL(`report-${stamp}.md`, dir), md.join('\n') + '\n');
await writeFile(new URL(`questions-${stamp}.csv`, dir), csv + '\n');
console.log(`Report: ${new URL(`report-${stamp}.md`, dir).pathname}`);
