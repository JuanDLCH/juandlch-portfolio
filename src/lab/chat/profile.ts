// Knowledge base of the "Meet my AI" chat case: the CV (transcribed from the
// private JuanDLCH/cv repo, base.en) plus the portfolio's own copy. Loaded
// lazily by the profile tools in tools.ts, so it stays out of the page bundle.
// Data is in English; the model translates it.
import cvPdf from '../../assets/cv/Juan-Londono_AI-Engineer.pdf?url';
import { content } from '../../i18n/content';
import type { ProfileSection as Section } from './tools';

export interface Source {
  label: string;
  /** Page-relative; made absolute when a tool returns it. */
  href?: string;
}

export interface Entry {
  section: Section;
  title: string;
  text: string;
  source: Source;
}

const cv = (section: string): Source => ({
  label: `CV · ${section}`,
  href: cvPdf,
});
const site = (section: string, anchor: string): Source => ({
  label: `Portfolio · ${section}`,
  href: `/#${anchor}`,
});

const CV: Entry[] = [
  {
    section: 'summary',
    title: 'Headline',
    text: 'Juan Diego Londoño Chavarría, AI Engineer (agentic systems, RAG & LLMOps on AWS). Based in Medellín, Colombia; open to remote. 4+ years of software engineering, 2+ years leading AI delivery, 10+ client projects across 5 industries. AWS and Claude certified.',
    source: cv('Summary'),
  },
  {
    section: 'summary',
    title: 'Professional summary',
    text: "AI Engineer with 4+ years of software engineering and 2+ years taking generative AI to production on AWS. Designs and ships agentic systems, hybrid RAG, document AI and realtime voice agents, from the client's first discovery call to the infrastructure they run on. Full-stack roots (Python, TypeScript, serverless) mean every solution ships with APIs, evaluation, observability and a cost estimate, not just a prompt.",
    source: cv('Summary'),
  },
  {
    section: 'skills',
    title: 'AI / LLM',
    text: 'AI agents, agentic workflows, LangGraph, LangChain, LlamaIndex, MCP, RAG (hybrid search, reranking), embeddings, vector search, prompt engineering, tool/function calling, structured outputs, Claude, OpenAI, Amazon Nova.',
    source: cv('Core skills'),
  },
  {
    section: 'skills',
    title: 'LLMOps',
    text: 'Automated LLM evaluation (evaluation agents), LangSmith tracing, per-call logging and cost tracking, CloudWatch observability, CI/CD for AI (GitHub Actions, Terraform, AWS SAM).',
    source: cv('Core skills'),
  },
  {
    section: 'skills',
    title: 'Voice & documents',
    text: 'Deepgram, ElevenLabs, Amazon Transcribe, WebSockets, WebRTC, Textract, OCR, speech-to-text, text-to-speech.',
    source: cv('Core skills'),
  },
  {
    section: 'skills',
    title: 'AWS / cloud',
    text: 'Bedrock, Bedrock AgentCore, Lambda, Step Functions, EventBridge, API Gateway, DynamoDB, Aurora, S3, CloudWatch, ECS/Fargate.',
    source: cv('Core skills'),
  },
  {
    section: 'skills',
    title: 'Backend & data',
    text: 'Python, TypeScript, Node.js, FastAPI, REST, PostgreSQL, pgvector, Redis, Redshift, Glue, Docker.',
    source: cv('Core skills'),
  },
  {
    section: 'skills',
    title: 'Frontend & integrations',
    text: 'Frontend: React, Next.js, Tailwind CSS, Angular, Vue. Integrations: WhatsApp Cloud API, HubSpot, Twilio, n8n, webhooks.',
    source: cv('Core skills'),
  },
  {
    section: 'experience',
    title:
      'Lead AI Engineer · Trade EC · Quito, Ecuador (remote) · Sep 2024 – present',
    text: "Leads a 2-person team delivering custom AI solutions (chatbots, RAG/OCR, voice and text automation) on AWS for clients in food service, retail, cinema, finance and education. Designed agentic and RAG systems (LangGraph, LangChain, LlamaIndex) with query rewriting, hybrid keyword + vector retrieval, reranking and a validator agent that checks answers before they are returned. LLMOps: built evaluation agents that test every change in a loop, and logged and costed every LLM call (LangSmith, CloudWatch, Aurora), so model and prompt decisions follow latency, cost and quality data. Owns client discovery, architecture and cost estimation as the team's technical reference; contributed architecture, documentation and estimates to the company's AWS Generative AI Competency process. Uses AI-assisted development (Claude Code, Cursor) under strict human review: every PR is reviewed and nothing reaches production unchecked.",
    source: cv('Experience'),
  },
  {
    section: 'experience',
    title:
      'Full Stack Engineer · Trade EC · Quito, Ecuador (remote) · Sep 2023 – Aug 2024',
    text: "Prototyped the chatbots and LLM tooling that grew into the company's AI practice and its first AI client deliveries. Delivered campaign software and data tooling for Juan Valdez: backend services, integrations, cloud deployment and reporting.",
    source: cv('Experience'),
  },
  {
    section: 'experience',
    title:
      'Full Stack Engineer · Stellion Tech SAS · Medellín, Colombia (hybrid) · Jun 2022 – Jul 2023',
    text: 'Delivered 2 ERP systems end to end for clients including SPCI: backend logic, UI modules, testing and deployment (Python, JavaScript, AWS).',
    source: cv('Experience'),
  },
  {
    section: 'client_work',
    title: 'Muyu Education',
    text: 'Agentic platform that transcribes recorded classes (Amazon Transcribe, Step Functions, Aurora) and returns structured JSON evaluations.',
    source: cv('Selected client work'),
  },
  {
    section: 'client_work',
    title: 'ANEFI Ecuador',
    text: 'Agentic OCR pipeline extracting structured data from financial documents for downstream workflows.',
    source: cv('Selected client work'),
  },
  {
    section: 'client_work',
    title: 'KFC Ecuador',
    text: 'Realtime voice agents for order taking: streaming STT/TTS, interruption handling and tool calls into ordering systems.',
    source: cv('Selected client work'),
  },
  {
    section: 'client_work',
    title: 'Multicines, InsureHero, El Hornero, Sushicorp, JXBS',
    text: 'LLM chatbots and WhatsApp (Meta Cloud API) assistants integrated with business systems, including HubSpot CRM.',
    source: cv('Selected client work'),
  },
  {
    section: 'education_languages',
    title: 'Education',
    text: 'B.Sc. Systems Engineering, Universidad de Medellín, graduated 2022.',
    source: cv('Education'),
  },
  {
    section: 'education_languages',
    title: 'Languages',
    text: 'Spanish: native. English: professional working proficiency.',
    source: cv('Languages'),
  },
  {
    section: 'certifications',
    title: 'Certifications',
    text: 'Claude Certified Architect – Foundations (CCA-F), Anthropic, 2026. AWS Certified AI Practitioner, Amazon Web Services, 2024 (also the Early Adopter badge). Bootcamp: Generative AI and LLM Applications, Udemy, Jun 2024.',
    source: cv('Certifications'),
  },
];

