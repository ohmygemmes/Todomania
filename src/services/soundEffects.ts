/** Local, optional interaction sounds. Never driven by task-store updates. */
const STORAGE_KEY = "idayal:sound-effects:v1";
const CHANGE_EVENT = "idayal:sound-effects-changed";
let enabledInMemory = true;
let storageAvailable = true;
let context: AudioContext | null = null;
let generation = 0;
const voices = new Set<OscillatorNode>();

export type SoundEffect = "complete" | "postpone" | "add" | "tap";

export function soundEffectsEnabled(): boolean {
  if (!storageAvailable) return enabledInMemory;
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    enabledInMemory = saved === null || saved === "true";
  } catch {
    // The toggle still works for this session when storage is unavailable.
    storageAvailable = false;
  }
  return enabledInMemory;
}

function silence() {
  generation += 1;
  for (const voice of voices) {
    try { voice.stop(); } catch { /* Already finished. */ }
  }
  voices.clear();
}

export function setSoundEffectsEnabled(enabled: boolean) {
  enabledInMemory = enabled;
  try { localStorage.setItem(STORAGE_KEY, String(enabled)); } catch { storageAvailable = false; }
  if (!enabled) silence();
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function subscribeSoundEffects(onChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key !== STORAGE_KEY && event.key !== null) return;
    enabledInMemory = event.newValue === null || event.newValue === "true";
    if (!enabledInMemory) silence();
    onChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

function getContext(): AudioContext | null {
  if (!soundEffectsEnabled()) return null;
  try {
    if (!context || context.state === "closed") {
      const Audio = window.AudioContext ??
        (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Audio) return null;
      context = new Audio({ latencyHint: "interactive" });
    }
    return context;
  } catch { return null; }
}

/** Unlock during a gesture, before a card's exit animation completes (iOS). */
export function prepareSoundEffects() {
  const audio = getContext();
  if (audio && audio.state !== "running") void audio.resume().catch(() => {});
}

// Frequency, end frequency, offset, duration. Short sine tones with soft edges.
const NOTES: Record<SoundEffect, Array<[number, number, number, number]>> = {
  complete: [[660, 660, 0, 0.11], [990, 990, 0.075, 0.16]],
  postpone: [[510, 330, 0, 0.18]],
  add: [[740, 880, 0, 0.09]],
  tap: [[460, 400, 0, 0.065]],
};

export function playSoundEffect(effect: SoundEffect) {
  const audio = getContext();
  if (!audio || document.visibilityState === "hidden") return;
  const requestedAt = performance.now();
  const requestedGeneration = generation;
  const play = () => {
    // A blocked browser must not play old sounds when audio resumes later.
    if (!soundEffectsEnabled() || requestedGeneration !== generation ||
        performance.now() - requestedAt > 500 || audio.state !== "running" ||
        document.visibilityState === "hidden") return;
    try {
      silence();
      for (const [frequency, endFrequency, offset, duration] of NOTES[effect]) {
        const oscillator = audio.createOscillator();
        const gain = audio.createGain();
        const start = audio.currentTime + offset;
        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(frequency, start);
        oscillator.frequency.exponentialRampToValueAtTime(endFrequency, start + duration);
        gain.gain.setValueAtTime(0, start);
        gain.gain.linearRampToValueAtTime(0.045, start + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
        oscillator.connect(gain);
        gain.connect(audio.destination);
        voices.add(oscillator);
        oscillator.onended = () => {
          voices.delete(oscillator);
          oscillator.disconnect();
          gain.disconnect();
        };
        oscillator.start(start);
        oscillator.stop(start + duration + 0.01);
      }
    } catch { /* Audio must never interrupt a task action. */ }
  };
  if (audio.state === "running") play();
  else void audio.resume().then(play).catch(() => {});
}
