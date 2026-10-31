// Policy and claim logic of the "Auto insurance assistant" case: a made-up
// insurer and account. The model reads the policy, describes the photo it
// sees and passes the claim details; whether something is covered, whether
// the photo matches the insured car and whether a claim can be filed is
// decided here. Labels are bilingual and come back in the customer's
// language (`lang`), like the order case.
import type { Lang } from './order';

type L = { en: string; es: string };

export const INSURER = 'Northlane Insurance';

export const POLICY = {
  holder: 'Alex Rivera',
  number: 'NL-AUTO-48213',
  status: 'active',
  start: '2024-03-01',
  premium_month: 96,
  vehicle: {
    year: 2022,
    make: 'Mazda',
    model: '3',
    body: 'sedan',
    color: 'red',
    color_label: { en: 'Soul Red', es: 'Rojo Soul' },
    plate: 'JDR-482',
  },
  drivers: ['Alex Rivera'],
};

export const COVERAGES = [
  'collision',
  'comprehensive',
  'glass',
  'liability',
  'roadside',
  'rental',
] as const;
type CoverageId = (typeof COVERAGES)[number];

interface Coverage {
  id: CoverageId;
  label: L;
  limit: L;
  deductible: number | null;
}

export const COVERAGE: Record<CoverageId, Coverage> = {
  collision: {
    id: 'collision',
    label: { en: 'Collision', es: 'Colisión' },
    limit: { en: 'Actual cash value', es: 'Valor comercial del auto' },
    deductible: 500,
  },
  comprehensive: {
    id: 'comprehensive',
    label: { en: 'Comprehensive', es: 'Cobertura amplia' },
    limit: { en: 'Actual cash value', es: 'Valor comercial del auto' },
    deductible: 250,
  },
  glass: {
    id: 'glass',
    label: { en: 'Glass', es: 'Cristales' },
    limit: { en: 'Repair or replacement', es: 'Reparación o reemplazo' },
    deductible: 0,
  },
  liability: {
    id: 'liability',
    label: { en: 'Liability', es: 'Responsabilidad civil' },
    limit: {
      en: '$100k per person · $300k per accident',
      es: '$100k por persona · $300k por accidente',
    },
    deductible: null,
  },
  roadside: {
    id: 'roadside',
    label: { en: 'Roadside assistance', es: 'Asistencia en carretera' },
    limit: {
      en: 'Towing, battery, tire and lockout, 24/7',
      es: 'Grúa, batería, llanta y cerrajería, 24/7',
    },
    deductible: null,
  },
  rental: {
    id: 'rental',
    label: { en: 'Rental car', es: 'Auto de reemplazo' },
    limit: { en: 'Up to $40/day for 15 days', es: 'Hasta $40/día por 15 días' },
    deductible: null,
  },
};

/** What can happen to the car, and which coverage pays for it (null: an
 * exclusion, not covered). */
export const INCIDENTS = {
  collision: 'collision',
  parking: 'collision',
  theft: 'comprehensive',
  vandalism: 'comprehensive',
  hail: 'comprehensive',
  flood: 'comprehensive',
  fire: 'comprehensive',
  animal: 'comprehensive',
  falling_object: 'comprehensive',
  glass: 'glass',
  damage_to_others: 'liability',
  breakdown: 'roadside',
  racing: null,
  dui: null,
  rideshare: null,
  wear_and_tear: null,
  unlisted_driver: null,
} as const satisfies Record<string, CoverageId | null>;
export type Incident = keyof typeof INCIDENTS;
export const INCIDENT_IDS = Object.keys(INCIDENTS) as Incident[];

export const INCIDENT_LABEL: Record<Incident, L> = {
  collision: { en: 'Collision', es: 'Choque' },
  parking: { en: 'Parking accident', es: 'Choque al estacionar' },
  theft: { en: 'Theft', es: 'Robo' },
  vandalism: { en: 'Vandalism', es: 'Vandalismo' },
  hail: { en: 'Hail', es: 'Granizo' },
  flood: { en: 'Flood', es: 'Inundación' },
  fire: { en: 'Fire', es: 'Incendio' },
  animal: { en: 'Hit an animal', es: 'Choque con un animal' },
  falling_object: { en: 'Falling object', es: 'Caída de objeto' },
  glass: { en: 'Broken glass', es: 'Cristal roto' },
  damage_to_others: { en: 'Damage to others', es: 'Daños a terceros' },
  breakdown: { en: 'Breakdown', es: 'Avería' },
  racing: { en: 'Racing', es: 'Carreras' },
  dui: { en: 'Driving under the influence', es: 'Conducir bajo efectos' },
  rideshare: {
    en: 'Commercial or rideshare use',
    es: 'Uso comercial o de app',
  },
  wear_and_tear: { en: 'Wear and tear', es: 'Desgaste' },
  unlisted_driver: {
    en: 'Driver not on the policy',
    es: 'Conductor no incluido en la póliza',
  },
};

