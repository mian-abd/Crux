"use client";

import { useRef } from "react";

import { AnimatedBeam } from "@/components/ui/animated-beam";

const STEPS = [
  {
    title: "Propose",
    body: "Several proposer agents read the study's data and reported analysis, and raise competing options for each open question.",
  },
  {
    title: "Rank",
    body: "Each option predicts what a cheap diagnostic should show. Diagnostics are ranked by expected information per dollar.",
  },
  {
    title: "Run",
    body: "The top diagnostic runs in a sandbox with the network blocked. Its log streams as it runs.",
  },
  {
    title: "Referee",
    body: "A blind referee checks that the result is valid before it is allowed to count.",
  },
  {
    title: "Update",
    body: "Beliefs move by Bayes' rule, and only on a valid result. Then the loop picks the next diagnostic.",
  },
] as const;

const BEAM = {
  pathColor: "currentColor",
  pathWidth: 1,
  pathOpacity: 0.18,
  gradientStartColor: "var(--brand)",
  gradientStopColor: "var(--brand)",
  duration: 5,
} as const;

function Step({
  index,
  nodeRef,
}: {
  index: number;
  nodeRef: React.RefObject<HTMLDivElement | null>;
}) {
  const step = STEPS[index];
  return (
    <li className="flex gap-5 md:block">
      <div
        ref={nodeRef}
        className="relative z-10 flex size-12 shrink-0 items-center justify-center rounded-full border bg-background font-display text-xl md:mb-6"
      >
        {index + 1}
      </div>
      <div>
        <h3 className="text-base font-medium">{step.title}</h3>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{step.body}</p>
      </div>
    </li>
  );
}

export function Loop() {
  const container = useRef<HTMLDivElement>(null);
  const n0 = useRef<HTMLDivElement>(null);
  const n1 = useRef<HTMLDivElement>(null);
  const n2 = useRef<HTMLDivElement>(null);
  const n3 = useRef<HTMLDivElement>(null);
  const n4 = useRef<HTMLDivElement>(null);

  return (
    <div>
      <div ref={container} className="relative">
        <ol className="grid gap-8 md:grid-cols-5 md:gap-6">
          <Step index={0} nodeRef={n0} />
          <Step index={1} nodeRef={n1} />
          <Step index={2} nodeRef={n2} />
          <Step index={3} nodeRef={n3} />
          <Step index={4} nodeRef={n4} />
        </ol>
        <div aria-hidden="true" className="hidden md:block">
          <AnimatedBeam containerRef={container} fromRef={n0} toRef={n1} {...BEAM} delay={0} />
          <AnimatedBeam containerRef={container} fromRef={n1} toRef={n2} {...BEAM} delay={0.6} />
          <AnimatedBeam containerRef={container} fromRef={n2} toRef={n3} {...BEAM} delay={1.2} />
          <AnimatedBeam containerRef={container} fromRef={n3} toRef={n4} {...BEAM} delay={1.8} />
        </div>
      </div>

      <div className="mt-12 grid gap-6 border-t pt-8 md:grid-cols-[auto_1fr] md:gap-10">
        <p className="eyebrow pt-1">What comes out</p>
        <div className="grid gap-6 sm:grid-cols-2">
          <div>
            <h3 className="text-base font-medium">The rejected ledger</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              Every option that lost stays on record with the evidence that rejected it.
            </p>
          </div>
          <div>
            <h3 className="text-base font-medium">Unresolved, said plainly</h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
              A question settles only on evidence. If no diagnostic can separate the options, it is
              reported as unresolved.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
