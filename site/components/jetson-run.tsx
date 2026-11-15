// One Letter on the Jetson (DU-53): one recorded live run, r-20261115-094906-76e7. A muted
// screen recording of the run viewer during the run, and the same run replayed from its event
// log (web/public/fixtures/demo_oneletter_live.jsonl) in the viewer. Every number below is
// read from that event log. Shown on the public /runs page; the Explore page links here.

import { ArrowUpRightIcon } from "lucide-react";

import { repoFile, viewerFixture } from "@/lib/site";

const RUN_ID = "r-20261115-094906-76e7";
const EVENT_LOG = "web/public/fixtures/demo_oneletter_live.jsonl";
const REPLAY = viewerFixture("demo_oneletter_live", 1);

const TIMELINE = [
  { at: "0.1 s", text: "The camera reads window 3 of the strip: GTGGAGAAG." },
  { at: "1.2 s", text: "A second read agrees." },
  {
    at: "6.0 s",
    text: "Settled on HbS (sickle), posterior 0.97. The Jetson's own model writes the verdict.",
  },
  {
    at: "20.7 s",
    text: "The strip has been swapped. Window 3 now reads AAGGAGAAG, which no hypothesis predicts, so Crux raises a surprise.",
  },
  { at: "21.9 s", text: "A repeat read gives the same letters, so it is not a camera misread." },
  { at: "25.8 s", text: "Matched to HbC in the variant library, posterior 0.97, and saved as a lesson." },
] as const;

export function JetsonRun() {
  return (
    <div className="space-y-8">
      <div className="grid gap-x-12 gap-y-8 lg:grid-cols-[1.6fr_1fr] lg:items-start">
        <figure className="overflow-hidden rounded-2xl border bg-card">
          <video
            className="block h-auto w-full bg-black"
            src="/media/one-letter-jetson.mp4"
            width={1920}
            height={1058}
            controls
            muted
            playsInline
            preload="metadata"
            aria-describedby="jetson-run-caption"
          />
          <figcaption id="jetson-run-caption" className="px-5 py-4 text-sm leading-relaxed text-muted-foreground">
            Screen recording of the run viewer during the live run, 27 seconds, no sound. The reads come
            from the Jetson&apos;s USB camera pointed at a phone that shows the strip.
          </figcaption>
        </figure>

        <div>
          <ol className="divide-y border-y">
            {TIMELINE.map((step) => (
              <li key={step.at} className="grid grid-cols-[4.5rem_1fr] gap-4 py-3 text-sm leading-relaxed">
                <span className="font-mono text-xs text-muted-foreground tabular-nums">{step.at}</span>
                <span>{step.text}</span>
              </li>
            ))}
          </ol>
          <p className="mt-5 text-sm leading-relaxed text-muted-foreground">
            Both verdict sentences were written on the Jetson by qwen2.5:3b, running locally, and both
            passed the engine&apos;s fact check before they were shown.
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border bg-card">
        <iframe
          src={REPLAY}
          title="One Letter live run, replayed from its event log"
          loading="lazy"
          className="block h-[min(78svh,56rem)] min-h-[34rem] w-full"
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
        <p className="max-w-3xl">
          The same run, replayed in real time from its event log. The log leaves out the camera stream.
          One recorded run, before the rig was calibrated. The strip is the start of the HBB gene shown on a
          phone screen, not a patient sample.
        </p>
        <div className="flex flex-wrap items-center gap-4">
          <a
            href={repoFile(EVENT_LOG)}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 underline decoration-border underline-offset-4 hover:text-foreground"
          >
            Event log <span className="font-mono text-xs">{RUN_ID}</span>
            <ArrowUpRightIcon className="size-3.5" aria-hidden="true" />
          </a>
          <a
            href={REPLAY}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 underline decoration-border underline-offset-4 hover:text-foreground"
          >
            Open full screen
            <ArrowUpRightIcon className="size-3.5" aria-hidden="true" />
          </a>
        </div>
      </div>
    </div>
  );
}
