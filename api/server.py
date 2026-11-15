"""Crux API server.

The server never needs the engine in-process to stream: it replays
``<runs_dir>/<run_id>/events.jsonl`` and then follows new lines. See docs/EVENTS.md.
"""

from __future__ import annotations

import asyncio
import json
import os
import re
from collections.abc import AsyncIterator
from pathlib import Path
from typing import Any

from fastapi import FastAPI, HTTPException, Query, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from api.launcher import (
    DefaultLauncher,
    InvalidRunRequest,
    LauncherUnavailable,
    RunLauncher,
    known_labs,
    new_run_id,
    task9_cases,
)

NAME_RE = re.compile(r"^[A-Za-z0-9._-]{1,80}$")
TERMINAL_TYPES = frozenset({"run.finished", "run.error"})
DEFAULT_ORIGINS = ["http://localhost:5173", "http://127.0.0.1:5173"]
CORS_ORIGINS_ENV = "CRUX_CORS_ORIGINS"
POLL_S = 0.2
KEEPALIVE_S = 15.0
MAX_REPLAY_GAP_S = 2.0
EVENTS_FILE = "events.jsonl"


# ----------------------------------------------------------------------------
# Event files
# ----------------------------------------------------------------------------
def parse_line(raw: bytes | str) -> dict | None:
    """Parse one JSONL line into an event envelope, or None if it is not one."""
    try:
        obj = json.loads(raw)
    except (ValueError, UnicodeDecodeError):
        return None
    if isinstance(obj, dict) and isinstance(obj.get("seq"), int) and "type" in obj:
        return obj
    return None


def read_events(path: Path) -> list[dict]:
    """All complete, valid events currently in the file."""
    try:
        data = path.read_bytes()
    except OSError:
        return []
    end = data.rfind(b"\n")
    if end < 0:
        return []
    events = []
    for line in data[: end + 1].split(b"\n"):
        if line.strip() and (ev := parse_line(line)) is not None:
            events.append(ev)
    return events


def sse_frame(event: dict) -> str:
    data = json.dumps(event, separators=(",", ":"), ensure_ascii=False)
    return f"id: {event['seq']}\nevent: {event['type']}\ndata: {data}\n\n"


async def follow_file(path: Path, min_seq: int, request: Request | None) -> AsyncIterator[str]:
    """Replay the file, then follow it until a terminal event has been sent."""
    offset = 0
    buf = b""
    idle = 0.0
    while True:
        chunk = b""
        try:
            with path.open("rb") as fh:
                fh.seek(offset)
                chunk = fh.read()
        except OSError:
            pass  # the file may not exist yet
        offset += len(chunk)
        buf += chunk
        sent = False
        while (nl := buf.find(b"\n")) >= 0:  # only complete lines
            line, buf = buf[:nl], buf[nl + 1 :]
            if not line.strip():
                continue
            ev = parse_line(line)
            if ev is None:
                continue
            if ev["seq"] >= min_seq:
                yield sse_frame(ev)
                sent = True
            if ev["type"] in TERMINAL_TYPES:
                return
        if sent:
            idle = 0.0
            continue
        if request is not None and await request.is_disconnected():
            return
        await asyncio.sleep(POLL_S)
        idle += POLL_S
        if idle >= KEEPALIVE_S:
            idle = 0.0
            yield ": keep-alive\n\n"


async def replay_file(path: Path, speed: float) -> AsyncIterator[str]:
    prev_ts: float | None = None
    for ev in read_events(path):
        ts = ev.get("ts")
        if speed > 0 and isinstance(ts, (int, float)) and prev_ts is not None:
            gap = min(max(ts - prev_ts, 0.0), MAX_REPLAY_GAP_S) / speed
            if gap > 0:
                await asyncio.sleep(gap)
        if isinstance(ts, (int, float)):
            prev_ts = ts
        yield sse_frame(ev)


