import { BustRegions, JAWAHIRI_REGIONS, MUTANABBI_REGIONS, WAILI_REGIONS } from './bustRig';
import { JAWAHIRI, OPENING_CUE, systemInstruction } from './jawahiri';
import { MUTANABBI, MUTANABBI_OPENING_CUE, mutanabbiInstruction } from './mutanabbi';
import { WAILI, WAILI_OPENING_CUE, wailiInstruction } from './waili';

/**
 * The talking characters. One page (src/character) shows whichever the HTML page names in <body data-character>:
 * jawahiri.html → al-Jawahiri, mutanabbi.html → al-Mutanabbi, waili.html → Sheikh Ahmad al-Waili. Each has its own bust (built by
 * scripts/rig-character.mjs), its own face measurements, its own life, works and instructions for the voice.
 */
export interface CharacterDef {
  id: 'jawahiri' | 'mutanabbi' | 'waili';
  nameAr: string;
  nameEn: string;
  /** The line under the name: dates and "AI recreation". */
  datesAr: string;
  datesEn: string;
  /** The first line of the About sheet. */
  aboutAr: string;
  aboutEn: string;
  /** While the bust loads. */
  arrivingAr: string;
  arrivingEn: string;
  model: string;
  regions: BustRegions;
  /** The filmed 4D capture, if there is one. */
  fourD?: string;
  life: Array<{ year: string; ar: string; en: string }>;
  works: string[];
  ids: Array<{ label: string; value: string; url?: string }>;
  instruction: () => string;
  openingCue: string;
  /** His cloned voice (the voice server) is al-Jawahiri's only; others speak with a Gemini voice. */
  clonedVoice: boolean;
  /** The Gemini voice for this character, unless the visitor picked one. */
  geminiVoice?: string;
}

export const CHARACTERS: Record<CharacterDef['id'], CharacterDef> = {
  jawahiri: {
    id: 'jawahiri',
    nameAr: JAWAHIRI.nameAr,
    nameEn: JAWAHIRI.nameEn,
    datesAr: '1899–1997',
    datesEn: '1899–1997',
    aboutAr: `${JAWAHIRI.titleAr}. وُلد في النجف في 26 تموز 1899 وتوفي في دمشق في 27 تموز 1997.`,
    aboutEn: 'Iraq’s great Arab poet. Born in Najaf on 26 July 1899, died in Damascus on 27 July 1997.',
    arrivingAr: 'يحضر الجواهري…',
    arrivingEn: 'Al-Jawahiri is arriving…',
    model: 'characters/jawahiri-mouth.glb',
    regions: JAWAHIRI_REGIONS,
    fourD: 'characters/jawahiri-4d.bin',
    life: JAWAHIRI.life,
    works: JAWAHIRI.works,
    ids: JAWAHIRI.ids,
    instruction: systemInstruction,
    openingCue: OPENING_CUE,
    clonedVoice: true,
  },
  mutanabbi: {
    id: 'mutanabbi',
    nameAr: MUTANABBI.nameAr,
    nameEn: MUTANABBI.nameEn,
    datesAr: MUTANABBI.datesAr,
    datesEn: MUTANABBI.datesEn,
    aboutAr: `${MUTANABBI.fullNameAr}، ${MUTANABBI.titleAr}. وُلد في الكوفة سنة 303 هـ (915 م) وقُتل قرب دير العاقول سنة 354 هـ (965 م).`,
    aboutEn: 'Ahmad ibn al-Husayn al-Kindi, the poet of the Arabs. Born in Kufa in 915, killed near Dayr al-Aqul in 965.',
    arrivingAr: 'يحضر المتنبي…',
    arrivingEn: 'Al-Mutanabbi is arriving…',
    model: 'characters/mutanabbi-mouth.glb',
    regions: MUTANABBI_REGIONS,
    life: MUTANABBI.life,
    works: MUTANABBI.works,
    ids: MUTANABBI.ids,
    instruction: mutanabbiInstruction,
    openingCue: MUTANABBI_OPENING_CUE,
    clonedVoice: false,
    geminiVoice: 'Orus',
  },
  waili: {
    id: 'waili',
    nameAr: WAILI.nameAr,
    nameEn: WAILI.nameEn,
    datesAr: WAILI.datesAr,
    datesEn: WAILI.datesEn,
    aboutAr: `${WAILI.fullNameAr}، ${WAILI.titleAr}. وُلد في النجف سنة 1928 وتوفي في الكاظمية سنة 2003، ودُفن في النجف.`,
    aboutEn: 'Sheikh Dr Ahmad al-Waili, the dean of the Husayni pulpit: preacher, poet and scholar. Born in Najaf in 1928, died in Kadhimiya in 2003, buried in Najaf.',
    arrivingAr: 'يحضر الشيخ الوائلي…',
    arrivingEn: 'Sheikh al-Waili is arriving…',
    model: 'characters/waili-mouth.glb',
    regions: WAILI_REGIONS,
    life: WAILI.life,
    works: WAILI.works,
    ids: WAILI.ids,
    instruction: wailiInstruction,
    openingCue: WAILI_OPENING_CUE,
    clonedVoice: false,
    geminiVoice: 'Gacrux',
  },
};

/** The character this page shows (<body data-character>), al-Jawahiri by default. */
export function pageCharacter(): CharacterDef {
  const id = document.body.dataset.character as CharacterDef['id'] | undefined;
  return CHARACTERS[id ?? 'jawahiri'] ?? CHARACTERS.jawahiri;
}
