import Image from "next/image";

import { Wordmark } from "@/components/wordmark";

/** Sign-in and sign-up: the form on paper, a public-domain plate beside it on wide screens. */
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-svh lg:grid-cols-[1fr_1.05fr]">
      <div className="flex flex-col">
        <header className="flex h-[4.5rem] items-center px-5 sm:px-8 lg:px-12">
          <Wordmark />
        </header>
        <main id="main" className="flex flex-1 items-center justify-center px-5 pt-6 pb-24">
          <div className="w-full max-w-sm">{children}</div>
        </main>
      </div>
      <aside className="relative isolate hidden overflow-hidden bg-ink p-4 lg:block">
        <div className="relative h-full overflow-hidden rounded-3xl">
          <Image
            src="/plates/wright-air-pump.jpg"
            alt="Joseph Wright of Derby's painting of an air-pump demonstration, lit by one candle."
            width={1920}
            height={1439}
            priority
            sizes="50vw"
            className="absolute inset-0 size-full object-cover object-[55%_40%]"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-ink/90 via-ink/20 to-transparent" aria-hidden="true" />
          <div className="absolute right-0 bottom-0 left-0 p-10 text-ink-foreground">
            <p className="font-display text-4xl leading-[1.08] xl:text-5xl">Settled by experiment, not by vote.</p>
            <p className="mt-4 max-w-md text-ink-foreground/70">
              On 52 fresh pre-registered cases, the swarm scored 0.817 against 0.671 and caught 48 of 48 planted faults.
            </p>
            <p className="mt-8 text-[0.7rem] text-ink-foreground/50">
              Joseph Wright of Derby, An Experiment on a Bird in the Air Pump (1768). Public domain.
            </p>
          </div>
        </div>
      </aside>
    </div>
  );
}