# ----------------------------------------------------------------------------
# Folding events into a snapshot
# ----------------------------------------------------------------------------
def status_of(events: list[dict]) -> str:
    if not events:
        return "running"
    last = events[-1]
    if last.get("type") == "run.error":
        return "error"
    if last.get("type") == "run.finished":
        if (last.get("payload") or {}).get("status") == "budget_exhausted":
            return "budget_exhausted"
        return "finished"
    return "running"


def fold_events(events: list[dict]) -> dict:
    """Pure fold of an event list into a UI snapshot. Unknown event types are ignored."""
    questions: dict[str, dict] = {}
    experiments: dict[str, dict] = {}
    rejected: list[dict] = []
    artifacts: list[dict] = []
    findings: list[dict] = []
    memory: dict[str, list] = {"writes": [], "recalls": []}
    searches: list[dict] = []
    budget: dict | None = None
    decision_traces: dict[str, list] = {}
    last_seq = -1

    def question(qid: str) -> dict:
        return questions.setdefault(
            qid, {"id": qid, "text": "", "status": "open", "options": [], "posterior": {}}
        )

    def option(qid: str, hid: str) -> dict | None:
        for opt in question(qid)["options"]:
            if opt.get("id") == hid:
                return opt
        return None

    def experiment(eid: str) -> dict:
        return experiments.setdefault(eid, {"id": eid, "status": "proposed"})

    for ev in events:
        seq = ev.get("seq")
        if isinstance(seq, int):
            last_seq = max(last_seq, seq)
        p = ev.get("payload")
        if not isinstance(p, dict):
            continue
        t = ev.get("type")
        if p.get("traces"):
            exp = p.get("experiment") or {}
            keys = [p.get("question_id"), p.get("experiment_id"), exp.get("id"),
                    (p.get("question") or {}).get("id"), *(exp.get("question_ids") or [])]
            for key in keys:
                if isinstance(key, str):
                    decision_traces[key] = p["traces"]
        if t == "question.opened":
            q = p.get("question") or {}
            if "id" in q:
                cur = question(q["id"])
                cur.update(q)
                cur.setdefault("options", [])
        elif t == "hypothesis.proposed":
            h = p.get("hypothesis") or {}
            if "id" in h and "question_id" in h:
                q = question(h["question_id"])
                opt = option(h["question_id"], h["id"])
                if opt is None:
                    q["options"].append(dict(h))
                else:
                    opt.update(h)
                if "posterior" in h:
                    q["posterior"][h["id"]] = h["posterior"]
        elif t == "hypothesis.merged":
            qid = p.get("question_id")
            if qid:
                q = question(qid)
                for hid in p.get("merged") or []:
                    opt = option(qid, hid)
                    if opt is not None:
                        opt["status"] = "merged"
                        opt["merged_into"] = p.get("kept")
                priors = p.get("priors") or {}
                for hid, pr in priors.items():
                    opt = option(qid, hid)
                    if opt is not None:
                        opt["prior"] = pr
                if priors:
                    q["posterior"] = dict(priors)
        elif t == "experiment.proposed":
            e = p.get("experiment") or {}
            if "id" in e:
                experiment(e["id"]).update(e)
        elif t == "experiment.scored":
            for row in p.get("ranking") or []:
                eid = row.get("experiment_id")
                if eid is None:
                    continue
                ex = experiment(eid)
                for k in ("eig_bits", "score", "est_cost_s", "est_cost_usd", "kind", "goal"):
                    if k in row:
                        ex[k] = row[k]
                ex.setdefault("question_ids", [p["question_id"]] if "question_id" in p else [])
            if p.get("chosen") in experiments:
                experiments[p["chosen"]]["chosen"] = True
        elif t == "experiment.started":
            if "experiment_id" in p:
                ex = experiment(p["experiment_id"])
                ex["status"] = "running"
                ex.setdefault("kind", p.get("kind"))
        elif t == "experiment.finished":
            obs = p.get("observation") or {}
            if "experiment_id" in obs:
                ex = experiment(obs["experiment_id"])
                ex["observation"] = obs
                ex["status"] = "done" if obs.get("valid", True) else "invalid"
        elif t == "referee.verdict":
            if "experiment_id" in p:
                ex = experiment(p["experiment_id"])
                ex["referee"] = {"valid": p.get("valid"), "note": p.get("note", "")}
                if p.get("valid") is False:
                    ex["status"] = "invalid"
        elif t == "belief.updated":
            qid = p.get("question_id")
            if qid:
                q = question(qid)
                post = p.get("posterior") or {}
                q["posterior"] = dict(post)
                q["last_experiment_id"] = p.get("experiment_id")
                for hid, val in post.items():
                    opt = option(qid, hid)
                    if opt is not None:
                        opt["posterior"] = val
        elif t == "hypothesis.rejected":
            qid, hid = p.get("question_id"), p.get("hypothesis_id")
            rejected.append(
                {
                    "question_id": qid,
                    "hypothesis_id": hid,
                    "evidence_id": p.get("evidence_id"),
                    "reason": p.get("reason", ""),
                }
            )
            if qid and hid:
                opt = option(qid, hid)
                if opt is not None:
                    opt["status"] = "rejected"
        elif t in ("question.settled", "question.robust", "question.unresolved"):
            qid = p.get("question_id")
            if qid:
                q = question(qid)
                q["status"] = t.split(".", 1)[1]
                if t == "question.settled":
                    q["settled_hypothesis"] = p.get("hypothesis_id")
                    opt = option(qid, p.get("hypothesis_id"))
                    if opt is not None:
                        opt["status"] = "accepted"
                elif t == "question.robust":
                    q["answer_key"] = p.get("answer_key")
                else:
                    q["reason"] = p.get("reason")
        elif t == "artifact.written":
            if p.get("artifact"):
                artifacts.append(p["artifact"])
        elif t == "critic.finding":
            if p.get("finding"):
                findings.append(p["finding"])
        elif t == "memory.written":
            memory["writes"].append(p)
        elif t == "memory.recalled":
            memory["recalls"].append(p)
        elif t == "search.done":
            searches.append(p)
        elif t == "budget.tick":
            budget = p
        # anything else (including unknown types) is ignored

    return {
        "questions": list(questions.values()),
        "experiments": list(experiments.values()),
        "rejected": rejected,
        "artifacts": artifacts,
        "critic_findings": findings,
        "memory": memory,
        "searches": searches,
        "budget": budget,
        "decision_traces": decision_traces,
        "status": status_of(events),
        "last_seq": last_seq,
    }


