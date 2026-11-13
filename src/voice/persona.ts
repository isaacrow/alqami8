import { AlqamiArtifact } from '../data/alqamiArtifacts';
import { MoonCardData } from '../moon/readRecord';
import { VoiceLang } from './speak';

/**
 * What a speaking object says. Every sentence is built from its catalogue record and nothing else: where the record
 * is silent, the object says so. No AI is involved.
 *
 * Objects speak in the first person ("I am..."). Sacred and revered texts are presented by a narrator in the third
 * person instead ("This is...").
 */

export interface PersonaFacts {
  title: string;
  subtitle?: string;
  makers: Array<{ name: string; role?: string }>;
  /** Free-text makers line, for records that do not list people one by one. */
  makerText?: string;
  date?: string;
  place?: string;
  publisher?: string;
  summary?: string;
  material?: string;
  dimensions?: string;
  extent?: string;
  holder?: string;
  shelfMark?: string;
  /** Presented by a narrator rather than speaking as "I". */
  narrated: boolean;
}

export type QuestionId = 'intro' | 'who' | 'when' | 'where' | 'story' | 'body' | 'kept';

export const QUESTIONS: Array<{ id: Exclude<QuestionId, 'intro'>; ar: string; en: string }> = [
  { id: 'who', ar: 'من صنعك؟', en: 'Who made you?' },
  { id: 'when', ar: 'ما تاريخك؟', en: 'How old are you?' },
  { id: 'where', ar: 'من أين أنت؟', en: 'Where are you from?' },
  { id: 'story', ar: 'ما قصتك؟', en: 'What is your story?' },
  { id: 'body', ar: 'ممَّ صُنعت؟', en: 'What are you made of?' },
  { id: 'kept', ar: 'أين تُحفظ؟', en: 'Where are you kept?' },
];

const REVERED = /قرآن|مصحف|نهج البلاغة|الصحيفة السجادية|حديث|qur['’ʼ]?an|koran|mushaf|nahj al-?balagha|hadith/i;

export function factsFromCard(card: MoonCardData): PersonaFacts {
  const material = card.notes.find((n) => /material|مادة|ورق|حبر|paper|ink|bronze|steel|clay|ceramic|خزف|فولاذ|طين/i.test(n));
  return {
    title: card.title,
    subtitle: card.subtitle,
    makers: card.contributors.map((c) => ({ name: c.label, role: c.role })),
    date: card.date,
    place: card.place?.label,
    publisher: card.publisher?.label,
    summary: card.summary,
    material,
    dimensions: card.dimensions,
    extent: card.extent,
    holder: card.holder,
    shelfMark: card.shelfMarks[0],
    narrated: REVERED.test([card.title, card.subtitle, ...card.subjects.map((s) => s.label), ...card.genres].join(' ')),
  };
}

export function factsFromArtifact(a: AlqamiArtifact, lang: VoiceLang): PersonaFacts {
  const pick = (p?: { ar: string; en: string }) => (p ? p[lang] || p.ar || p.en : undefined) || undefined;
  return {
    title: pick(a.title) ?? a.id,
    subtitle: pick(a.subtitle),
    makers: [],
    makerText: pick(a.creator),
    date: pick(a.period),
    summary: pick(a.description),
    material: pick(a.details.material),
    dimensions: a.details.dimensions || undefined,
    holder: pick(a.institution),
    shelfMark: a.itemCode || undefined,
    narrated: REVERED.test(`${a.title.ar} ${a.title.en}`),
  };
}

// Sentences for the voice: split on sentence ends, and end each one cleanly.
function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?؟])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}
const end = (s: string) => (/[.!?؟]$/.test(s.trim()) ? s.trim() : `${s.trim()}.`);

