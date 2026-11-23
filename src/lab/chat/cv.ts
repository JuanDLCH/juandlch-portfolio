// Juan Diego's CV as data. The live copy is the CV repo's
// dist/base.en/cv.json (built from versions/base.en.html with the PDFs), served
// by the Worker at /cv/cv.json (worker/cv.ts) and read by the chat's profile
// tools and CV viewer (cv-live.ts) and by Sophie's profile, so a CV change
// reaches the agents without a deploy. The data below is the bundled fallback
// (refresh it from cv.json now and then). Answers cite items by id, so ids
// are stable.
// The CV downloads: the Worker serves them from the CV repo (worker/cv.ts),
// so a new CV reaches the site without a deploy.
export const CV_PDF_EN = '/cv/Juan-Londono_AI-Engineer.pdf';
export const CV_PDF_ES = '/cv/Juan-Londono_AI-Engineer_ES.pdf';
/** The PDF the chat cites. */
export const cvPdf = CV_PDF_EN;

export interface CvItem {
  id: string;
  /** Short name used in the citation label, e.g. "Lead AI Engineer: RAG". */
  cite: string;
  /** Bold lead-in shown before the text (skill group, client). */
  label?: string;
  text: string;
}

export interface CvBlock {
  /** Role and company, shown as a sub-heading. */
  heading?: string;
  /** Place and dates, shown next to the heading. */
  meta?: string;
  items: CvItem[];
}

export interface CvSection {
  id:
    | 'summary'
    | 'skills'
    | 'experience'
    | 'client_work'
    | 'education_languages'
    | 'certifications';
  title: string;
  /** Items render as a bullet list instead of paragraphs. */
  bullets?: boolean;
  blocks: CvBlock[];
}

export const CV_HEAD = {
  name: 'Juan Diego Londoño Chavarría',
  headline: 'AI Engineer | Agentic Systems, RAG & LLMOps on AWS',
  contact:
    'Medellín, Colombia · Open to remote | juandiego0329@gmail.com | linkedin.com/in/juandlch | github.com/JuanDLCH | Portfolio: juandlch.dev',
  stats: {
    id: 'stats',
    cite: 'Headline',
    text: '4+ yrs software engineering | 2+ yrs leading AI delivery | 10+ client projects | 5 industries | AWS & Claude Certified',
  } satisfies CvItem,
};

