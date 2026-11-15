"""Tests for the API server: SSE streaming, resume, replays, validation, fold, launching."""

from __future__ import annotations

import asyncio
import json
from pathlib import Path

import httpx
import pytest

from api.launcher import LauncherUnavailable
from api.server import create_app, fold_events

pytestmark = pytest.mark.anyio


@pytest.fixture
def anyio_backend() -> str:
    return "asyncio"


def ev(seq: int, type_: str, payload: dict | None = None, ts: float | None = None) -> dict:
    return {
        "run_id": "r-test",
        "seq": seq,
        "ts": 1000.0 + seq * 0.5 if ts is None else ts,
        "type": type_,
        "payload": payload or {},
    }


def make_events(n_mid: int = 8) -> list[dict]:
    events = [ev(0, "run.started", {"lab": "fake", "goal": "g", "started_at": "2026-11-14"})]
    events += [ev(i, "experiment.log", {"line": f"l{i}"}) for i in range(1, n_mid + 1)]
    events.append(ev(n_mid + 1, "run.finished", {"report": {}, "status": "ok"}))
    return events


def write_events(path: Path, events: list[dict]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text("".join(json.dumps(e) + "\n" for e in events), encoding="utf-8")


def client_for(app) -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=httpx.ASGITransport(app=app), base_url="http://test")


def parse_sse(text: str) -> list[dict]:
    frames = []
    for block in text.split("\n\n"):
        if not block.strip() or block.startswith(":"):
            continue
        fields = dict(line.split(": ", 1) for line in block.split("\n"))
        frames.append(
            {"id": int(fields["id"]), "event": fields["event"], "data": json.loads(fields["data"])}
        )
    return frames


async def test_sse_complete_file(tmp_path: Path) -> None:
    events = make_events()
    write_events(tmp_path / "r-1" / "events.jsonl", events)
    async with client_for(create_app(tmp_path)) as c:
        r = await c.get("/runs/r-1/events")
    assert r.status_code == 200
    assert r.headers["content-type"].startswith("text/event-stream")
    frames = parse_sse(r.text)
    assert [f["id"] for f in frames] == [e["seq"] for e in events]
    assert [f["event"] for f in frames] == [e["type"] for e in events]
    assert [f["data"] for f in frames] == events
    assert frames[-1]["event"] == "run.finished"


async def test_sse_live_follow(tmp_path: Path) -> None:
    events = make_events(6)
    path = tmp_path / "r-live" / "events.jsonl"
    path.parent.mkdir(parents=True)

    async def writer() -> None:
        for i, e in enumerate(events):
            await asyncio.sleep(0.12)
            line = json.dumps(e) + "\n"
            with path.open("a", encoding="utf-8") as fh:
                if i == 2:  # a partial line must not be emitted early
                    fh.write(line[:10])
                    fh.flush()
                    await asyncio.sleep(0.3)
                    fh.write(line[10:])
                else:
                    fh.write(line)

    async with client_for(create_app(tmp_path)) as c:
        task = asyncio.create_task(writer())
        r = await asyncio.wait_for(c.get("/runs/r-live/events"), timeout=10)
        await task
    frames = parse_sse(r.text)
    assert [f["id"] for f in frames] == [e["seq"] for e in events]
    assert frames[-1]["event"] == "run.finished"


async def test_resume(tmp_path: Path) -> None:
    write_events(tmp_path / "r-1" / "events.jsonl", make_events())
    async with client_for(create_app(tmp_path)) as c:
        a = await c.get("/runs/r-1/events", params={"from_seq": 5})
        b = await c.get("/runs/r-1/events", headers={"Last-Event-ID": "5"})
    assert [f["id"] for f in parse_sse(a.text)] == [5, 6, 7, 8, 9]
    assert [f["id"] for f in parse_sse(b.text)] == [6, 7, 8, 9]


async def test_replays(tmp_path: Path) -> None:
    events = make_events(4)
    write_events(tmp_path / "demo" / "one.jsonl", events)
    (tmp_path / "demo" / "notes.txt").write_text("x")
    async with client_for(create_app(tmp_path)) as c:
        assert (await c.get("/replays")).json() == ["one.jsonl"]
        r = await asyncio.wait_for(c.get("/replays/one.jsonl/events", params={"speed": 0}), 5)
        r2 = await c.get("/replays/one/events", params={"speed": 0})
        missing = await c.get("/replays/nope/events")
    assert [f["id"] for f in parse_sse(r.text)] == [e["seq"] for e in events]
    assert r2.status_code == 200
    assert missing.status_code == 404


