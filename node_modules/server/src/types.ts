export type Clue = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radiusMeters: number;
  imagePath: string;
  hint: string; // success message when advancing
  hints?: string[]; // up to three progressive hints for this location (generic)
  hintsPhoto?: string[]; // per-location hints shown when photo validation fails
  hintsAnswer?: string[]; // per-location hints shown when answer validation fails
  nextClueId?: string;
  // New optional validation options
  requirePhoto?: boolean; // default true
  requireQA?: boolean; // default false
  question?: string;
  expectedAnswer?: string;
  validationMode?: 'photo' | 'qa' | 'both' | 'either';
};

export type GameConfig = {
  clues: Clue[];
  startClueId: string;
  wrongImageTips?: string[];
  wrongAnswerTips?: string[];
};

export type TeamProgress = {
  teamId: string;
  currentClueId: string;
  history: string[];
  currentSatisfied?: { photo: boolean; qa: boolean };
  lastLat?: number;
  lastLng?: number;
  hintStep?: number; // 0..2 index into current clue hints (generic)
  hintStepPhoto?: number;
  hintStepAnswer?: number;
};

export type ChatMessage = { role: 'user' | 'bot' | 'system'; text: string; ts: number };
