// Juan Diego's CV as data, transcribed from the private JuanDLCH/cv repo
// (versions/base.en.html, the source of src/assets/cv/*.pdf). The profile
// tools search it, and the chat's CV viewer renders it with the cited items
// highlighted, so every item has a stable id. Keep it in sync with the PDF.
import cvPdf from '../../assets/cv/Juan-Londono_AI-Engineer.pdf?url';

export { cvPdf };

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
    'Medellín, Colombia · Open to remote | juandiego0329@gmail.com | linkedin.com/in/juandlch | github.com/JuanDLCH',
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
            text: 'AI agents, agentic workflows, LangGraph, LangChain, LlamaIndex, MCP, RAG (hybrid search, reranking), embeddings, vector search, prompt engineering, tool/function calling, structured outputs, Claude, OpenAI, Amazon Nova',
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
            text: 'Deepgram, ElevenLabs, Amazon Transcribe, WebSockets, WebRTC, Textract, OCR, speech-to-text, text-to-speech',
          },
          {
            id: 'skills-aws',
            cite: 'Skills: AWS / Cloud',
            label: 'AWS / Cloud',
            text: 'Bedrock, Bedrock AgentCore, Lambda, Step Functions, EventBridge, API Gateway, DynamoDB, Aurora, S3, CloudWatch, ECS/Fargate',
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
            text: 'React, Next.js, Tailwind CSS, Angular, Vue | Integrations: WhatsApp Cloud API, HubSpot, Twilio, n8n, webhooks',
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
        heading: 'Lead AI Engineer | Trade EC',
        meta: 'Quito, Ecuador (Remote) · Sep 2024 – Present',
        items: [
          {
            id: 'lead-team',
            cite: 'Lead AI Engineer: team',
            text: 'Lead a 2-person team delivering custom AI solutions (chatbots, RAG/OCR, voice and text automation) on AWS for clients in food service, retail, cinema, finance and education.',
          },
          {
            id: 'lead-rag',
            cite: 'Lead AI Engineer: RAG',
            text: 'Designed agentic and RAG systems (LangGraph, LangChain, LlamaIndex) with query rewriting, hybrid keyword + vector retrieval, reranking and a validator agent that checks answers before they are returned, keeping responses grounded in client data.',
          },
          {
            id: 'lead-llmops',
            cite: 'Lead AI Engineer: LLMOps',
            label: 'LLMOps',
            text: 'Built evaluation agents that test every change in a loop and logged and costed every LLM call (LangSmith, CloudWatch, Aurora), so model and prompt decisions are driven by latency, cost and quality data.',
          },
          {
            id: 'lead-arch',
            cite: 'Lead AI Engineer: architecture',
            text: "Own client discovery, architecture and cost estimation as the team's technical reference; contributed architecture, documentation and estimates to the company's AWS Generative AI Competency process.",
          },
          {
            id: 'lead-ai-dev',
            cite: 'Lead AI Engineer: AI-assisted development',
            text: 'Use AI-assisted development (Claude Code, Cursor) under strict human review: every PR is reviewed and nothing reaches production unchecked.',
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
            text: 'agentic platform that transcribes recorded classes (Amazon Transcribe, Step Functions, Aurora) and returns structured JSON evaluations.',
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
            id: 'client-chatbots',
            cite: 'Client work: chatbots',
            label: 'Multicines, InsureHero, El Hornero, Sushicorp, JXBS',
            text: 'LLM chatbots and WhatsApp (Meta Cloud API) assistants integrated with business systems, including HubSpot CRM.',
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

/** Link that opens the CV viewer on these items (the PDF itself without JS). */
export const cvLink = (origin: string, id: string) =>
  `${new URL(cvPdf, origin).href}#cv=${id}`;

/** CV item id from a citation link, or null if it isn't one. */
export const cvLinkId = (href: string) => {
  if (typeof location === 'undefined') return null;
  try {
    const u = new URL(href);
    if (u.origin !== location.origin) return null;
    if (u.pathname !== new URL(cvPdf, location.origin).pathname) return null;
    return /^#cv=([\w-]+)$/.exec(u.hash)?.[1] ?? null;
  } catch {
    return null;
  }
};
