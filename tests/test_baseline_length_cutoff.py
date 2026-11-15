"""A reply cut off by the output cap costs one call; it no longer kills the baseline run."""

from __future__ import annotations

import asyncio
import json
from decimal import Decimal
from types import SimpleNamespace

from openai import LengthFinishReasonError
from openai.types import CompletionUsage
from openai.types.chat import ChatCompletion

from eval.baseline_agent import Action, run_baseline


class FakeExecutor:
    diagnostic_timeout_s = 60

    def __init__(self, runs_dir) -> None:
        self.runs_dir = runs_dir

    async def open(self, lab_name, run_id):
        (self.runs_dir / run_id).mkdir(parents=True)
        return "sandbox"

    async def close(self, sandbox_id):
        return None


class FakeCompletions:
    def __init__(self) -> None:
        self.calls = []

    async def parse(self, *, messages, **_):
        self.calls.append([m["content"] for m in messages])
        usage = CompletionUsage(prompt_tokens=100, completion_tokens=50, total_tokens=150)
        if len(self.calls) == 1:
            raise LengthFinishReasonError(
                completion=ChatCompletion(
                    id="c1",
                    choices=[],
                    created=0,
                    model="m",
                    object="chat.completion",
                    usage=usage,
                )
            )
        action = Action(action="finish", content="done")
        return SimpleNamespace(
            usage=usage, choices=[SimpleNamespace(message=SimpleNamespace(parsed=action))]
        )


def test_cut_off_reply_is_charged_and_the_run_continues(tmp_path):
    completions = FakeCompletions()
    client = SimpleNamespace(chat=SimpleNamespace(completions=completions))
    report = asyncio.run(
        run_baseline(
            FakeExecutor(tmp_path),
            client,
            model="m",
            run_id="r",
            prompt="p",
            prompt_source="test",
            input_usd_per_million=Decimal(1),
            output_usd_per_million=Decimal(1),
            contract={},
        )
    )
    assert report["status"] == "finished" and report["summary"] == "done"
    assert report["calls"] == 2 and report["truncated_replies"] == 1
    assert len(report["usage"]) == 2
    assert "output limit" in completions.calls[1][-1]
    saved = json.loads((tmp_path / "r" / "baseline.json").read_text(encoding="utf-8"))
    assert saved["truncated_replies"] == 1