# ----------------------------------------------------------------------------
# App
# ----------------------------------------------------------------------------
class RunRequest(BaseModel):
    lab: str
    config: str = "default"
    seed: int = 0
    overrides: dict[str, Any] = Field(default_factory=dict)


def safe_child(base: Path, name: str) -> Path:
    """Validate ``name`` and return ``base/name``, which must resolve inside ``base``."""
    if not NAME_RE.fullmatch(name) or name in (".", ".."):
        raise HTTPException(400, "invalid name")
    base_r = base.resolve()
    path = (base / name).resolve()
    if not path.is_relative_to(base_r) or path == base_r:
        raise HTTPException(400, "invalid name")
    return path


def _min_seq(request: Request, from_seq: int | None) -> int:
    min_seq = 0
    if from_seq is not None:
        min_seq = max(min_seq, from_seq)
    header = request.headers.get("last-event-id")
    if header is not None:
        try:
            min_seq = max(min_seq, int(header.strip()) + 1)
        except ValueError:
            pass
    return min_seq


def _sse(gen: AsyncIterator[str]) -> StreamingResponse:
    return StreamingResponse(
        gen,
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


def env_origins() -> list[str]:
    """Extra allowed origins from ``$CRUX_CORS_ORIGINS`` (comma-separated); none when unset."""
    raw = os.environ.get(CORS_ORIGINS_ENV, "")
    return [o.strip().rstrip("/") for o in raw.split(",") if o.strip()]


def create_app(
    runs_dir: Path = Path("runs"),
    launcher: RunLauncher | None = None,
    cors_origins: list[str] | None = None,
) -> FastAPI:
    runs_dir = Path(runs_dir)
    app = FastAPI(title="Crux API")
    app.add_middleware(
        CORSMiddleware,
        allow_origins=[*DEFAULT_ORIGINS, *env_origins(), *(cors_origins or [])],
        allow_methods=["*"],
        allow_headers=["*"],
    )
    app.state.runs_dir = runs_dir
    app.state.launcher = launcher

    def get_launcher() -> RunLauncher:
        if app.state.launcher is None:
            app.state.launcher = DefaultLauncher(runs_dir)
        return app.state.launcher

    def run_dir(run_id: str) -> Path:
        path = safe_child(runs_dir, run_id)
        if not path.is_dir() or path.name == "demo":
            raise HTTPException(404, "run not found")
        return path

    @app.get("/health")
    async def health() -> dict:
        return {"ok": True}

    @app.get("/tasks")
    async def list_tasks() -> dict:
        """Labs a run can start, and the Task 9 cases found under ``$CRUX_TASK9_CASES``.

        Start a case with ``POST /runs {"lab": "bixbench3", "overrides": {"case": id}}``.
        Case splits live with the evaluator's truth key, which the server never reads.
        """
        try:
            cases = task9_cases()
        except ImportError:
            cases = {}
        return {
            "labs": known_labs(),
            "cases": [
                {"lab": "bixbench3", "case": case, "kind": info["kind"]}
                for case, info in sorted(cases.items())
            ],
        }

    @app.post("/runs", status_code=202)
    async def start_run(body: RunRequest) -> dict:
        run_id = new_run_id()
        try:
            await get_launcher().start(body.lab, body.config, body.seed, body.overrides, run_id)
        except InvalidRunRequest as exc:  # unknown lab, unknown preset or bad override
            raise HTTPException(400, str(exc)) from exc
        except LauncherUnavailable as exc:
            raise HTTPException(503, f"engine unavailable: {exc}") from exc
        return {"run_id": run_id}

    @app.get("/runs")
    async def list_runs() -> list[dict]:
        rows = []
        if runs_dir.is_dir():
            for d in runs_dir.iterdir():
                if not d.is_dir() or d.name == "demo" or not NAME_RE.fullmatch(d.name):
                    continue
                events = read_events(d / EVENTS_FILE)
                first = events[0] if events else {}
                payload = first.get("payload") or {}
                rows.append(
                    {
                        "run_id": d.name,
                        "status": status_of(events),
                        "n_events": len(events),
                        "started_at": payload.get("started_at") or first.get("ts"),
                        "lab": payload.get("lab") if first.get("type") == "run.started" else None,
                        "_mtime": d.stat().st_mtime,
                    }
                )
        rows.sort(key=lambda r: r["_mtime"], reverse=True)
        for r in rows:
            del r["_mtime"]
        return rows

    @app.get("/runs/{run_id}")
    async def get_run(run_id: str) -> dict:
        d = run_dir(run_id)
        snap = fold_events(read_events(d / EVENTS_FILE))
        snap["run_id"] = run_id
        return snap

    @app.get("/runs/{run_id}/events")
    async def run_events(
        run_id: str, request: Request, from_seq: int | None = Query(default=None, ge=0)
    ) -> StreamingResponse:
        d = run_dir(run_id)
        return _sse(follow_file(d / EVENTS_FILE, _min_seq(request, from_seq), request))

    def demo_dir() -> Path:
        return runs_dir / "demo"

    @app.get("/replays")
    async def list_replays() -> list[str]:
        d = demo_dir()
        return sorted(f.name for f in d.glob("*.jsonl")) if d.is_dir() else []

    @app.get("/replays/{name}/events")
    async def replay_events(
        name: str, speed: float = Query(default=1.0, ge=0)
    ) -> StreamingResponse:
        if not NAME_RE.fullmatch(name) or name in (".", ".."):
            raise HTTPException(400, "invalid name")
        fname = name if name.endswith(".jsonl") else f"{name}.jsonl"
        path = safe_child(demo_dir(), fname)
        if not path.is_file():
            raise HTTPException(404, "replay not found")
        return _sse(replay_file(path, speed))

    return app


app = create_app()

__all__ = ["app", "create_app", "fold_events", "read_events"]