/** Incidents a claim can be filed for here: damage to the insured car. */
const CLAIMABLE: Incident[] = INCIDENT_IDS.filter((i) => {
  const cov = INCIDENTS[i];
  return cov === 'collision' || cov === 'comprehensive' || cov === 'glass';
});
/** Nothing left to photograph. */
const NO_PHOTO: Incident[] = ['theft'];

export const today = () => new Date().toLocaleDateString('en-CA');

export const describePolicy = (lang: Lang) => ({
  insurer: INSURER,
  holder: POLICY.holder,
  policy_number: POLICY.number,
  status: POLICY.status,
  start: POLICY.start,
  end: 'none: continuous coverage, renews every month',
  premium: `$${POLICY.premium_month}/month`,
  vehicle: {
    ...POLICY.vehicle,
    color_label: POLICY.vehicle.color_label[lang],
  },
  drivers: POLICY.drivers,
  coverages: COVERAGES.map((id) => ({
    id,
    name: COVERAGE[id].label[lang],
    limit: COVERAGE[id].limit[lang],
    deductible: COVERAGE[id].deductible,
  })),
  exclusions: INCIDENT_IDS.filter((i) => INCIDENTS[i] === null).map(
    (i) => INCIDENT_LABEL[i][lang],
  ),
  today: today(),
});

export const checkCoverage = (incident: Incident, lang: Lang) => {
  const cov = INCIDENTS[incident];
  const label = INCIDENT_LABEL[incident][lang];
  if (cov === null)
    return {
      incident: label,
      covered: false,
      reason: `${INCIDENT_LABEL[incident].en} is an exclusion of this policy.`,
    };
  const c = COVERAGE[cov];
  return {
    incident: label,
    covered: true,
    coverage: c.label[lang],
    limit: c.limit[lang],
    deductible: c.deductible,
    claimable: CLAIMABLE.includes(incident),
    photo_needed: CLAIMABLE.includes(incident) && !NO_PHOTO.includes(incident),
    today: today(),
  };
};

// Photo check: the model reports what it sees, the code compares it with the
// insured car.
export const BODY_TYPES = [
  'sedan',
  'hatchback',
  'coupe',
  'suv',
  'pickup',
  'van',
  'wagon',
  'convertible',
  'motorcycle',
  'other',
  'unknown',
] as const;
export type BodyType = (typeof BODY_TYPES)[number];

const fold = (s: string) =>
  s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();

// Color words (English and Spanish) by family.
const COLOR_FAMILIES: Record<string, string[]> = {
  red: [
    'red',
    'maroon',
    'burgundy',
    'crimson',
    'wine',
    'cherry',
    'rojo',
    'granate',
    'vino',
    'carmesi',
    'tinto',
  ],
  grey: [
    'grey',
    'gray',
    'silver',
    'gunmetal',
    'graphite',
    'gris',
    'plata',
    'plateado',
    'grafito',
  ],
  white: ['white', 'pearl', 'blanco', 'perla'],
  black: ['black', 'negro'],
  blue: ['blue', 'navy', 'azul'],
  green: ['green', 'verde'],
  yellow: ['yellow', 'gold', 'amarillo', 'dorado'],
  orange: ['orange', 'naranja', 'anaranjado'],
  brown: ['brown', 'beige', 'tan', 'bronze', 'cafe', 'marron', 'bronce'],
  purple: ['purple', 'violet', 'morado', 'violeta'],
};
const colorFamily = (color: string) => {
  const w = fold(color).split(/[^a-z]+/);
  return (
    Object.entries(COLOR_FAMILIES).find(([, names]) =>
      names.some((n) => w.includes(n)),
    )?.[0] ?? null
  );
};

export interface PhotoObservation {
  vehicle_visible: boolean;
  color: string;
  body_type: BodyType;
  make?: string;
  damage_visible: boolean;
  damage_areas: string[];
}

export interface PhotoCheck {
  status: 'match' | 'mismatch' | 'unclear';
  reasons: string[];
  observed: PhotoObservation;
}

// "a" or "an" before a word.
const a = (w: string) => `${/^([aeiou]|SUV)/i.test(w) ? 'an' : 'a'} ${w}`;

