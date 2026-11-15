import Link from "next/link";

import { buttonVariants } from "@/components/ui/button";
import { Wordmark } from "@/components/wordmark";

export default function NotFound() {
  return (
    <main id="main" className="flex flex-1 flex-col items-center justify-center gap-6 px-5 py-24 text-center">
      <Wordmark />
      <h1 className="font-display text-5xl">Nothing at this address</h1>
      <p className="max-w-sm text-muted-foreground">
        The page may have moved, or the paper may have been deleted.
      </p>
      <Link href="/" className={buttonVariants({ size: "lg", variant: "outline" })}>
        Back to the start
      </Link>
    </main>
  );
}
