// Knowledge base of the "Meet my AI" chat case: the CV (the live cv.json from
// the CV repo, or the bundled copy in cv.ts) plus the portfolio's own copy,
// how the site is built, project stories and notes. Loaded lazily by the
// profile tools in tools.ts, so it stays out of the page bundle. Data is in
// English; the model translates it. The voice agent gets the same data as
// plain text (profileText), built by the Worker when each call starts.
import { content } from '../../i18n/content';
import { BUNDLED_CV, cvLink, type CvData } from './cv';
import type { ProfileSection as Section } from './profile-sections';

export interface Entry {
  section: Section;
  /** Shown in the tool card when it differs from the source label, e.g.
   * "CV · Experience". */
  group?: string;
  title: string;
  text: string;
  /** `url` is absolute: the chat only links http(s) URLs. */
  source: { label: string; url?: string };
}

const en = content.en;

/** Every entry, with source links on `origin`, from `cv` (the live CV from
 * the CV repo, or the bundled copy). */
export const buildProfile = (
  origin: string,
  cv: CvData = BUNDLED_CV,
): Entry[] => {
  const { head: CV_HEAD, sections: CV } = cv;
  const site = (section: string, anchor: string) => ({
    label: `Portfolio · ${section}`,
    url: new URL(`/#${anchor}`, origin).href,
  });

  // One entry per CV item; its link opens the CV viewer on that item.
  const CV_ENTRIES: Entry[] = [
    {
      section: 'summary',
      group: 'CV · Summary',
      title: `${CV_HEAD.name}, ${CV_HEAD.headline}`,
      text: `${CV_HEAD.contact}. ${CV_HEAD.stats.text}.`,
      source: {
        label: `CV · ${CV_HEAD.stats.cite}`,
        url: cvLink(origin, CV_HEAD.stats.id),
      },
    },
    ...CV.flatMap((sec) =>
      sec.blocks.flatMap((b) =>
        b.items.map((it): Entry => ({
          section: sec.id,
          group: `CV · ${sec.title}`,
          title:
            [b.heading, b.meta, it.label].filter(Boolean).join(' · ') ||
            sec.title,
          text: it.text,
          source: {
            label: `CV · ${it.cite}`,
            url: cvLink(origin, it.id),
          },
        })),
      ),
    ),
  ];

  // Portfolio copy, read from the site's own content so it never drifts.
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

  return [...CV_ENTRIES, ...PORTFOLIO, ...BUILD, ...STORIES, ...NOTES];
};

// How this portfolio is built, for "how did he build this site?". Keep it in
// step with the code (CLAUDE.md describes each part).
const build = (title: string, text: string): Entry => ({
  section: 'portfolio_build',
  title,
  text,
  source: { label: 'Portfolio · How it is built' },
});
const BUILD: Entry[] = [
  build(
    'The site and where it runs',
    'He built this portfolio himself with Astro (static pages), React for the interactive parts and Tailwind CSS, in TypeScript. It is bilingual (English and Spanish on the same URL, switching without reloading) with light and dark themes and a layout that adapts to any screen. It runs entirely on Cloudflare, a platform he learned for this project: one Cloudflare Worker serves the site and its APIs on his own domain, juandlch.dev, with Durable Objects for the limits and the voice calls, D1 as the database, Turnstile against bots and Access guarding his private dashboard. It has its own CI/CD pipeline: every change goes through a pull request that is checked automatically (lint, formatting, types, build) and reviewed by an AI reviewer, like a teammate helping him catch mistakes, and once merged it deploys to production on its own.',
  ),
  build(
    'The AI lab: live chat demos',
    'The lab has four live agents running on OpenAI models: "Meet my AI" (this assistant), grounded in his CV and portfolio, whose citations open his CV with the cited lines highlighted; an order assistant for a made-up restaurant that builds and prices orders; an auto insurance assistant that files claims, checking photos of the car and invoices in PDF; and a document intelligence agent that answers only from the documents a visitor uploads, citing the exact passages. The agent loop and tools run in the browser, while a Cloudflare Worker in front of OpenAI fixes each demo\'s prompt, model and tools, so the key cannot be used for anything else, with a bot check (Cloudflare Turnstile) and daily usage and spending limits per visitor and for the whole site.',
  ),
  build(
    'Sophie, the voice agent',
    "Sophie is a real-time voice agent built on the OpenAI Realtime API over WebRTC. The browser never gets a key: it sends its connection offer to the Worker, which creates the call on the server with fixed instructions, and a Durable Object hangs up at the time limit or if a call costs too much. A five-minute budget can be paused and resumed, the greeting is recorded with Sophie's own voice, and her animated face reacts to who is speaking, smiles and winks.",
  ),
  build(
    'His CV, always up to date',
    'His CV has its own CI/CD pipeline: it lives as code in a separate repository, and every time he changes it a GitHub Actions workflow builds the English and Spanish PDFs (checking each stays on one page) and a structured data version of it. This site reads both straight from that repository, cached for an hour: the "My CV" downloads, this chat and its CV citations, and Sophie all use the latest version. So when his work changes he only updates his CV, and the portfolio and its AI agents stay in sync without redeploying anything.',
  ),
  build(
    'Metrics and the daily AI report',
    "He measures how the site is used: visits by real people from the site's own counter, which leaves out bots (bot user agents, automated browsers, data-center networks) and his own visits, plus use, cost and country per demo, in a Cloudflare D1 database (anonymous: no IPs, emails and phone numbers masked, deleted after 180 days). Every night a batch job classifies what visitors asked the profile agents with a small model (topic, intent and what each visitor was after) and a stronger model writes a short report of what people were most interested in, citing their messages; the code checks every citation and computes every count, so the report cannot make things up. He reads it all in a private dashboard behind Cloudflare Access, with charts, a world map, costs and how many visitors of each demo go on to use it.",
  ),
];

