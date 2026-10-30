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

/** What a meeting is about. Optional, but it helps him accept it. */
export const MEETING_PURPOSES = [
  'freelance',
  'job_offer',
  'consulting',
  'other',
] as const;
export type MeetingPurpose = (typeof MEETING_PURPOSES)[number];

/** Input of show_contact_options, as the chat reads it back to draw the
 * buttons, in the order given. Unknown values are dropped. */
export const contactInput = (raw: string) => {
  const none = {
    options: [] as ContactOption[],
    topic: '',
    purpose: null as MeetingPurpose | null,
    note: '',
  };
  try {
    const i = JSON.parse(raw) as Record<string, unknown>;
    const options = Array.isArray(i.options)
      ? [...new Set(i.options)].filter((o): o is ContactOption =>
          CONTACT_OPTIONS.includes(o as ContactOption),
        )
      : [];
    const text = (v: unknown, max: number) =>
      typeof v === 'string' ? v.trim().slice(0, max) : '';
    const purpose = MEETING_PURPOSES.includes(
      i.meeting_purpose as MeetingPurpose,
    )
      ? (i.meeting_purpose as MeetingPurpose)
      : null;
    return {
      options,
      topic: text(i.topic, 80),
      purpose,
      note: text(i.meeting_note, 300),
    };
  } catch {
    return none;
  }
};
