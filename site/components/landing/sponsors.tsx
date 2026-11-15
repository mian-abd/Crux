// "Built with our sponsors": which sponsor tools Crux uses, how, one measured fact for each,
// and where the evidence is. Every number is from docs/SUBMISSION.md or a results file.

import { ArrowUpRightIcon } from "lucide-react";

import { repoFile } from "@/lib/site";

const SPONSORS = [
  {
    name: "Exa",
    role: "Search inside the experiment loop",
    how: "A documentation search is one more experiment: it competes with the compute checks on information per cost, and its result can reject an option. In this site, any extracted claim can pull its sources with Exa.",
    fact: "In tools-run-02, three searches ran and one rejected an option at posterior 0.0172.",
    source: "docs/SUBMISSION.md#exa",
  },
  {
    name: "Modal",
    role: "Sandboxes and the cloud evaluation runner",
    how: "Every run's analysis code executes in its own network-blocked sandbox with hashed, read-only inputs. A cloud runner orchestrates, sandboxes and grades whole launches under a spend cap.",
    fact: "52 runs in one launch for $56.93 of a $100 cap, with every run graded in Modal.",
    source: "docs/SUBMISSION.md#modal",
  },
  {
    name: "past.dev",
    role: "Memory shared between agents",
    how: "The referee, experimenter and critic write evidence; the critic reviews the deliverables with the referee's records in its prompt. Each read is logged with its author.",
    fact: "25 recalls in tools-run-02, p95 979 ms. We claim no score gain from memory.",
    source: "docs/SUBMISSION.md#pastdev",
  },
  {
    name: "OpenAI",
    role: "The models",
    how: "gpt-4.1-mini runs the proposers and the predictor, gpt-5.5 writes and runs the analysis and powers the single-agent baseline, and gpt-4.1-mini extracts a paper's claims here.",
    fact: "A swarm run averaged $1.17 against $1.38 for the gpt-5.5 baseline, on a $2 cap each.",
    source: "eval/results/task9_batch04.md",
  },
  {
    name: "Tinker",
    role: "Fine-tuning the outcome predictor",
    how: "A Qwen3-8B LoRA learned to predict each diagnostic's outcome from the engine's own runs, which is what the information-gain ranking needs.",
    fact: "Best calibrated in distribution (log loss 0.472 vs 0.557); on held-out real data the library's rows still win, so they stay the default.",
    source: "docs/SUBMISSION.md#tinker",
  },
  {
    name: "Edison Scientific",
    role: "The benchmark and its grader",
    how: "BixBench3 task 9 is the problem, and Edison's deterministic grader, pinned to one commit and run outside the agents' folders, scores every run.",
    fact: "Grader at commit d0e0bbb scores 9 artifacts per run; failed runs count as 0.",
    source: "eval/results/task9_runs.md",
  },
];

function href(path: string): string {
  const [file, anchor] = path.split("#");
  return anchor ? `${repoFile(file)}#${anchor}` : repoFile(file);
}

export function Sponsors() {
  return (
    <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {SPONSORS.map((s) => (
        <li key={s.name} className="flex flex-col rounded-2xl border bg-card p-7">
          <p className="font-display text-3xl">{s.name}</p>
          <p className="mt-1 text-sm font-medium text-brand">{s.role}</p>
          <p className="mt-4 flex-1 leading-relaxed text-muted-foreground">{s.how}</p>
          <p className="mt-5 border-t pt-4 text-sm leading-relaxed">{s.fact}</p>
          <a
            href={href(s.source)}
            target="_blank"
            rel="noreferrer"
            className="mt-4 inline-flex items-center gap-1 font-mono text-xs text-muted-foreground underline decoration-border underline-offset-4 hover:text-foreground"
          >
            {s.source.split("#")[0]}
            <ArrowUpRightIcon className="size-3" aria-hidden="true" />
          </a>
        </li>
      ))}
    </ul>
  );
}
