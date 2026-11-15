"use client";

// A Galton board: 400 seeded balls through 12 rows of pegs into 13 bins, with
// the binomial expectation drawn over the bins. It plays once when it scrolls
// into view; Replay drops a fresh batch from the next seed. Under
// prefers-reduced-motion (and before hydration) it shows the final histogram.

import { useEffect, useMemo, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { binomialExpected, countsAfter, histogramStats, simulateGalton } from "@/lib/explore/galton";

import { FigureCard, Legend, LegendItem, Readout, SourceLink, Swatch, fmt } from "./figure-parts";
import { useHydrated, useReducedMotion } from "./use-motion";

const ROWS = 12;
const BALLS = 400;
const FIRST_SEED = 1;

// Geometry, in viewBox units.
const W = 520;
const CX = W / 2;
const DX = 36; // peg spacing = bin width
const DY = 17;
const TOP = 26; // first peg row
const PEG_R = 1.9;
const BALL_R = 2.1;
const PITCH = 4.6; // spacing of stacked balls
const PER_ROW = 7;
const BIN_TOP = TOP + (ROWS - 1) * DY + 20;
const FLOOR = BIN_TOP + 98;
const H = FLOOR + 24;

// Timing, in milliseconds.
const INTERVAL = 15; // between releases
const SEG = 85; // per peg row
const FALL = (ROWS + 2) * SEG; // entry + one hop per row + the drop
const END = (BALLS - 1) * INTERVAL + FALL;

const binCenter = (k: number) => CX + (k - ROWS / 2) * DX;
const restY = (level: number) => TOP + level * DY - PEG_R - BALL_R;

function stackPos(bin: number, n: number): [number, number] {
  const col = n % PER_ROW;
  const row = Math.floor(n / PER_ROW);
  const left = binCenter(bin) - (PER_ROW * PITCH) / 2;
  return [left + PITCH / 2 + col * PITCH, Math.max(BIN_TOP + BALL_R, FLOOR - PITCH / 2 - row * PITCH)];
}

/** Circles as one path, so hundreds of balls are a single DOM node. */
function circles(points: [number, number][], r: number): string {
  let d = "";
  for (const [x, y] of points) d += `M${(x - r).toFixed(2)} ${y.toFixed(2)}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;
  return d;
}

const PEGS = (() => {
  const pts: [number, number][] = [];
  for (let j = 0; j < ROWS; j++) for (let i = 0; i <= j; i++) pts.push([CX + (i - j / 2) * DX, TOP + j * DY]);
  return circles(pts, PEG_R);
})();

const smooth = (f: number) => f * f * (3 - 2 * f);

export function GaltonBoard() {
  const hydrated = useHydrated();
  const reduced = useReducedMotion();
  const animate = hydrated && !reduced;

  const [seed, setSeed] = useState(FIRST_SEED);
  const [started, setStarted] = useState(false);
  const [clock, setClock] = useState(0);
  const frameRef = useRef<HTMLDivElement>(null);

  const run = useMemo(() => simulateGalton(seed, ROWS, BALLS), [seed]);
  const expected = useMemo(() => binomialExpected(ROWS, BALLS), []);
  // Each ball's level-by-level x position and its final resting place.
  const track = useMemo(
    () =>
      run.steps.map((path, i) => {
        const xs = [CX];
        let rights = 0;
        for (let j = 0; j < ROWS; j++) {
          rights += path[j];
          xs.push(CX + (rights - (j + 1) / 2) * DX);
        }
        return { xs, rest: stackPos(run.bin[i], run.stack[i]) };
      }),
    [run],
  );

  // Start the first drop when the board scrolls into view.
  useEffect(() => {
    if (!animate || started) return;
    const el = frameRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setStarted(true);
          io.disconnect();
        }
      },
      { threshold: 0.35 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [animate, started]);

  // The animation clock.
  useEffect(() => {
    if (!animate || !started) return;
    const t0 = performance.now();
    let raf = requestAnimationFrame(function tick(now) {
      const t = now - t0;
      setClock(Math.min(t, END));
      if (t < END) raf = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(raf);
  }, [animate, started, seed]);

  const t = animate ? (started ? clock : 0) : END;
  const landed = Math.max(0, Math.min(BALLS, Math.floor((t - FALL) / INTERVAL) + 1));
  const released = Math.max(0, Math.min(BALLS, Math.floor(t / INTERVAL) + 1));

  const landedPath = useMemo(() => circles(track.slice(0, landed).map((b) => b.rest), BALL_R), [track, landed]);

  const flying: [number, number][] = [];
  for (let i = landed; i < released; i++) {
    const s = (t - i * INTERVAL) / SEG; // segments since release
    const seg = Math.floor(s);
    const f = s - seg;
    const { xs, rest } = track[i];
    if (seg === 0) {
      flying.push([CX, 4 + (restY(0) - 4) * f * f]);
    } else if (seg <= ROWS) {
      const L = seg - 1;
      const x = xs[L] + (xs[L + 1] - xs[L]) * smooth(f);
      const y = restY(L) - 5 * Math.sin(Math.PI * f) * (1 - f) + DY * f * f;
      flying.push([x, y]);
    } else {
      const x0 = xs[ROWS];
      const y0 = restY(ROWS);
      flying.push([x0 + (rest[0] - x0) * f, y0 + (rest[1] - y0) * f * f]);
    }
  }

  const counts = landed === BALLS ? run.counts : countsAfter(run, landed);
  const stats = histogramStats(counts);

  // Binomial expectation as a step outline over the bins, in stacked-ball height.
  const expPath = expected
    .map((e, k) => {
      const y = (FLOOR - (e / PER_ROW) * PITCH).toFixed(2);
      const x0 = (binCenter(k) - DX / 2).toFixed(2);
      const x1 = (binCenter(k) + DX / 2).toFixed(2);
      return `${k === 0 ? "M" : "L"}${x0} ${y}H${x1}`;
    })
    .join("");

  const replay = () => {
    setSeed((s) => s + 1);
    setClock(0);
    setStarted(true);
  };

  const done = landed === BALLS;

  return (
    <FigureCard
      eyebrow="In-browser simulation"
      title="Coin flips pile into a bell."
      caption={
        <>
          Each ball meets 12 pegs and goes left or right with probability one half, so its bin is
          the number of rights: a Binomial(12, ½) count. The red step is the expected count,
          400 · C(12, k) / 2¹². Seeded, so seed {seed} always gives this histogram. The maths is in{" "}
          <SourceLink path="site/lib/explore/galton.ts" />.
        </>
      }
    >
      <div ref={frameRef}>
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full text-foreground"
          role="img"
          aria-label={`Galton board, ${ROWS} rows, ${BALLS} balls, seed ${seed}. Bin counts from 0 to 12 rights: ${run.counts.join(", ")}.`}
        >
          <path d={PEGS} fill="var(--chart-5)" />
          {/* Bin walls and floor. */}
          <g stroke="var(--chart-5)" strokeWidth="0.75" strokeOpacity="0.7">
            {Array.from({ length: ROWS + 2 }, (_, k) => {
              const x = binCenter(k) - DX / 2;
              return <line key={k} x1={x} y1={BIN_TOP} x2={x} y2={FLOOR} />;
            })}
          </g>
          <line x1={binCenter(0) - DX / 2} y1={FLOOR} x2={binCenter(ROWS) + DX / 2} y2={FLOOR} stroke="currentColor" strokeWidth="1" />
          <path d={landedPath} fill="currentColor" fillOpacity="0.82" />
          <path d={circles(flying, BALL_R)} fill="currentColor" />
          <path d={expPath} fill="none" stroke="var(--chart-2)" strokeWidth="1.5" strokeLinejoin="round" />
          <g className="font-mono" fontSize="12" fill="var(--chart-5)" textAnchor="middle">
            {Array.from({ length: ROWS + 1 }, (_, k) =>
              k % 2 === 0 ? (
                <text key={k} x={binCenter(k)} y={FLOOR + 16}>
                  {k}
                </text>
              ) : null,
            )}
          </g>
        </svg>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-3">
        <Legend>
          <LegendItem>
            <Swatch color="currentColor" kind="dot" /> ball
          </LegendItem>
          <LegendItem>
            <Swatch color="var(--chart-2)" /> binomial expectation
          </LegendItem>
        </Legend>
        <Button variant="outline" size="sm" onClick={replay} aria-label={`Replay with seed ${seed + 1}`}>
          Replay
        </Button>
      </div>

      <dl className="mt-5 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
        <Readout label="Landed" value={`${landed} / ${BALLS}`} />
        <Readout label="Mean bin" value={stats.n ? fmt(stats.mean, 2) : "–"} note="expect 6" />
        <Readout label="SD" value={stats.n ? fmt(stats.sd, 2) : "–"} note={`expect ${fmt(Math.sqrt(3), 2)}`} />
        <Readout label="Seed" value={seed} />
      </dl>
      <p className="sr-only" aria-live="polite">
        {done ? `All ${BALLS} balls landed. Mean bin ${fmt(stats.mean, 2)}, standard deviation ${fmt(stats.sd, 2)}.` : ""}
      </p>
    </FigureCard>
  );
}