export const CV: CvSection[] = [
  {
    id: 'summary',
    title: 'Professional Summary',
    blocks: [
      {
        items: [
          {
            id: 'summary',
            cite: 'Summary',
            text: "AI Engineer with 4+ years of software engineering and 2+ years taking generative AI to production on AWS. Design and ship agentic systems, hybrid RAG, document AI and realtime voice agents, from the client's first discovery call to the infrastructure they run on. Full-stack roots (Python, TypeScript, serverless) mean every solution ships with APIs, evaluation, observability and a cost estimate, not just a prompt.",
          },
        ],
      },
    ],
  },
  {
    id: 'skills',
    title: 'Core Skills',
    blocks: [
      {
        items: [
          {
            id: 'skills-ai',
            cite: 'Skills: AI / LLM',
            label: 'AI / LLM',
            text: 'AI agents, agentic workflows, LangGraph, LangChain, LlamaIndex, MCP, RAG (hybrid search, reranking), embeddings, vector search, prompt engineering, tool/function calling, structured outputs, Claude, OpenAI, Gemini, Amazon Nova',
          },
          {
            id: 'skills-llmops',
            cite: 'Skills: LLMOps',
            label: 'LLMOps',
            text: 'automated LLM evaluation (evaluation agents), LangSmith tracing, per-call logging and cost tracking, CloudWatch observability, CI/CD for AI (GitHub Actions, Terraform, AWS SAM)',
          },
          {
            id: 'skills-voice',
            cite: 'Skills: Voice & Documents',
            label: 'Voice & Documents',
            text: 'Deepgram, ElevenLabs, Amazon Transcribe, Google Cloud STT/TTS, WebSockets, WebRTC, Textract, OCR',
          },
          {
            id: 'skills-aws',
            cite: 'Skills: AWS / Cloud',
            label: 'AWS',
            text: 'Bedrock, Bedrock AgentCore, Lambda, Step Functions, EventBridge, API Gateway, DynamoDB, Aurora, S3, CloudWatch, ECS/Fargate and more | Cloudflare: Workers, Durable Objects, D1, Cron Triggers, Zero Trust Access, Turnstile',
          },
          {
            id: 'skills-backend',
            cite: 'Skills: Backend & Data',
            label: 'Backend & Data',
            text: 'Python, TypeScript, Node.js, FastAPI, REST, PostgreSQL, pgvector, Redis, Redshift, Glue, Docker',
          },
          {
            id: 'skills-frontend',
            cite: 'Skills: Frontend & Integrations',
            label: 'Frontend',
            text: 'React, Next.js, Tailwind, Angular, Vue | Integrations: WhatsApp API, Google Maps (GCP), HubSpot, Twilio, n8n',
          },
        ],
      },
    ],
  },
  {
    id: 'experience',
    title: 'Professional Experience',
    bullets: true,
    blocks: [
      {
        heading: 'AI Engineer | Factored',
        meta: 'Nov 2026 – Present',
        items: [
          {
            id: 'factored',
            cite: 'AI Engineer, Factored',
            text: 'Joined Factored as an AI Engineer in November 2026, building AI for companies around the world.',
          },
        ],
      },
      {
        heading: 'Lead AI Engineer | Trade EC',
        meta: 'Quito, Ecuador (Remote) · Sep 2024 – Oct 2026',
        items: [
          {
            id: 'lead-team',
            cite: 'Lead AI Engineer: team',
            text: 'Led a 3-person team delivering custom AI solutions (chatbots, RAG/OCR, voice and text automation) on AWS for clients in food service, retail, cinema, finance and education, coordinating cross-team development with the front-end, back-end and QA teams.',
          },
          {
            id: 'lead-rag',
            cite: 'Lead AI Engineer: RAG',
            text: 'Designed agentic and RAG systems (LangGraph, LangChain, LlamaIndex) with query rewriting, hybrid keyword + vector retrieval, reranking and a validator agent that checked answers before they were returned, keeping responses grounded in client data.',
          },
          {
            id: 'lead-llmops',
            cite: 'Lead AI Engineer: LLMOps',
            label: 'LLMOps',
            text: 'Built evaluation agents that tested every change and logged and costed every LLM call (LangSmith, CloudWatch, Aurora), so model and prompt decisions followed latency, cost and quality data. Used AI-assisted development (Claude Code, Cursor) under strict human review of every PR.',
          },
          {
            id: 'lead-arch',
            cite: 'Lead AI Engineer: architecture',
            text: "Owned client discovery, architecture and cost estimation as the team's technical reference; contributed architecture, documentation and estimates to the company's AWS Generative AI Competency process.",
          },
        ],
      },
      {
        heading: 'Full Stack Engineer | Trade EC',
        meta: 'Quito, Ecuador (Remote) · Sep 2023 – Aug 2024',
        items: [
          {
            id: 'trade-ai',
            cite: 'Full Stack Engineer, Trade EC: AI prototypes',
            text: "Prototyped the chatbots and LLM tooling that grew into the company's AI practice and its first AI client deliveries.",
          },
          {
            id: 'trade-jv',
            cite: 'Full Stack Engineer, Trade EC: Juan Valdez',
            text: 'Delivered campaign software and data tooling for Juan Valdez: backend services, integrations, cloud deployment and reporting.',
          },
        ],
      },
      {
        heading: 'Full Stack Engineer | Stellion Tech SAS',
        meta: 'Medellín, Colombia (Hybrid) · Jun 2022 – Jul 2023',
        items: [
          {
            id: 'stellion-erp',
            cite: 'Full Stack Engineer, Stellion Tech',
            text: 'Delivered 2 ERP systems end to end for clients including SPCI: backend logic, UI modules, testing and deployment (Python, JavaScript, AWS).',
          },
        ],
      },
    ],
  },
  {
    id: 'client_work',
    title: 'Selected Client Work',
    bullets: true,
    blocks: [
      {
        items: [
          {
            id: 'client-muyu',
            cite: 'Client work: Muyu Education',
            label: 'Muyu Education',
            text: 'agentic platform that transcribes recorded classes (Amazon Transcribe, Step Functions) and returns structured JSON evaluations.',
          },
          {
            id: 'client-anefi',
            cite: 'Client work: ANEFI Ecuador',
            label: 'ANEFI Ecuador',
            text: 'agentic OCR pipeline extracting structured data from financial documents for downstream workflows.',
          },
          {
            id: 'client-kfc',
            cite: 'Client work: KFC Ecuador',
            label: 'KFC Ecuador',
            text: 'realtime voice agents for order taking: streaming STT/TTS, interruption handling and tool calls into ordering systems.',
          },
          {
            id: 'client-portfolio',
            cite: 'Personal project: juandlch.dev',
            label: 'juandlch.dev (personal)',
            text: 'live AI lab (chat + realtime voice agents) on Cloudflare Workers, Durable Objects and D1, with per-IP and per-call cost caps, Turnstile, and an admin guarded by Zero Trust Access.',
          },
          {
            id: 'client-chatbots',
            cite: 'Client work: chatbots',
            label: 'Multicines, InsureHero, El Hornero, Sushicorp, JXBS',
            text: 'LLM chatbots and WhatsApp (Meta Cloud API) assistants integrated with business systems.',
          },
        ],
      },
    ],
  },
  {
    id: 'education_languages',
    title: 'Education & Languages',
    blocks: [
      {
        items: [
          {
            id: 'education',
            cite: 'Education',
            label: 'B.Sc. Systems Engineering',
            text: 'Universidad de Medellín · Graduated 2022',
          },
          {
            id: 'languages',
            cite: 'Languages',
            label: 'Languages',
            text: 'Spanish – Native | English – Professional working proficiency',
          },
        ],
      },
    ],
  },
  {
    id: 'certifications',
    title: 'Certifications',
    bullets: true,
    blocks: [
      {
        items: [
          {
            id: 'cert-cca',
            cite: 'Certifications: Claude',
            label: 'Claude Certified Architect – Foundations (CCA-F)',
            text: 'Anthropic – 2026',
          },
          {
            id: 'cert-aws',
            cite: 'Certifications: AWS',
            label: 'AWS Certified AI Practitioner',
            text: 'Amazon Web Services – 2024 (also Early Adopter badge)',
          },
          {
            id: 'cert-bootcamp',
            cite: 'Certifications: GenAI bootcamp',
            label: 'Bootcamp: Generative AI and LLM Applications',
            text: 'Udemy – Jun 2024',
          },
        ],
      },
    ],
  },
];

