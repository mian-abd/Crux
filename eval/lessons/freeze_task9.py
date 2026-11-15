"""Freeze the reviewed Task 9 lessons into a content-addressed corpus.

    uv run python -m eval.lessons.freeze_task9 eval/lessons/task9-dev-candidates.json \
        --out runs/frozen-lessons

Run this after a person has reviewed the candidates. It keeps the candidates whose
``lesson`` is approved (``approved`` true, ``reviewed_by`` and a timezone-aware
``reviewed_at`` filled in), validates each as a ``ReviewedLesson``, declares the held-out
cohort (by default the nine Task 9 cases that are not development cases) and saves a
``FrozenLessons`` corpus. It prints the saved file and its SHA-256; pass that file to
``eval.run_task9_arms --lessons``. Nothing is approved here: unapproved candidates are
left out and listed, and a file with no approved lesson is refused.
"""

from __future__ import annotations

import argparse
import json
import sys
from datetime import UTC, datetime
from pathlib import Path

from memory.lessons import FrozenLessons, ReviewedLesson

TASK9_CASES = tuple(f"case-{i:02d}" for i in range(1, 14))
DEV_CASES = ("case-05", "case-06", "case-09", "case-12")
HELD_OUT = tuple(case for case in TASK9_CASES if case not in DEV_CASES)


def approved_lessons(document: dict) -> tuple[list[ReviewedLesson], list[str]]:
    """The approved candidates as ``ReviewedLesson`` and the ids of the others."""
    approved, skipped = [], []
    for candidate in document["candidates"]:
        lesson = candidate["lesson"]
        if lesson.get("approved") is True:
            approved.append(ReviewedLesson.model_validate(lesson))
        else:
            skipped.append(str(lesson.get("id", "?")))
    return approved, skipped


def freeze(
    candidates: Path,
    out: Path,
    held_out: tuple[str, ...] = HELD_OUT,
    frozen_at: datetime | None = None,
) -> tuple[Path, FrozenLessons, list[str]]:
    """Save the approved lessons as a frozen corpus; returns its path, the corpus and skips."""
    document = json.loads(Path(candidates).read_text(encoding="utf-8"))
    lessons, skipped = approved_lessons(document)
    if not lessons:
        raise ValueError(
            f"No approved lessons in {candidates}: set approved, reviewed_by and "
            "reviewed_at on the candidates you accept"
        )
    corpus = FrozenLessons(
        frozen_at=frozen_at or datetime.now(UTC),
        held_out_case_ids=tuple(held_out),
        lessons=tuple(lessons),
    )
    return corpus.save(Path(out)), corpus, skipped


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("candidates", type=Path, help="the reviewed candidates file")
    parser.add_argument("--out", type=Path, required=True, help="folder for the frozen corpus")
    parser.add_argument(
        "--held-out",
        nargs="+",
        default=list(HELD_OUT),
        metavar="CASE",
        help="the held-out case cohort (default: the nine non-development Task 9 cases)",
    )
    parser.add_argument(
        "--frozen-at",
        type=datetime.fromisoformat,
        help="freeze time, ISO with a timezone (default: now); fixes the digest on a re-run",
    )
    args = parser.parse_args(argv)
    try:
        path, corpus, skipped = freeze(
            args.candidates, args.out, tuple(args.held_out), args.frozen_at
        )
    except ValueError as exc:
        print(f"not frozen: {exc}", file=sys.stderr)
        return 1
    if skipped:
        print(f"left out (not approved): {', '.join(skipped)}")
    print(f"lessons:  {', '.join(lesson.id for lesson in corpus.lessons)}")
    print(f"held out: {', '.join(corpus.held_out_case_ids)}")
    print(f"corpus:   {path}")
    print(f"sha256:   {corpus.digest}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
