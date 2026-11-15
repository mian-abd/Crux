"""Crux v2 run settings shared by the experiment arms."""

from typing import Any, Literal

from pydantic import (
    BaseModel,
    ConfigDict,
    Field,
    SerializerFunctionWrapHandler,
    model_serializer,
)

from agents.llm import LLMConfig


class RunConfig(BaseModel):
    """Configure experiment selection, agent roles, and evidence sharing."""

    model_config = ConfigDict(extra="forbid")

    selection: Literal["eig", "random", "model_pick"] = "eig"
    proposers: Literal[3, 1] = 3
    critic: bool = True
    predictor: Literal["sampled", "exact_only", "jev", "stated", "tinker"] = "sampled"
    memory: Literal["pastdev", "local_role_only", "vector"] = "pastdev"
    search: bool = True
    lessons: bool = False
    null_hypothesis: bool = True
    llm: LLMConfig = Field(default_factory=LLMConfig)


# --- engine additions ----------------------------------------------------------------
# Appended for the orchestrator; nothing above this line changed. ``RunConfig`` keeps its
# fields (its dump is part of the recorded fixtures); the engine extends it by subclassing.


class EngineConfig(RunConfig):
    """``RunConfig`` plus the orchestrator's thresholds, budget caps, seed and run folder.

    Memory modes: ``pastdev`` and ``vector`` let every role read every record;
    ``local_role_only`` shows each role only its own records. The whole config is recorded
    in ``run.started``; it holds no secrets.
    """

    name: str = "default"

    # thresholds
    settle: float = Field(0.9, gt=0.0, le=1.0)  # max posterior that settles a question
    min_eig_bits: float = Field(0.05, ge=0.0)  # below this a question is unresolved
    max_experiments_per_question: int = Field(4, ge=1)
    # deliver + critic rounds, including the first
    max_critic_rounds: int = Field(2, ge=1)
    null_prior: float = Field(0.15, ge=0.0, lt=1.0)
    eps: float = Field(0.1, ge=0.0, le=1.0)  # predictor noise allowance
    # score = impact * EIG / (1 + cost_lambda * est_cost_s / 60)
    cost_lambda: float = Field(0.2, ge=0.0)
    n_predictor_samples: int = Field(8, ge=1)
    # a posterior below this rejects an option
    reject_below: float = Field(0.02, ge=0.0, lt=1.0)
    # surprise-driven regenerations per question
    max_regenerations: int = Field(2, ge=0)

    # budget caps
    max_usd: float = Field(2.0, ge=0.0)
    max_llm_calls: int = Field(40, ge=0)
    max_seconds: float = Field(1800, ge=0.0)

    seed: int = 0
    runs_dir: str = "runs"

    # Start-of-run recall from a frozen, reviewed lesson corpus (``memory.lessons``): the
    # saved corpus file and the held-out case this run declares. Both unset means no recall;
    # ``lessons`` above only controls writing candidate lessons and is independent of these.
    lessons_corpus: str | None = None
    lessons_case_id: str | None = None

    @model_serializer(mode="wrap")
    def _omit_unset_lessons(self, handler: SerializerFunctionWrapHandler) -> dict[str, Any]:
        # Unset corpus keys stay out of dumps, so ``run.started`` and ``manifest.json`` of a
        # run without lessons are byte-identical to runs recorded before these fields existed.
        data = handler(self)
        for key in ("lessons_corpus", "lessons_case_id"):
            if data.get(key) is None:
                data.pop(key, None)
        return data


Config = EngineConfig

PRESETS: dict[str, dict[str, Any]] = {
    "default": {},
    "crux_random_selection": {"selection": "random"},
    "crux_no_critic": {"critic": False},
    "crux_role_only_memory": {"memory": "local_role_only"},
    "no_search": {"search": False},
}


def load_config(
    name: str = "default", overrides: dict[str, Any] | None = None, **kwargs: Any
) -> EngineConfig:
    """The named preset with ``overrides`` (a dict) and then ``kwargs`` applied on top."""
    if name not in PRESETS:
        raise KeyError(f"unknown config preset {name!r}; choose from {sorted(PRESETS)}")
    values = {"name": name, **PRESETS[name], **(overrides or {}), **kwargs}
    return EngineConfig(**values)