/** The sentences that answer one question, in the record's own facts. */
export function answer(f: PersonaFacts, q: QuestionId, lang: VoiceLang): string[] {
  const ar = lang === 'ar';
  const me = !f.narrated;
  const unknown = ar ? (me ? 'سجلّي لا يذكر ذلك.' : 'السجلّ لا يذكر ذلك.') : me ? 'My record does not say.' : 'The record does not say.';
  const people = f.makers.map((m) => (m.role ? `${m.name} (${m.role})` : m.name)).join(ar ? '، ' : ', ');

  const who = (): string[] => {
    if (people) return [ar ? `${me ? 'وراء وجودي' : 'وراء هذا العمل'}: ${people}.` : `The people behind ${me ? 'me' : 'it'}: ${people}.`];
    if (f.makerText) return [end(f.makerText)];
    return [];
  };
  const when = (): string[] =>
    f.date ? [ar ? `${me ? 'يعود تاريخي' : 'يعود تاريخه'} إلى ${f.date}.` : `${me ? 'I date' : 'It dates'} from ${f.date}.`] : [];
  const where = (): string[] => [
    ...(f.place ? [ar ? (me ? `أنا من ${f.place}.` : `المكان: ${f.place}.`) : `${me ? 'I come' : 'It comes'} from ${f.place}.`] : []),
    ...(f.publisher ? [ar ? `الناشر: ${f.publisher}.` : `Publisher: ${f.publisher}.`] : []),
  ];
  const body = (): string[] => [
    ...(f.material ? [ar ? `${me ? 'مادتي' : 'المادة'}: ${end(f.material)}` : `Material: ${end(f.material)}`] : []),
    ...(f.dimensions ? [ar ? `${me ? 'قياساتي' : 'القياسات'}: ${end(f.dimensions)}` : `Size: ${end(f.dimensions)}`] : []),
    ...(f.extent ? [end(f.extent)] : []),
  ];
  const kept = (): string[] => [
    ...(f.holder ? [ar ? `${me ? 'مكان حفظي اليوم' : 'مكان الحفظ'}: ${end(f.holder)}` : `${me ? 'Today I am kept at' : 'It is kept at'} ${end(f.holder)}`] : []),
    ...(f.shelfMark ? [ar ? `رقم الحفظ: ${end(f.shelfMark)}` : `Shelf mark: ${end(f.shelfMark)}`] : []),
  ];
  const story = (): string[] => (f.summary ? sentences(f.summary).map(end) : []);

  if (q === 'intro') {
    const hello = ar ? (me ? `أنا «${f.title}».` : `هذا «${f.title}».`) : me ? `I am “${f.title}”.` : `This is “${f.title}”.`;
    const invite = ar ? (me ? 'اسألني ما تشاء.' : 'اختر سؤالًا لتعرف أكثر.') : me ? 'Ask me anything below.' : 'Choose a question to learn more.';
    return [hello, ...(f.subtitle ? [end(f.subtitle)] : []), ...who(), ...when(), ...story().slice(0, 2), invite];
  }
  const out = { who, when, where, story, body, kept }[q]();
  return out.length ? out : [unknown];
}

const INTENTS: Array<[Exclude<QuestionId, 'intro'>, RegExp]> = [
  ['kept', /تحفظ|محفوظ|موجود|متحف|مكتبة|kept|held|museum|library|located|keep/i],
  ['body', /ماد|مصنوع|صنعت من|حجم|قياس|وزن|طول|made of|material|size|big|tall|dimension|weigh/i],
  ['who', /من صنع|من كتب|من أل|مؤلف|صانع|كاتب|ناسخ|who|author|maker|made|wrote|writer/i],
  ['when', /متى|تاريخ|سنة|عمر|قديم|when|date|old|year|age/i],
  ['where', /أين|مكان|بلد|مدينة|where|from|place|origin|country/i],
  ['story', /قص|موضوع|حدث|ما أنت|من أنت|عن ماذا|story|about|tell|what are you|who are you/i],
];

/** Which set question a spoken or typed question means, if any. */
export function intentOf(text: string): Exclude<QuestionId, 'intro'> | null {
  // Arabic vowel marks (تُحفظ) would hide the keyword (تحفظ).
  const plain = text.replace(/[ً-ْٰ]/g, '');
  return INTENTS.find(([, re]) => re.test(plain))?.[0] ?? null;
}