async def test_replay_pacing_is_capped(tmp_path: Path) -> None:
    events = [ev(0, "run.started", ts=0.0), ev(1, "run.finished", ts=500.0)]
    write_events(tmp_path / "demo" / "gap.jsonl", events)
    loop = asyncio.get_running_loop()
    async with client_for(create_app(tmp_path)) as c:
        t0 = loop.time()
        r = await c.get("/replays/gap/events", params={"speed": 20})
    assert len(parse_sse(r.text)) == 2
    assert loop.time() - t0 < 1.0  # 2 s cap / 20x


@pytest.mark.parametrize("bad", ["%2e%2e", "a%20b", "a%2Fb", "x%00y", "..%2Fx", "a" * 81])
async def test_bad_names(tmp_path: Path, bad: str) -> None:
    write_events(tmp_path / "r-1" / "events.jsonl", make_events())
    async with client_for(create_app(tmp_path)) as c:
        for url in (f"/runs/{bad}", f"/runs/{bad}/events", f"/replays/{bad}/events"):
            r = await c.get(url)
            assert r.status_code in (400, 404), url
            if "%2F" not in bad:  # a slash never reaches the handler: the router answers 404
                assert r.status_code == 400, url


async def test_missing_run(tmp_path: Path) -> None:
    async with client_for(create_app(tmp_path)) as c:
        assert (await c.get("/runs/r-nope")).status_code == 404
        assert (await c.get("/runs/r-nope/events")).status_code == 404
        assert (await c.get("/health")).json() == {"ok": True}


def test_fold_events() -> None:
    q = {"id": "q1", "text": "Which?", "kind": "categorical", "status": "open", "raised_by": "a"}
    events = [
        ev(0, "run.started", {"lab": "fake"}),
        ev(1, "question.opened", {"question": q}),
        ev(
            2,
            "hypothesis.proposed",
            {
                "hypothesis": {
                    "id": "h0",
                    "question_id": "q1",
                    "is_null": True,
                    "prior": 0.15,
                    "posterior": 0.15,
                }
            },
        ),
        ev(
            3,
            "hypothesis.proposed",
            {"hypothesis": {"id": "h1", "question_id": "q1", "prior": 0.85, "posterior": 0.85}},
        ),
        ev(
            4,
            "experiment.proposed",
            {"experiment": {"id": "e1", "question_ids": ["q1"], "kind": "compute", "goal": "g"}},
        ),
        ev(
            5,
            "experiment.scored",
            {
                "question_id": "q1",
                "chosen": "e1",
                "ranking": [
                    {
                        "experiment_id": "e1",
                        "kind": "compute",
                        "goal": "g",
                        "eig_bits": 0.7,
                        "est_cost_s": 1.0,
                        "est_cost_usd": 0.0,
                        "score": 0.7,
                    }
                ],
            },
        ),
        ev(
            6,
            "experiment.finished",
            {"observation": {"experiment_id": "e1", "valid": True, "bin_id": "b1"}},
        ),
        ev(
            7,
            "belief.updated",
            {
                "question_id": "q1",
                "experiment_id": "e1",
                "observed": "b1",
                "prior": {"h0": 0.15, "h1": 0.85},
                "posterior": {"h0": 0.95, "h1": 0.05},
            },
        ),
        ev(
            8,
            "hypothesis.rejected",
            {"question_id": "q1", "hypothesis_id": "h1", "evidence_id": "ev1", "reason": "refuted"},
        ),
        ev(9, "question.settled", {"question_id": "q1", "hypothesis_id": "h0", "posterior": 0.95}),
        ev(10, "artifact.written", {"artifact": {"name": "a.csv", "path": "p", "sha256": "s"}}),
        ev(11, "critic.finding", {"finding": {"id": "f1", "severity": "warn", "rule": "r"}}),
        ev(12, "memory.written", {"evidence_id": "ev1", "author_role": "x", "backend": "b"}),
        ev(
            13,
            "memory.recalled",
            {
                "reader_role": "y",
                "query": "q",
                "evidence_ids": ["ev1"],
                "authors": ["x"],
                "backend": "b",
                "latency_ms": 1.0,
            },
        ),
        ev(14, "search.done", {"experiment_id": "e1", "query": "q", "urls": [], "blocked": []}),
        ev(
            15,
            "budget.tick",
            {"cost_usd": 0.1, "llm_calls": 1, "tokens_in": 1, "tokens_out": 1, "seconds": 1.0},
        ),
        ev(
            16,
            "budget.tick",
            {"cost_usd": 0.2, "llm_calls": 2, "tokens_in": 2, "tokens_out": 2, "seconds": 2.0},
        ),
        ev(17, "totally.unknown", {"x": 1}),
        ev(18, "run.finished", {"report": {}, "status": "ok"}),
    ]
    snap = fold_events(events)
    assert snap["status"] == "finished"
    assert snap["last_seq"] == 18
    [question] = snap["questions"]
    assert question["status"] == "settled"
    assert question["posterior"] == {"h0": 0.95, "h1": 0.05}
    opts = {o["id"]: o for o in question["options"]}
    assert opts["h0"]["posterior"] == 0.95 and opts["h0"]["status"] == "accepted"
    assert opts["h1"]["status"] == "rejected"
    [exp] = snap["experiments"]
    assert exp["eig_bits"] == 0.7 and exp["observation"]["bin_id"] == "b1"
    assert snap["rejected"][0]["reason"] == "refuted"
    assert snap["artifacts"][0]["name"] == "a.csv"
    assert snap["critic_findings"][0]["id"] == "f1"
    assert len(snap["memory"]["writes"]) == 1
    assert snap["memory"]["recalls"][0]["authors"] == ["x"]
    assert len(snap["searches"]) == 1
    assert snap["budget"]["cost_usd"] == 0.2
    assert fold_events([])["status"] == "running"
    assert fold_events([ev(0, "run.error", {"message": "m", "where": "w"})])["status"] == "error"
    exhausted = fold_events([ev(0, "run.finished", {"status": "budget_exhausted"})])
    assert exhausted["status"] == "budget_exhausted"