export interface CvData {
  head: typeof CV_HEAD;
  sections: CvSection[];
}

/** The CV built with the site. */
export const BUNDLED_CV: CvData = { head: CV_HEAD, sections: CV };

const SECTION_IDS: CvSection['id'][] = [
  'summary',
  'skills',
  'experience',
  'client_work',
  'education_languages',
  'certifications',
];

const str = (v: unknown, max = 2000): v is string =>
  typeof v === 'string' && v.length > 0 && v.length <= max;
const opt = (v: unknown) => v === undefined || str(v);
const isItem = (v: unknown): v is CvItem => {
  const i = v as Partial<CvItem> | null;
  return (
    !!i &&
    str(i.id, 64) &&
    /^[\w-]+$/.test(i.id) &&
    str(i.cite, 200) &&
    str(i.text) &&
    opt(i.label)
  );
};

/** A cv.json from the CV repo, if it has the expected shape (unknown
 * section ids, duplicate item ids or missing fields reject it). */
export function parseCv(raw: unknown): CvData | null {
  const d = raw as {
    head?: Partial<CvData['head']>;
    sections?: unknown;
  } | null;
  const h = d?.head;
  if (!h || !str(h.name, 200) || !str(h.headline, 300) || !str(h.contact, 500))
    return null;
  if (!isItem(h.stats) || !Array.isArray(d.sections)) return null;
  const ids = new Set<string>([h.stats.id]);
  for (const s of d.sections as Partial<CvSection>[]) {
    if (!s || !SECTION_IDS.includes(s.id as CvSection['id'])) return null;
    if (!str(s.title, 200) || !Array.isArray(s.blocks)) return null;
    if (s.bullets !== undefined && typeof s.bullets !== 'boolean') return null;
    for (const b of s.blocks as Partial<CvBlock>[]) {
      if (!b || !opt(b.heading) || !opt(b.meta) || !Array.isArray(b.items))
        return null;
      for (const it of b.items) {
        if (!isItem(it) || ids.has(it.id)) return null;
        ids.add(it.id);
      }
    }
  }
  return {
    head: h as CvData['head'],
    sections: d.sections as CvSection[],
  };
}

/** Link that opens the CV viewer on these items (the PDF itself without JS). */
export const cvLink = (origin: string, id: string) =>
  `${new URL(cvPdf, origin).href}#cv=${id}`;

/** CV item id from a citation link, or null if it isn't one. */
export const cvLinkId = (href: string) => {
  // Browser only (the Worker imports this file too).
  const here = (globalThis as { location?: { origin: string } }).location;
  if (!here) return null;
  try {
    const u = new URL(href);
    if (u.origin !== here.origin) return null;
    if (u.pathname !== new URL(cvPdf, here.origin).pathname) return null;
    return /^#cv=([\w-]+)$/.exec(u.hash)?.[1] ?? null;
  } catch {
    return null;
  }
};
