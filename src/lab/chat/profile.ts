// Knowledge base of the "Meet my AI" chat case: the CV (cv.ts) plus the
// portfolio's own copy and a few notes. Loaded lazily by the profile tools in
// tools.ts, so it stays out of the page bundle. Data is in English; the model
// translates it. The voice agent gets the same data as plain text
// (profileText), written at build time by src/pages/lab/voice-profile.txt.ts.
import { content } from '../../i18n/content';
import { CV, CV_HEAD, cvLink } from './cv';
import type { ProfileSection as Section } from './tools';

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

/** Every entry, with source links on `origin`. */
export const buildProfile = (origin: string): Entry[] => {
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

  return [...CV_ENTRIES, ...PORTFOLIO, ...NOTES];
};

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
    'Based in Medellín, Colombia (UTC−5). Open to job offers and freelance projects: on-site or hybrid in Medellín, or remote for companies abroad. Available to travel for work when needed, but not to relocate.',
  ),
  notes(
    'Hobbies and fun facts',
    'He plays soccer three to four times a week, as a goalkeeper. He also enjoys going to the gym and is a big fan of video games.',
  ),
  notes(
    'Other clouds and providers',
    'AWS is his focus, not his limit: he works with whichever cloud or model provider a project requires (OpenAI, Anthropic, Amazon Nova, Google APIs among them).',
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
export const profileText = () => {
  const lines: string[] = [];
  let group = '';
  for (const e of buildProfile('https://example.invalid')) {
    const g = e.group ?? e.source.label;
    if (g !== group) lines.push('', `## ${(group = g)}`);
    lines.push(`- ${e.title}: ${e.text}`);
  }
  return lines.join('\n').trim();
};