class FakeLauncher:
    def __init__(self, runs_dir: Path) -> None:
        self.runs_dir = runs_dir
        self.calls: list[tuple] = []
        self.task: asyncio.Task | None = None

    async def start(self, lab: str, config: str, seed: int, overrides: dict, run_id: str) -> None:
        self.calls.append((lab, config, seed, overrides, run_id))
        (self.runs_dir / run_id).mkdir(parents=True)
        self.task = asyncio.create_task(self._run(run_id, lab))

    async def _run(self, run_id: str, lab: str) -> None:
        path = self.runs_dir / run_id / "events.jsonl"
        for e in [
            ev(0, "run.started", {"lab": lab, "started_at": "t"}),
            ev(1, "run.finished", {"report": {}, "status": "ok"}),
        ]:
            await asyncio.sleep(0.05)
            with path.open("a", encoding="utf-8") as fh:
                fh.write(json.dumps({**e, "run_id": run_id}) + "\n")


async def test_post_runs_and_list(tmp_path: Path) -> None:
    launcher = FakeLauncher(tmp_path)
    async with client_for(create_app(tmp_path, launcher=launcher)) as c:
        r = await c.post("/runs", json={"lab": "fake", "seed": 3, "overrides": {"a": 1}})
        assert r.status_code == 202
        run_id = r.json()["run_id"]
        assert launcher.calls == [("fake", "default", 3, {"a": 1}, run_id)]
        # follow the live run to completion, then list it
        s = await asyncio.wait_for(c.get(f"/runs/{run_id}/events"), timeout=10)
        assert [f["event"] for f in parse_sse(s.text)] == ["run.started", "run.finished"]
        rows = (await c.get("/runs")).json()
    assert rows == [
        {"run_id": run_id, "status": "finished", "n_events": 2, "started_at": "t", "lab": "fake"}
    ]


async def test_post_runs_unavailable(tmp_path: Path) -> None:
    class Broken:
        async def start(self, *args, **kwargs) -> None:
            raise LauncherUnavailable("no engine")

    async with client_for(create_app(tmp_path, launcher=Broken())) as c:
        r = await c.post("/runs", json={"lab": "fake"})
    assert r.status_code == 503
    assert "no engine" in r.json()["detail"]


# --- the default launcher drives the real engine on the offline fakes ---------------------------


async def follow_run(c: httpx.AsyncClient, run_id: str) -> list[dict]:
    r = await asyncio.wait_for(c.get(f"/runs/{run_id}/events"), timeout=30)
    assert r.status_code == 200
    return parse_sse(r.text)