// Portfolio copy, read from the site's own content so it never drifts.
const en = content.en;
const PORTFOLIO: Entry[] = [
  ...en.cases.map((c): Entry => ({
    section: 'portfolio_work',
    title: `${c.tag}: ${c.title}`,
    text: `${c.problem} ${c.role} Stack: ${c.stack.join(', ')}.`,
    source: site('Selected work', 'work'),
  })),
  ...en.stackGroups.map((g): Entry => ({
    section: 'portfolio_stack',
    title: g.title,
    text: `${g.items}.`,
    source: site('Stack', 'stack'),
  })),
  {
    section: 'portfolio_stack',
    title: 'AWS and other clouds',
    text: `${en.x.awsLeadA}Amazon Bedrock${en.x.awsLeadB} ${en.x.awsBody} ${en.x.awsFlex}`,
    source: site('Stack', 'stack'),
  },
  ...en.principles.map((p): Entry => ({
    section: 'portfolio_principles',
    title: p.title,
    text: p.body,
    source: site('Engineering principles', 'principles'),
  })),
  {
    section: 'portfolio_approach',
    title: 'Retrieval & RAG',
    text: en.x.ragSub,
    source: site('Retrieval & RAG', 'rag'),
  },
  {
    section: 'portfolio_approach',
    title: en.x.aboutTitle,
    text: `${en.x.aboutA}${en.x.aboutB}${en.x.aboutC} Path: ${[en.x.tl1, en.x.tl2, en.x.tl3, en.x.tl4].join(' → ')}.`,
    source: site('About', 'about'),
  },
  {
    section: 'portfolio_approach',
    title: en.x.leadTitle,
    text: en.x.leadIntro,
    source: site('About', 'about'),
  },
];

// REVIEW: confirm with Juan Diego. Facts not in the CV that recruiters ask.
const notes = (title: string, text: string): Entry => ({
  section: 'notes',
  title,
  text,
  source: { label: 'Juan Diego · notes' },
});
const NOTES: Entry[] = [
  notes(
    'Roles he is looking for',
    'AI Engineer, Lead AI Engineer or AI Solutions Architect roles where he designs and ships production AI (agents, RAG, voice, document AI) end to end.',
  ),
  notes(
    'Availability and location',
    'Based in Medellín, Colombia (UTC−5). Open to remote work.',
  ),
  notes(
    'Other clouds and providers',
    'AWS is his focus, not his limit: he works with whichever cloud or model provider a project requires (OpenAI, Anthropic, Amazon Nova, Google APIs among them).',
  ),
  notes(
    'How he learns new technology',
    'His path from full-stack ERP work to leading AI delivery came from picking up new stacks on real client projects. He learns by building: prototypes first, then production with evaluation and observability. Certifications (AWS, Anthropic) back the main areas.',
  ),
  notes(
    'Contact',
    'Email juandiego0329@gmail.com · LinkedIn linkedin.com/in/juandlch · GitHub github.com/JuanDLCH.',
  ),
];

export const PROFILE: Entry[] = [...CV, ...PORTFOLIO, ...NOTES];
