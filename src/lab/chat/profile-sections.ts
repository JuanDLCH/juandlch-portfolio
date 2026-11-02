// Sections of Juan Diego's profile (profile.ts), read by get_profile_section
// (tools.ts). Apart so the Worker can build Sophie's profile without the
// browser-only tools.
export const PROFILE_SECTIONS = [
  'summary',
  'skills',
  'experience',
  'client_work',
  'education_languages',
  'certifications',
  'portfolio_work',
  'portfolio_stack',
  'portfolio_principles',
  'portfolio_approach',
  'portfolio_build',
  'stories',
  'notes',
] as const;
export type ProfileSection = (typeof PROFILE_SECTIONS)[number];
