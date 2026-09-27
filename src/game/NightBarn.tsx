import { useEffect, useMemo, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import { unlockAudio, setMasterMuted } from "./audio";
import { useGameStore } from "./store";
import type { GameHandle } from "./engine";

export function NightBarn() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const gameRef = useRef<GameHandle | null>(null);
  const phase = useGameStore((s) => s.phase);
  const loaded = useGameStore((s) => s.loaded);
  const muted = useGameStore((s) => s.muted);
  const isTouch = useGameStore((s) => s.isTouch);
  const hitAt = useGameStore((s) => s.hitAt);
  const look = useGameStore((s) => s.look);
  const invertY = useGameStore((s) => s.invertY);
  const shake = useGameStore((s) => s.shake);
  const kills = useGameStore((s) => s.kills);
  const [hitOn, setHitOn] = useState(false);
  const [hint, setHint] = useState(true);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let cancelled = false;
    let handle: GameHandle | null = null;
    import("./engine").then(({ createGame }) => {
      if (cancelled || !canvasRef.current) return;
      return createGame(canvasRef.current).then((g) => {
        if (cancelled) {
          g.dispose();
          return;
        }
        handle = g;
        gameRef.current = g;
      });
    });
    return () => {
      cancelled = true;
      handle?.dispose();
      gameRef.current = null;
    };
  }, []);

  useEffect(() => {
    setMasterMuted(muted);
  }, [muted]);

  useEffect(() => {
    if (!hitAt) return;
    setHitOn(true);
    if (useGameStore.getState().isTouch && typeof navigator.vibrate === "function") {
      navigator.vibrate(15);
    }
    const t = window.setTimeout(() => setHitOn(false), 120);
    return () => window.clearTimeout(t);
  }, [hitAt]);

  useEffect(() => {
    if (phase !== "playing") return;
    setHint(true);
    const t = window.setTimeout(() => setHint(false), 4200);
    return () => window.clearTimeout(t);
  }, [phase]);

  const enter = () => {
    unlockAudio();
    useGameStore.getState().enter();
    gameRef.current?.requestLock();
  };

  const resume = () => {
    unlockAudio();
    useGameStore.getState().resume();
    gameRef.current?.requestLock();
  };

  return (
    <main className="fixed inset-0 overflow-hidden bg-bg text-fg">
      <canvas
        ref={canvasRef}
        className="nv-canvas absolute inset-0 h-full w-full touch-none"
        onContextMenu={(e) => e.preventDefault()}
      />
      <div className="nv-scan pointer-events-none absolute inset-0 opacity-25 mix-blend-multiply" />
      <div className="nv-scope pointer-events-none absolute inset-0" />
      <GrainOverlay />

      <ScopeReticle visible={phase === "playing"} hot={hitOn} />

      {phase === "playing" && (
        <p className="pointer-events-none absolute left-[max(1rem,env(safe-area-inset-left))] top-[max(1rem,env(safe-area-inset-top))] font-display text-3xl tracking-[0.12em] text-primary tabular-nums">
          {kills}
        </p>
      )}

      {phase === "playing" && hint && !isTouch && (
        <p className="pointer-events-none absolute bottom-8 left-1/2 -translate-x-1/2 font-sans text-xs tracking-[0.22em] text-muted uppercase">
          Space steadies · Esc pauses
        </p>
      )}

      {phase === "playing" && isTouch && (
        <button
          type="button"
          className="absolute top-[max(0.85rem,env(safe-area-inset-top))] right-[max(0.85rem,env(safe-area-inset-right))] z-10 min-h-11 rounded-sm border border-border bg-surface/80 px-4 font-sans text-[0.65rem] tracking-[0.2em] text-muted uppercase"
          onClick={() => useGameStore.getState().pause()}
        >
          Pause
        </button>
      )}

      {phase === "playing" && isTouch && (
        <TouchControls
          onJoy={(x, y) => gameRef.current?.setJoy(x, y)}
          onFire={() => gameRef.current?.fire()}
          onZoom={(v) => gameRef.current?.setZoom(v)}
          onHold={(v) => gameRef.current?.setHold(v)}
        />
      )}

      {(phase === "title" || phase === "paused") && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-gradient-to-b from-bg/55 via-bg/20 to-bg/70 px-6">
          <div className="flex max-h-[100dvh] w-full max-w-md flex-col items-center overflow-y-auto py-8 text-center">
            <p className="motion-rise font-sans text-[0.7rem] tracking-[0.42em] text-muted uppercase">
              Night vision
            </p>
            <h1
              className="motion-rise mt-3 font-display text-[clamp(3.2rem,14vw,6.4rem)] font-semibold leading-[0.86] tracking-[0.14em] text-primary"
              style={{ animationDelay: "40ms" }}
            >
              NIGHT
              <br />
              BARN
            </h1>
            <p
              className="motion-rise mt-6 max-w-sm font-sans text-sm leading-relaxed text-fg/85"
              style={{ animationDelay: "90ms" }}
            >
              A dark barn full of unaware mice. No fail. Just the scope.
              <br />
              <span className="text-primary/90">They freeze in the light — take the shot.</span>
            </p>
            <p
              className="motion-rise mt-3 font-display text-2xl tracking-[0.16em] text-primary tabular-nums"
              style={{ animationDelay: "110ms" }}
            >
              {kills} taken
            </p>

            <div
              className="motion-rise mt-8 flex w-full flex-col items-center gap-3"
              style={{ animationDelay: "140ms" }}
            >
              <button
                type="button"
                onClick={phase === "paused" ? resume : enter}
                disabled={!loaded}
                className="min-h-12 w-full max-w-xs rounded-md border border-primary/45 bg-primary/10 px-8 py-3 font-display text-xl tracking-[0.22em] text-primary uppercase transition-colors duration-[var(--motion-fast,250ms)] hover:bg-primary/20 disabled:opacity-40"
              >
                {!loaded ? "Calibrating scope" : phase === "paused" ? "Resume" : "Enter the barn"}
              </button>
              <button
                type="button"
                onClick={() => useGameStore.getState().toggleMute()}
                className="inline-flex min-h-11 items-center gap-2 rounded-sm px-3 py-2 font-sans text-xs tracking-[0.18em] text-muted uppercase hover:text-fg"
              >
                {muted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
                {muted ? "Sound off" : "Sound on"}
              </button>
            </div>

            <dl
              className="motion-rise mt-10 grid w-full max-w-sm grid-cols-2 gap-x-6 gap-y-2 text-left font-sans text-[0.7rem] tracking-[0.08em] text-muted"
              style={{ animationDelay: "200ms" }}
            >
              <dt className="text-fg/70">Look</dt>
              <dd>{isTouch ? "Drag right side" : "Mouse"}</dd>
              <dt className="text-fg/70">Move</dt>
              <dd>{isTouch ? "Left stick" : "WASD"}</dd>
              <dt className="text-fg/70">Fire</dt>
              <dd>{isTouch ? "Hold Fire" : "Click"}</dd>
              <dt className="text-fg/70">Zoom</dt>
              <dd>{isTouch ? "Hold Zoom" : "Right mouse"}</dd>
              <dt className="text-fg/70">Steady</dt>
              <dd>{isTouch ? "Hold Steady" : "Space"}</dd>
            </dl>

            <ScopeSettings look={look} invertY={invertY} shake={shake} />
          </div>
        </div>
      )}
    </main>
  );
}