export const checkPhoto = (o: PhotoObservation): PhotoCheck => {
  const v = POLICY.vehicle;
  const insured = `a ${v.color} ${v.make} ${v.model} ${v.body}`;
  if (!o.vehicle_visible)
    return {
      status: 'unclear',
      reasons: ['No vehicle is visible in the photo.'],
      observed: o,
    };
  const mismatch: string[] = [];
  const unclear: string[] = [];
  const family = colorFamily(o.color);
  if (family === null)
    unclear.push(
      `The color "${o.color}" can't be compared; ask for a clearer photo.`,
    );
  else if (family !== v.color)
    mismatch.push(
      `The photo shows ${a(`${o.color} car`)}; the policy covers ${insured}.`,
    );
  if (o.body_type === 'unknown' || o.body_type === 'other')
    unclear.push('The body type is not clear in the photo.');
  // The Mazda 3 also comes as a hatchback, hard to tell from the sedan in a
  // close-up.
  else if (o.body_type !== v.body && o.body_type !== 'hatchback')
    mismatch.push(
      `The photo shows ${a(o.body_type === 'suv' ? 'SUV' : o.body_type)}; the policy covers ${insured}.`,
    );
  const make = o.make ? fold(o.make) : '';
  if (make && make !== 'unknown' && !make.includes(fold(v.make)))
    mismatch.push(
      `The photo shows ${a(o.make!)}; the policy covers ${insured}.`,
    );
  if (mismatch.length)
    return { status: 'mismatch', reasons: mismatch, observed: o };
  if (!o.damage_visible)
    unclear.push(
      'The car matches, but no damage is visible: ask for a photo that shows it.',
    );
  if (unclear.length)
    return { status: 'unclear', reasons: unclear, observed: o };
  return {
    status: 'match',
    reasons: [`The photo matches the insured car (${insured}).`],
    observed: o,
  };
};

export interface Claim {
  claim_id: string;
  incident: Incident;
  date: string;
  description: string;
  location?: string;
  coverage: CoverageId;
  deductible: number;
  damage_areas: string[];
  filed: string;
  status: 'in_review';
  lang: Lang;
}

export interface Claims {
  /** The latest photo check; a claim needs it to be a match. */
  photo?: PhotoCheck;
  list: Claim[];
}

export interface ClaimInput {
  incident: Incident;
  date: string;
  description: string;
  location?: string;
  lang: Lang;
}

/** Files a claim, or returns everything that blocks it. */
export const fileClaim = (
  claims: Claims,
  i: ClaimInput,
): { claim: Claim } | { errors: string[] } => {
  const errors: string[] = [];
  const cov = INCIDENTS[i.incident];
  if (cov === null)
    errors.push(
      `${INCIDENT_LABEL[i.incident].en} is excluded: there is nothing to claim.`,
    );
  else if (!CLAIMABLE.includes(i.incident))
    errors.push(
      `Claims here are for damage to the insured car (${CLAIMABLE.join(', ')}); ${i.incident} is handled by phone.`,
    );
  const now = today();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(i.date) || Number.isNaN(Date.parse(i.date)))
    errors.push(
      `date must be YYYY-MM-DD (today is ${now}); ask when it happened.`,
    );
  else if (i.date > now)
    errors.push(`The date ${i.date} is in the future (today is ${now}).`);
  else if (i.date < POLICY.start)
    errors.push(
      `The policy started on ${POLICY.start}; ${i.date} is before it.`,
    );
  if (i.description.trim().length < 10)
    errors.push('Ask the customer what happened: the description is missing.');
  const photo = claims.photo;
  if (!NO_PHOTO.includes(i.incident) && photo?.status !== 'match')
    errors.push(
      photo
        ? `The last photo did not pass the check (${photo.status}): ${photo.reasons.join(' ')}`
        : 'No photo was checked: call request_photo and check the photo first.',
    );
  if (errors.length || cov === null) return { errors };
  return {
    claim: {
      claim_id: `CLM-${now.slice(0, 4)}-${Math.floor(10000 + Math.random() * 90000)}`,
      incident: i.incident,
      date: i.date,
      description: i.description.trim().slice(0, 500),
      ...(i.location?.trim()
        ? { location: i.location.trim().slice(0, 120) }
        : {}),
      coverage: cov,
      deductible: COVERAGE[cov].deductible ?? 0,
      damage_areas: NO_PHOTO.includes(i.incident)
        ? []
        : (photo?.observed.damage_areas ?? []),
      filed: now,
      status: 'in_review',
      lang: i.lang,
    },
  };
};

export const describeClaim = (c: Claim) => ({
  claim_id: c.claim_id,
  status: 'in review: an adjuster will contact the customer (simulated)',
  incident: INCIDENT_LABEL[c.incident][c.lang],
  date: c.date,
  filed: c.filed,
  coverage: COVERAGE[c.coverage].label[c.lang],
  deductible: c.deductible,
  ...(c.location ? { location: c.location } : {}),
  damage_areas: c.damage_areas,
});
