// How visitors reach Juan Diego from the chat lab. The "Meet my AI" agent
// shows these as buttons through the show_contact_options tool.
export const CONTACT = {
  email: 'juandiego0329@gmail.com',
  linkedin: 'https://www.linkedin.com/in/juandlch/',
  github: 'https://github.com/JuanDLCH',
  /** Booking page that creates a Google Meet (a Google Calendar appointment
   * schedule). While null, the meeting button shows as coming soon and the
   * agent doesn't offer to book. */
  booking: 'https://calendar.app.google/6ae9dpvPz8mEiRRdA' as string | null,
};

export const CONTACT_OPTIONS = [
  'meeting',
  'email',
  'linkedin',
  'github',
] as const;
export type ContactOption = (typeof CONTACT_OPTIONS)[number];

/** Input of show_contact_options, as the chat reads it back to draw the
 * buttons, in the order given. Unknown options are dropped. `lang` is the
 * conversation's language, when the call gave one. */
export const contactInput = (raw: string) => {
  try {
    const i = JSON.parse(raw) as {
      options?: unknown;
      topic?: unknown;
      lang?: unknown;
    };
    const options = Array.isArray(i.options)
      ? [...new Set(i.options)].filter((o): o is ContactOption =>
          CONTACT_OPTIONS.includes(o as ContactOption),
        )
      : [];
    const topic = typeof i.topic === 'string' ? i.topic.slice(0, 80) : '';
    const lang =
      i.lang === 'es' || i.lang === 'en' ? (i.lang as 'es' | 'en') : undefined;
    return { options, topic, lang };
  } catch {
    return { options: [] as ContactOption[], topic: '', lang: undefined };
  }
};