// The stories behind his projects: challenges and how he solved them, told
// as anecdotes. Only what Juan Diego wrote; never fill gaps.
const story = (project: string, text: string): Entry => ({
  section: 'stories',
  title: project,
  text,
  source: { label: `Juan Diego · ${project}` },
});
const STORIES: Entry[] = [
  story(
    'KFC Ecuador (voice ordering agents)',
    'The challenge: the client wanted answers with no noticeable delay, and the classic pipeline (speech-to-text, then the LLM, then text-to-speech) could not get there. He dropped it and moved to ElevenLabs realtime models, which got the latency the client wanted. The funny part: early on, the agent got annoyed when a customer kept changing their order, and once told the customer that it was the one in charge. They tuned that out, of course.',
  ),
  story(
    'Muyu Education (class transcription and evaluation)',
    'The hardest part was the client: they would ask for something, not like it once they saw it, and then come back with big changes. What turned it around was building the whole flow as a graph in AWS Step Functions: seeing each step, the client finally understood how the project worked, could check errors on their own, and started coming back with much clearer, more concise tickets.',
  ),
  story(
    'ANEFI Ecuador (agentic OCR for financial documents)',
    'Honestly, no drama on this one: the OCR pipeline was delivered and worked as expected, in the exact format requested. A big reason was that the people using its output were the backend team, who were on the same side, so any detail got sorted out quickly and in a friendly way between them. It just worked.',
  ),
  story(
    'Chatbots and WhatsApp assistants (Multicines, InsureHero, El Hornero, Sushicorp, JXBS)',
    "The hardest part was dealing with Meta and its platforms. The upside is that he learned them inside out: he now moves around Meta's WhatsApp platforms like a fish in water, so adding numbers, creating the bots and connecting the WhatsApp Business (Cloud) API is a piece of cake for him, without needing intermediaries like Twilio.",
  ),
  story(
    'Trade EC (leading AI delivery)',
    'A great experience, above all mentoring and teaching the people on his team. One of them learned really fast and, as a fun fact, later left Trade EC to teach AI at a university.',
  ),
  story(
    'Stellion Tech (his first professional steps)',
    'Stellion is where he learned all his foundations and was given room to experiment in his first professional steps. His worst mistake happened there: the day before a delivery he accidentally deleted the whole CloudFormation stack, which held all the items of an industrial safety client (measurements, costs and more). At 6 a.m. they were still trying to bring everything back; with his leads and mentors they recovered it and nothing was lost. A lesson he never forgot.',
  ),
  story(
    'This portfolio (on a tiny budget)',
    "The challenge was cost: he wanted a portfolio running in real production that shows what he can do, but with no budget to keep it running. So he learned free tools he had never used, above all Cloudflare's cloud (Workers, Durable Objects, D1, Turnstile, Access, Web Analytics), and loved them. In the end all his AI testing cost less than a dollar, and the most expensive part was the domain. He would definitely use Cloudflare again in future projects, together with AWS: proof of how quickly he adapts to a new platform.",
  ),
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
    'Current role',
    'Since November 23, 2026 he is an AI Engineer at Factored. Before that he spent two years as Lead AI Engineer at Trade EC (Sep 2024 – Oct 2026), where he went straight from full stack to leading the AI team. His project at Factored is not public yet, so say only that he builds AI there; internal levels are never part of his title.',
  ),
  notes(
    'Roles he is looking for',
    'AI Engineer, Lead AI Engineer or AI Solutions Architect roles where he designs and ships production AI (agents, RAG, voice, document AI) end to end.',
  ),
  notes(
    'Availability and location',
    'Based in Medellín, Colombia (UTC−5). Open to job offers and freelance projects: on-site or hybrid in Medellín, or remote for companies abroad. Available to travel for work when needed, but not to relocate.',
  ),
  notes(
    'Hobbies and fun facts',
    'He plays soccer three to four times a week, as a goalkeeper. He also enjoys going to the gym and is a big fan of video games.',
  ),
  notes(
    'Other clouds and providers',
    'AWS is his focus, not his limit: he works with whichever cloud or model provider a project requires (OpenAI, Anthropic, Amazon Nova, Google APIs among them). At Trade EC he also used Google AI services for voice and transcription, and he built this portfolio on Cloudflare (Workers, Durable Objects, D1, Turnstile, Access), a platform he picked up for it and would use again alongside AWS.',
  ),
  notes(
    'Learning and new challenges',
    'He is willing to learn new languages, frameworks, clouds and tools, and to take on challenges outside his current stack. His path from full-stack ERP work to leading AI delivery came from picking up new stacks on real client projects. He learns by building: prototypes first, then production with evaluation and observability. Certifications (AWS, Anthropic) back the main areas.',
  ),
  notes(
    'Contact',
    'Email juandiego0329@gmail.com · LinkedIn linkedin.com/in/juandlch · GitHub github.com/JuanDLCH.',
  ),
];

/** The whole profile as compact text, one line per entry under its group,
 * for prompts that take it inline (no links: the voice agent can't cite). */
export const profileText = (cv: CvData = BUNDLED_CV) => {
  const lines: string[] = [];
  let group = '';
  for (const e of buildProfile('https://example.invalid', cv)) {
    const g = e.group ?? e.source.label;
    if (g !== group) lines.push('', `## ${(group = g)}`);
    lines.push(`- ${e.title}: ${e.text}`);
  }
  return lines.join('\n').trim();
};
