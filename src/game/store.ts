import { create } from "zustand";

export type Phase = "title" | "playing" | "paused";

type GameState = {
  phase: Phase;
  muted: boolean;
  loaded: boolean;
  hitAt: number;
  isTouch: boolean;
  look: number;
  invertY: boolean;
  shake: boolean;
  kills: number;
  setLoaded: (v: boolean) => void;
  setTouch: (v: boolean) => void;
  enter: () => void;
  pause: () => void;
  resume: () => void;
  toggleMute: () => void;
  setMuted: (v: boolean) => void;
  setLook: (v: number) => void;
  setInvertY: (v: boolean) => void;
  setShake: (v: boolean) => void;
  addKill: () => void;
  pulseHit: () => void;
};

const SETTINGS_KEY = "nightbarn-settings";

type Saved = {
  muted?: boolean;
  look?: number;
  invertY?: boolean;
  shake?: boolean;
  kills?: number;
};

function readSaved(): Saved {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(SETTINGS_KEY);
    if (!raw) {
      return { muted: window.localStorage.getItem("nightbarn-muted") === "1" };
    }
    return JSON.parse(raw) as Saved;
  } catch {
    return {};
  }
}

function writeSaved(s: Pick<GameState, "muted" | "look" | "invertY" | "shake" | "kills">) {
  try {
    window.localStorage.setItem(
      SETTINGS_KEY,
      JSON.stringify({
        muted: s.muted,
        look: s.look,
        invertY: s.invertY,
        shake: s.shake,
        kills: s.kills,
      }),
    );
  } catch {
    /* ignore */
  }
}

const saved = readSaved();

export const useGameStore = create<GameState>((set, get) => ({
  phase: "title",
  muted: saved.muted ?? false,
  loaded: false,
  hitAt: 0,
  isTouch: false,
  look: typeof saved.look === "number" ? Math.min(2, Math.max(0.4, saved.look)) : 1,
  invertY: saved.invertY ?? false,
  shake: saved.shake ?? true,
  kills: typeof saved.kills === "number" && saved.kills >= 0 ? Math.floor(saved.kills) : 0,
  setLoaded: (v) => set({ loaded: v }),
  setTouch: (v) => set({ isTouch: v }),
  enter: () => set({ phase: "playing" }),
  pause: () => {
    if (get().phase === "playing") set({ phase: "paused" });
  },
  resume: () => set({ phase: "playing" }),
  toggleMute: () => {
    const next = { ...get(), muted: !get().muted };
    writeSaved(next);
    set({ muted: next.muted });
  },
  setMuted: (v) => {
    writeSaved({ ...get(), muted: v });
    set({ muted: v });
  },
  setLook: (v) => {
    const look = Math.min(2, Math.max(0.4, v));
    writeSaved({ ...get(), look });
    set({ look });
  },
  setInvertY: (v) => {
    writeSaved({ ...get(), invertY: v });
    set({ invertY: v });
  },
  setShake: (v) => {
    writeSaved({ ...get(), shake: v });
    set({ shake: v });
  },
  addKill: () => {
    const kills = get().kills + 1;
    writeSaved({ ...get(), kills });
    set({ kills });
  },
  pulseHit: () => set({ hitAt: performance.now() }),
}));
