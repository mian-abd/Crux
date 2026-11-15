"use client";

import { Loader2Icon, SparklesIcon, Trash2Icon } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";

import { deletePaperAction, extractClaimsAction } from "@/app/app/actions";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

export function ExtractButton({
  paperId,
  disabled,
  again,
}: {
  paperId: string;
  disabled?: boolean;
  again?: boolean;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();

  function run() {
    start(async () => {
      const result = await extractClaimsAction(paperId);
      if (result.ok) toast.success("Claims extracted.");
      else toast.error(result.error ?? "Extraction failed.");
      router.refresh();
    });
  }

  return (
    <Button size="lg" variant={again ? "outline" : "default"} onClick={run} disabled={disabled || pending}>
      {pending ? (
        <Loader2Icon className="animate-spin" data-icon="inline-start" />
      ) : (
        <SparklesIcon data-icon="inline-start" />
      )}
      {pending ? "Reading the paper…" : again ? "Extract again" : "Extract claims"}
    </Button>
  );
}

export function DeletePaperButton({ paperId, name }: { paperId: string; name: string }) {
  const [pending, start] = useTransition();
  return (
    <Dialog>
      <DialogTrigger
        render={
          <Button size="lg" variant="ghost" aria-label="Delete this paper">
            <Trash2Icon data-icon="inline-start" />
            Delete
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete this paper?</DialogTitle>
          <DialogDescription>
            “{name}” and its extracted claims will be removed from this server. This can&apos;t be
            undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button variant="outline">Keep it</Button>} />
          <Button
            variant="destructive"
            disabled={pending}
            onClick={() => start(() => deletePaperAction(paperId))}
          >
            {pending ? "Deleting…" : "Delete paper"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
