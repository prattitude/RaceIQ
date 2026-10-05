/** Shared Trailbrake cue-plan and reference types (RaceIQ + companion). */

export type TrailbrakeSeverity = "info" | "minor" | "moderate" | "major";

export type TrailbrakeReferencePreference = "analysed-fastest" | "fastest";

export type TrailbrakeHudPosition = "bottom-center" | "top-center";

/** Live modulation phase along a corner approach. */
export type TrailbrakeCuePhase =
  | "approach"
  | "brake-on"
  | "trail"
  | "release"
  | "exit";

export type TrailbrakeSoundPack = "click" | "hat" | "pulse";

export type TrailbrakeCueIntensity = "calm" | "normal" | "urgent";

export interface TrailbrakeCornerCue {
  name: string;
  startFrac: number;
  endFrac: number;
  /** Metres from lap start where brake rises (null if unknown). */
  brakeOnDist: number | null;
  peakBrakeDist: number | null;
  brakeOffDist: number | null;
  /** Optional trail-brake start (defaults to peak when absent). */
  trailStartDist: number | null;
  /** Optional throttle-on / exit mark. */
  throttleOnDist: number | null;
  severity: TrailbrakeSeverity;
  /** Short speakable call, e.g. "Brake T3". */
  callText: string;
  /** One-line coaching tip from analysis or metrics. */
  tipText: string;
}

export interface TrailbrakeCuePlan {
  lapId: number;
  trackLengthM: number | null;
  hasAnalysis: boolean;
  corners: TrailbrakeCornerCue[];
  builtAt: string;
  sourceAnalysisAt: string | null;
}

export interface TrailbrakeReferenceLap {
  lapId: number;
  sessionId: number;
  lapTime: number;
  hasAnalysis: boolean;
  tuneId: number | null;
  gameId: string;
  carOrdinal: number | null;
  trackOrdinal: number | null;
  carId: string | null;
  trackId: string | null;
}

export interface TrailbrakeLiveSample {
  sessionId: number | null;
  distanceTraveled: number;
  speedMps: number;
  brake: number;
  lapNumber: number;
  currentLapTime: number;
  updatedAtUtc: string;
}

export interface TrailbrakeConfig {
  enabled: boolean;
  hudEnabled: boolean;
  voiceEnabled: boolean;
  portableMirror: boolean;
  cueLeadMs: number;
  hudOpacity: number;
  hudScale: number;
  hudPosition: TrailbrakeHudPosition;
  referencePreference: TrailbrakeReferencePreference;
  soundEnabled: boolean;
  soundVolume: number;
  soundPack: TrailbrakeSoundPack;
  modulationEnabled: boolean;
  cueIntensity: TrailbrakeCueIntensity;
}
