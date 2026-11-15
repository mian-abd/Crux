"""Durable provenance for a run. Spec and artifact records are written atomically."""

from __future__ import annotations

import hashlib
import json
import os
import subprocess
import tempfile
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, NotRequired, TypedDict

ROOT = Path(__file__).resolve().parents[1]


class ManifestData(TypedDict):
    schema_version: int
    run_id: str
    lab: str
    status: str
    started_at: str
    ended_at: str | None
    git_commit: str | None
    git_dirty: bool
    grader_commit: str | None
    grader_integration_commit: NotRequired[str | None]
    model_ids: dict[str, str]
    observed_model_ids: NotRequired[dict[str, str]]
    prompt_hashes: dict[str, str]
    input_hashes: dict[str, str]
    input_bundle_id: str | None
    sandbox_id: str | None
    sandbox_image_id: str | None
    sandbox_image_recipe_sha256: str
    execution_backend: str
    seeds: dict[str, int]
    config: dict[str, Any]
    diagnostics: list[dict[str, Any]]
    artifacts: list[dict[str, Any]]
    usage: dict[str, int | float | None]
    traces: list[dict[str, Any]]
    tracing: dict[str, Any]
    budget: NotRequired[dict[str, Any]]
    total_tokens: NotRequired[int]
    total_cost_usd: NotRequired[float | None]


def file_hash(path: Path) -> str:
    with path.open("rb") as stream:
        return hashlib.file_digest(stream, "sha256").hexdigest()


def _git(*args: str) -> str | None:
    try:
        return (
            subprocess.check_output(
                ["git", "-C", str(ROOT), *args],
                stderr=subprocess.DEVNULL,
                timeout=5,
            )
            .decode()
            .strip()
            or None
        )
    except (OSError, subprocess.SubprocessError):
        return None


class RunManifest:
    def __init__(self, directory: Path, run_id: str, cfg, lab, deps):
        self.path = directory / "manifest.json"
        self.clock = deps.clock
        executor = deps.executor or getattr(lab, "executor", None)
        inputs = getattr(executor, "inputs", None)
        sandbox = getattr(lab, "sandbox_id", None)
        self.data: ManifestData = {
            "schema_version": 1,
            "run_id": run_id,
            "lab": getattr(lab, "name", "lab"),
            "status": "running",
            "started_at": self.now(),
            "ended_at": None,
            "git_commit": _git("rev-parse", "HEAD"),
            "git_dirty": bool(_git("status", "--porcelain", "--untracked-files=no")),
            "grader_commit": _git("log", "-1", "--format=%H", "--", "eval"),
            "model_ids": cfg.llm.role_models,
            "prompt_hashes": {
                p.relative_to(ROOT).as_posix(): file_hash(p)
                for p in sorted((ROOT / "agents" / "prompts").glob("*.md"))
            },
            "input_hashes": dict(getattr(inputs, "files", {})),
            "input_bundle_id": getattr(inputs, "bundle_id", None),
            "sandbox_id": sandbox,
            "sandbox_image_id": getattr(executor, "image_ids", {}).get(sandbox),
            "sandbox_image_recipe_sha256": file_hash(ROOT / "execution" / "image.py"),
            "execution_backend": type(executor or lab).__name__,
            "seeds": {"orchestrator": cfg.seed, "particles": cfg.seed},
            "config": cfg.model_dump(mode="json"),
            "diagnostics": [],
            "artifacts": [],
            "usage": {
                "calls": 0,
                "input_tokens": 0,
                "output_tokens": 0,
                "known_cost_usd": 0.0,
                "cost_usd": 0.0,
                "unpriced_calls": 0,
            },
            "traces": [],
            "tracing": {},
        }
        if self.data["lab"] == "bixbench3":
            from labs.bixbench3.task9_contract import GRADER_COMMIT

            self.data["grader_integration_commit"] = self.data["grader_commit"]
            self.data["grader_commit"] = GRADER_COMMIT

    def now(self):
        return datetime.fromtimestamp(self.clock(), tz=UTC).isoformat()

    def refresh_execution(self, lab, deps):
        executor = getattr(lab, "executor", None) or deps.executor
        inputs = getattr(executor, "inputs", None)
        sandbox = getattr(lab, "sandbox_id", None)
        self.data.update(input_hashes=dict(getattr(inputs, "files", {})),
                         input_bundle_id=getattr(inputs, "bundle_id", None),
                         sandbox_id=sandbox,
                         sandbox_image_id=getattr(executor, "image_ids", {}).get(sandbox))
        if deps.llm is not None and hasattr(deps.llm, "config"):
            self.data["model_ids"] = dict(deps.llm.config.role_models)
            self.data["config"]["llm"] = deps.llm.config.model_dump(mode="json")
        # What the run actually had, next to what the config asked for: run.started's
        # config can say search=True and memory="pastdev" while no key was set.
        search, memory = getattr(deps, "search", None), getattr(deps, "memory", None)
        self.data["tools_connected"] = {
            "search": type(search).__name__ if search is not None else None,
            "memory": type(memory).__name__ if memory is not None else None,
        }
        self.write()

    def write(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        fd, name = tempfile.mkstemp(prefix=".manifest-", dir=self.path.parent)
        try:
            with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as stream:
                json.dump(self.data, stream, indent=2, sort_keys=True, allow_nan=False)
                stream.write("\n")
                stream.flush()
                os.fsync(stream.fileno())
            os.replace(name, self.path)
        finally:
            Path(name).unlink(missing_ok=True)

    def start(self):
        self.path.parent.mkdir(parents=True, exist_ok=True)
        if self.path.exists() or (self.path.parent / "events.jsonl").exists():
            raise ValueError("run_id already exists")
        try:
            (self.path.parent / ".run-owner").mkdir()
        except FileExistsError:
            raise ValueError("run_id already exists") from None
        self.write()

    def usage(self, usage):
        self.data.setdefault("observed_model_ids", {})[usage.role] = usage.model
        totals = self.data["usage"]
        totals["calls"] += 1
        for key in ("input_tokens", "output_tokens"):
            totals[key] += int(getattr(usage, key, 0))
        cost = getattr(usage, "cost_usd", None)
        if cost is None:
            totals["unpriced_calls"] += 1
        else:
            totals["known_cost_usd"] += cost
        totals["cost_usd"] = (
            None if totals["unpriced_calls"] else totals["known_cost_usd"]
        )

    def diagnostic(self, exp):
        self.data["diagnostics"].append(
            {
                "experiment_id": exp.id,
                "spec_hash": exp.spec_hash,
                "spec": {
                    k: exp.model_dump(mode="json")[k]
                    for k in ("code", "query", "design", "bins")
                },
                "recorded_at": self.now(),
            }
        )
        self.write()

    def artifact(self, artifact):
        artifact.sha256 = file_hash(Path(artifact.path))
        record = artifact.model_dump(mode="json")
        if record not in self.data["artifacts"]:
            self.data["artifacts"].append(record)
        self.write()

    def finish(self, status, traces, budget):
        self.data.update(
            status=status,
            ended_at=self.now(),
            traces=list(traces.refs),
            tracing=traces.status(),
            budget=budget,
            total_tokens=self.data["usage"]["input_tokens"] + self.data["usage"]["output_tokens"],
            total_cost_usd=None if self.data["usage"]["unpriced_calls"] else budget["cost_usd"],
        )
        self.write()
