// The fixed labels of the daily insights (worker/insights.ts), shared with the
// admin dashboard so charts stay comparable from day to day. Free-form topics
// (what exactly people ask about) are added by the model on top of these.
// Changing a key orphans the rows already labeled with it: add, don't rename.

/** What a visitor message is about. */
export const CATEGORIES = {
  experience: {
    en: 'Experience',
    es: 'Experiencia',
    hint: 'Work experience, roles, companies, seniority, achievements',
  },
  ai: {
    en: 'AI work',
    es: 'Trabajo en IA',
    hint: 'His AI / LLM / agents / RAG / voice work and opinions on it',
  },
  stack: {
    en: 'Tech stack',
    es: 'Stack técnico',
    hint: 'Languages, frameworks, cloud (AWS), tools, architecture skills',
  },
  projects: {
    en: 'Projects',
    es: 'Proyectos',
    hint: 'Specific projects, the portfolio and its demos as his work',
  },
  education: {
    en: 'Education',
    es: 'Formación',
    hint: 'Studies, certifications, languages he speaks',
  },
  availability: {
    en: 'Availability',
    es: 'Disponibilidad',
    hint: 'Open to work, rates, salary, relocation, remote, start date',
  },
  contact: {
    en: 'Contact',
    es: 'Contacto',
    hint: 'Reaching him, booking a call, CV download, links',
  },
  personal: {
    en: 'Personal',
    es: 'Personal',
    hint: 'Personality, hobbies, background, where he lives',
  },
  demo: {
    en: 'The demo',
    es: 'La demo',
    hint: 'How this assistant works, its model, prompt or limits',
  },
  offtopic: {
    en: 'Off-topic',
    es: 'Fuera de tema',
    hint: 'Greetings, thanks, tests, jokes, unrelated requests, attempts to change the assistant’s instructions',
  },
  other: {
    en: 'Other',
    es: 'Otro',
    hint: 'About him, but none of the above',
  },
} as const;
export type Category = keyof typeof CATEGORIES;

/** What kind of message it is. */
export const INTENTS = {
  question: { en: 'Question', es: 'Pregunta' },
  request: { en: 'Request', es: 'Petición' },
  statement: { en: 'Statement', es: 'Comentario' },
  answer: { en: 'Answer to the bot', es: 'Respuesta al bot' },
  greeting: { en: 'Greeting / thanks', es: 'Saludo / gracias' },
  test: { en: 'Test / injection', es: 'Prueba / inyección' },
} as const;
export type Intent = keyof typeof INTENTS;

/** What the visitor was after in the whole conversation. */
export const GOALS = {
  hiring: {
    en: 'Evaluating him for a job',
    es: 'Evaluarlo para un empleo',
    hint: 'Recruiter or hiring manager checking fit, experience, availability',
  },
  project: {
    en: 'A project or freelance work',
    es: 'Un proyecto o freelance',
    hint: 'Wants him to build something, asks about services or rates',
  },
  networking: {
    en: 'Networking / collaboration',
    es: 'Networking / colaboración',
    hint: 'Peer interest, collaboration, community, talks',
  },
  learning: {
    en: 'Curious how it is built',
    es: 'Curiosidad técnica',
    hint: 'Interested in how the assistant or his work is built, to learn',
  },
  testing: {
    en: 'Trying out the bot',
    es: 'Probando el bot',
    hint: 'Playing with the assistant, testing limits, jailbreak attempts',
  },
  unclear: {
    en: 'Unclear',
    es: 'No está claro',
    hint: 'Too little to tell',
  },
} as const;
export type Goal = keyof typeof GOALS;