async def test_post_runs_with_the_default_launcher_streams_a_finished_run(tmp_path: Path) -> None:
    from core.replay import replay_check

    async with client_for(create_app(tmp_path)) as c:
        r = await c.post("/runs", json={"lab": "fake", "seed": 0, "overrides": {"lessons": True}})
        assert r.status_code == 202
        run_id = r.json()["run_id"]
        frames = await follow_run(c, run_id)
        snapshot = (await c.get(f"/runs/{run_id}")).json()
        rows = (await c.get("/runs")).json()
    events = [f["data"] for f in frames]
    assert [f["id"] for f in frames] == list(range(len(frames)))
    assert all(e["run_id"] == run_id for e in events)
    assert events[0]["type"] == "run.started"
    assert events[0]["payload"]["config"]["runs_dir"] == str(tmp_path)
    assert events[0]["payload"]["config"]["lessons"] is True
    assert events[-1]["type"] == "run.finished" and events[-1]["payload"]["status"] == "ok"
    types = {e["type"] for e in events}
    assert {"belief.updated", "question.settled", "lesson.written", "budget.tick"} <= types
    assert snapshot["status"] == "finished"
    assert {q["id"]: q["status"] for q in snapshot["questions"]} == {
        "q1": "settled",
        "q2": "settled",
    }
    assert rows[0]["run_id"] == run_id and rows[0]["lab"] == "fake"
    assert replay_check(tmp_path / run_id / "events.jsonl").ok


async def test_post_runs_with_the_default_launcher_runs_a_numeric_lab(tmp_path: Path) -> None:
    async with client_for(create_app(tmp_path)) as c:
        r = await c.post("/runs", json={"lab": "fake-numeric", "config": "crux_no_critic"})
        frames = await follow_run(c, r.json()["run_id"])
    types = [f["event"] for f in frames]
    assert "model.curves" in types and "critic.finding" not in types
    assert frames[0]["data"]["payload"]["config"]["name"] == "crux_no_critic"
    assert frames[-1]["data"]["payload"]["status"] == "ok"


@pytest.mark.parametrize(
    "body",
    [
        {"lab": "nope"},
        {"lab": "fake", "config": "nope"},
        {"lab": "fake", "overrides": {"memory": "everyone"}},
        {"lab": "fake", "overrides": {"not_a_flag": 1}},
    ],
)
async def test_post_runs_with_the_default_launcher_rejects_bad_requests(
    tmp_path: Path, body: dict
) -> None:
    async with client_for(create_app(tmp_path)) as c:
        r = await c.post("/runs", json=body)
    assert r.status_code == 400
    assert not any(tmp_path.iterdir())  # nothing was started


# ----------------------------------------------------------------------------
# CORS
# ----------------------------------------------------------------------------
async def _allowed_origin(app, origin: str) -> str | None:
    async with client_for(app) as c:
        r = await c.get("/health", headers={"Origin": origin})
    return r.headers.get("access-control-allow-origin")


async def test_cors_default_origins_only(tmp_path, monkeypatch):
    monkeypatch.delenv("CRUX_CORS_ORIGINS", raising=False)
    app = create_app(tmp_path)
    assert await _allowed_origin(app, "http://localhost:5173") == "http://localhost:5173"
    assert await _allowed_origin(app, "http://localhost:3000") is None


async def test_cors_origins_from_env(tmp_path, monkeypatch):
    monkeypatch.setenv("CRUX_CORS_ORIGINS", "http://localhost:3000, https://site.example/ ,")
    app = create_app(tmp_path)
    assert await _allowed_origin(app, "http://localhost:3000") == "http://localhost:3000"
    assert await _allowed_origin(app, "https://site.example") == "https://site.example"
    assert await _allowed_origin(app, "http://localhost:5173") == "http://localhost:5173"
    assert await _allowed_origin(app, "https://other.example") is None


async def test_paid_lab_needs_the_run_token_when_one_is_set(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("CRUX_RUN_TOKEN", "team-secret")
    launcher = FakeLauncher(tmp_path)
    async with client_for(create_app(tmp_path, launcher=launcher)) as c:
        missing = await c.post("/runs", json={"lab": "bixbench3"})
        wrong = await c.post("/runs", json={"lab": "bixbench3"}, headers={"X-Crux-Run-Token": "nope"})
        right = await c.post("/runs", json={"lab": "bixbench3"}, headers={"X-Crux-Run-Token": "team-secret"})
        free = await c.post("/runs", json={"lab": "claims"})
    assert missing.status_code == 403 and wrong.status_code == 403
    assert right.status_code == 202 and free.status_code == 202
    assert [call[0] for call in launcher.calls] == ["bixbench3", "claims"]


async def test_paid_lab_is_open_without_a_configured_token(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("CRUX_RUN_TOKEN", raising=False)
    launcher = FakeLauncher(tmp_path)
    async with client_for(create_app(tmp_path, launcher=launcher)) as c:
        r = await c.post("/runs", json={"lab": "bixbench3"})
    assert r.status_code == 202
