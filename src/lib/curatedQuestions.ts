/**
 * The decision questions Ask DealerPulse can always answer from our own
 * metrics. No data imports here, so the client can use the list for its
 * suggestion chips.
 */

export type CuratedId =
  | 'attention'
  | 'target'
  | 'losing'
  | 'stuck'
  | 'officers'
  | 'sources'
  | 'delays'
  | 'models'
  | 'pipeline';

export interface CuratedQuestion {
  id: CuratedId;
  question: string;
  /** Word stems that point at this question in a typed message. */
  keywords: string[];
}

export const CURATED_QUESTIONS: readonly CuratedQuestion[] = [
  {
    id: 'attention',
    question: 'Which branch needs attention first and why?',
    keywords: ['attention', 'first', 'priorit', 'worst', 'focus', 'fix', 'urgent', 'problem', 'concern', 'weak'],
  },
  {
    id: 'target',
    question: 'How far behind target are we?',
    keywords: ['target', 'behind', 'attainment', 'goal', 'plan', 'quota', 'short'],
  },
  {
    id: 'losing',
    question: 'Where are we losing leads?',
    keywords: ['losing', 'lost', 'lose', 'loss', 'drop', 'funnel', 'leak', 'reason'],
  },
  {
    id: 'stuck',
    question: 'Which booked orders are stuck?',
    keywords: ['stuck', 'booked', 'booking', 'undelivered', 'pending', 'waiting', 'unbilled'],
  },
  {
    id: 'officers',
    question: 'Who are the top and bottom sales officers?',
    keywords: [
      'officer',
      'reps',
      'sales rep',
      'salesperson',
      'staff',
      'people',
      'top',
      'bottom',
      'perform',
      'team',
      'best results',
      'best-performing',
      'best performing',
    ],
  },
  {
    id: 'sources',
    question: 'Which lead source converts best?',
    keywords: ['source', 'channel', 'walk', 'website', 'referral', 'social', 'expo', 'marketing', 'campaign'],
  },
  {
    id: 'delays',
    question: 'What is causing delivery delays?',
    keywords: ['delay', 'late', 'slow deliver', 'delivery time', 'days to deliver', 'logistic', 'allocation'],
  },
  {
    id: 'models',
    question: 'Which models drive revenue?',
    keywords: ['model', 'car', 'vehicle', 'fortuner', 'innova', 'camry', 'glanza', 'hyryder', 'hilux', 'revenue', 'mix'],
  },
  {
    id: 'pipeline',
    question: 'How much is in the open pipeline, and what is going cold?',
    keywords: ['pipeline', 'open', 'cold', 'follow', 'untouched', 'forecast', 'in play'],
  },
];

/**
 * Picks the curated question closest to a typed one: an exact match first,
 * then the most keyword hits (ties go to the earlier question). Single-word
 * keywords match the start of a word ("deliver" matches "delivery"); phrases
 * match anywhere. Null when nothing matches.
 */
export function matchCurated(text: string): CuratedId | null {
  const q = text.trim().toLowerCase().replace(/\s+/g, ' ');
  if (!q) return null;
  const exact = CURATED_QUESTIONS.find((c) => c.question.toLowerCase() === q);
  if (exact) return exact.id;

  const words = q.split(/[^a-z0-9]+/).filter(Boolean);
  const hit = (k: string) => (k.includes(' ') ? q.includes(k) : words.some((w) => w.startsWith(k)));
  let best: CuratedId | null = null;
  let bestScore = 0;
  for (const c of CURATED_QUESTIONS) {
    const score = c.keywords.filter(hit).length;
    if (score > bestScore) {
      best = c.id;
      bestScore = score;
    }
  }
  return best;
}