/** Cheap film grain: a static noise tile whose position jumps in steps.
 *  Replaces the SVG feTurbulence filter, which re-renders every frame. */
function GrainOverlay() {
  const url = useMemo(() => {
    const s = 128;
    const cnv = document.createElement("canvas");
    cnv.width = cnv.height = s;
    const g = cnv.getContext("2d")!;
    const img = g.createImageData(s, s);
    for (let i = 0; i < img.data.length; i += 4) {
      const v = (Math.random() * 255) | 0;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    return cnv.toDataURL();
  }, []);
  return (
    <div
      aria-hidden
      className="nv-grain pointer-events-none absolute inset-0 mix-blend-overlay"
      style={{ backgroundImage: `url(${url})` }}
    />
  );
}

function ScopeReticle({ visible, hot }: { visible: boolean; hot: boolean }) {
  if (!visible) return null;
  const c = hot ? "text-fg" : "text-primary/80";
  return (
    <svg
      className={`pointer-events-none absolute inset-0 h-full w-full ${c}`}
      viewBox="0 0 100 100"
      preserveAspectRatio="xMidYMid meet"
      aria-hidden
    >
      <g fill="none" stroke="currentColor" strokeWidth="0.22">
        <circle cx="50" cy="50" r="11.5" opacity="0.45" />
        <line x1="50" y1="38" x2="50" y2="46.6" />
        <line x1="50" y1="53.4" x2="50" y2="62" />
        <line x1="38" y1="50" x2="46.6" y2="50" />
        <line x1="53.4" y1="50" x2="62" y2="50" />
        <line x1="48.4" y1="42" x2="51.6" y2="42" />
        <line x1="48.4" y1="58" x2="51.6" y2="58" />
        <line x1="42" y1="48.4" x2="42" y2="51.6" />
        <line x1="58" y1="48.4" x2="58" y2="51.6" />
      </g>
      <circle cx="50" cy="50" r="0.55" fill="currentColor" />
    </svg>
  );
}

function ScopeSettings({
  look,
  invertY,
  shake,
}: {
  look: number;
  invertY: boolean;
  shake: boolean;
}) {
  return (
    <div
      className="motion-rise mt-8 w-full max-w-sm space-y-3 border-t border-border pt-6 text-left"
      style={{ animationDelay: "240ms" }}
    >
      <label className="flex items-center justify-between gap-4 font-sans text-[0.7rem] tracking-[0.12em] text-muted uppercase">
        Look speed
        <input
          type="range"
          min={0.4}
          max={2}
          step={0.05}
          value={look}
          aria-label="Look speed"
          className="h-2 w-36 cursor-pointer accent-primary"
          onChange={(e) => useGameStore.getState().setLook(Number(e.target.value))}
        />
      </label>
      <button
        type="button"
        className="flex min-h-11 w-full items-center justify-between rounded-sm px-0 font-sans text-[0.7rem] tracking-[0.12em] text-muted uppercase hover:text-fg"
        onClick={() => useGameStore.getState().setInvertY(!invertY)}
      >
        Invert Y<span className="text-fg/80">{invertY ? "On" : "Off"}</span>
      </button>
      <button
        type="button"
        className="flex min-h-11 w-full items-center justify-between rounded-sm px-0 font-sans text-[0.7rem] tracking-[0.12em] text-muted uppercase hover:text-fg"
        onClick={() => useGameStore.getState().setShake(!shake)}
      >
        Recoil shake
        <span className="text-fg/80">{shake ? "On" : "Off"}</span>
      </button>
    </div>
  );
}

function TouchControls({
  onJoy,
  onFire,
  onZoom,
  onHold,
}: {
  onJoy: (x: number, y: number) => void;
  onFire: () => void;
  onZoom: (v: boolean) => void;
  onHold: (v: boolean) => void;
}) {
  const padRef = useRef<HTMLDivElement>(null);
  const [knob, setKnob] = useState({ x: 0, y: 0 });
  const fireHold = useRef<number | null>(null);

  const setFromEvent = (clientX: number, clientY: number) => {
    const el = padRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const cx = r.left + r.width / 2;
    const cy = r.top + r.height / 2;
    let dx = (clientX - cx) / (r.width * 0.42);
    let dy = (clientY - cy) / (r.height * 0.42);
    const len = Math.hypot(dx, dy);
    if (len > 1) {
      dx /= len;
      dy /= len;
    }
    setKnob({ x: dx, y: dy });
    onJoy(dx, -dy);
  };

  return (
    <>
      <div
        ref={padRef}
        className="absolute bottom-[max(1.5rem,env(safe-area-inset-bottom))] left-[max(1.25rem,env(safe-area-inset-left))] size-[120px] rounded-full border border-primary/25 bg-fg/5"
        style={{ touchAction: "none" }}
        onPointerDown={(e) => {
          (e.currentTarget as HTMLDivElement).setPointerCapture(e.pointerId);
          setFromEvent(e.clientX, e.clientY);
        }}
        onPointerMove={(e) => {
          if (e.buttons) setFromEvent(e.clientX, e.clientY);
        }}
        onPointerUp={() => {
          setKnob({ x: 0, y: 0 });
          onJoy(0, 0);
        }}
        onPointerCancel={() => {
          setKnob({ x: 0, y: 0 });
          onJoy(0, 0);
        }}
      >
        <div
          className="absolute left-1/2 top-1/2 size-11 -translate-x-1/2 -translate-y-1/2 rounded-full border border-primary/50 bg-primary/20"
          style={{
            transform: `translate(calc(-50% + ${knob.x * 34}px), calc(-50% + ${knob.y * 34}px))`,
          }}
        />
      </div>
      <button
        type="button"
        className="absolute bottom-[max(1.5rem,env(safe-area-inset-bottom))] right-[max(1.25rem,env(safe-area-inset-right))] size-[72px] rounded-full border border-primary/50 bg-primary/15 font-display text-sm tracking-[0.18em] text-primary uppercase"
        style={{ touchAction: "none" }}
        onPointerDown={(e) => {
          e.preventDefault();
          onFire();
          if (fireHold.current) window.clearInterval(fireHold.current);
          fireHold.current = window.setInterval(onFire, 1100);
        }}
        onPointerUp={() => {
          if (fireHold.current) window.clearInterval(fireHold.current);
          fireHold.current = null;
        }}
        onPointerCancel={() => {
          if (fireHold.current) window.clearInterval(fireHold.current);
          fireHold.current = null;
        }}
      >
        Fire
      </button>
      <button
        type="button"
        className="absolute bottom-[max(7.5rem,calc(env(safe-area-inset-bottom)+6.5rem))] right-[max(1.5rem,env(safe-area-inset-right))] min-h-11 rounded-full border border-border bg-surface/80 px-4 font-sans text-[0.65rem] tracking-[0.2em] text-muted uppercase"
        style={{ touchAction: "none" }}
        onPointerDown={() => onZoom(true)}
        onPointerUp={() => onZoom(false)}
        onPointerCancel={() => onZoom(false)}
      >
        Zoom
      </button>
      <button
        type="button"
        className="absolute bottom-[max(10.6rem,calc(env(safe-area-inset-bottom)+9.6rem))] right-[max(1.5rem,env(safe-area-inset-right))] min-h-11 rounded-full border border-primary/40 bg-primary/10 px-4 font-sans text-[0.65rem] tracking-[0.2em] text-primary uppercase"
        style={{ touchAction: "none" }}
        onPointerDown={() => onHold(true)}
        onPointerUp={() => onHold(false)}
        onPointerCancel={() => onHold(false)}
      >
        Steady
      </button>
    </>
  );
}
