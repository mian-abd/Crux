"""Build the pitch charts (PNG at 200 dpi plus SVG) into docs/figures/.

Usage:
    uv run python -m eval.make_charts [--task9 RESULTS.json ...] [--calibration FILE] [--out DIR]

Each chart whose input is missing is skipped with a printed note.
"""

from __future__ import annotations

import argparse
import json
import textwrap
from pathlib import Path

import matplotlib

matplotlib.use("Agg")
import matplotlib.pyplot as plt

# Okabe-Ito, colourblind safe. OURS is the swarm / our method, OTHER the comparison.
OURS = "#0072B2"
OTHER = "#E69F00"
GREY = "#8A8A8A"
INK = "#222222"
BG = "#FAFAF7"

# Copies of the evaluator-side batch-02 outputs (scores and judge quotes only, no references).
DEFAULT_TASK9 = [
    Path("eval/results/task9_batch02/suite_results.json"),
    Path("eval/results/task9_batch02/clean_results.json"),
]
DEFAULT_FAULTS = Path("eval/results/task9_batch02/fault_detection.json")
# Crashed single-agent runs repeated after the harness fix: a labelled deviation, drawn apart.
DEFAULT_RERUNS = [Path("eval/results/task9_batch02/rerun_results.json")]
DEFAULT_RERUN_FAULTS = Path("eval/results/task9_batch02/rerun_fault_detection.json")
DEFAULT_CALIBRATION = Path("eval/results/predictor_calibration.json")
DEFAULT_OUT = Path("docs/figures")

# Source: eval/results/real_data_diagnostics.md, "Detection on real counts with
# planted faults (DU-49)". (caught, planted); None means the design cannot carry it.
FAULT_DATASETS = ["COVID lung/colon", "Pasilla", "Airway"]
FAULT_DETECTION = {
    "Sample swap": [(2, 2), (2, 2), (2, 2)],
    "Label inversion": [(2, 2), (0, 2), (0, 2)],
    "Duplicate library": [(2, 2), (2, 2), (2, 2)],
    "Low depth": [(2, 2), (2, 2), (2, 2)],
    "Cell-line swap": [(2, 2), None, None],
    "Gene version": [(2, 2), (2, 2), None],
}

# Source: eval/results/real_data_diagnostics.md, "Airway: the albuterol labels look
# swapped in two of four donors". Dex-signature score vs the donor's untreated sample.
AIRWAY = {
    # donor: (labelled albuterol, labelled albuterol + dex, dex for scale)
    "N052611": (2.86, 0.36, 3.39),
    "N061011": (0.00, 3.47, 3.72),
    "N080611": (3.11, 0.55, 3.21),
    "N61311": (-0.14, 3.16, 3.31),
}
AIRWAY_SWAPPED = {"N052611", "N080611"}

PREDICTORS = [
    ("library", "Library\nstated rows"),
    ("sampled", "gpt-4.1-mini\nsampled"),
    ("base", "Qwen3-8B\nbase"),
    ("finetuned", "Qwen3-8B\nLoRA fine-tune"),
]


def _style() -> None:
    plt.rcParams.update(
        {
            "figure.facecolor": BG,
            "axes.facecolor": BG,
            "savefig.facecolor": BG,
            "font.size": 14,
            "axes.labelsize": 15,
            "xtick.labelsize": 14,
            "ytick.labelsize": 14,
            "text.color": INK,
            "axes.labelcolor": INK,
            "xtick.color": INK,
            "ytick.color": INK,
            "axes.spines.top": False,
            "axes.spines.right": False,
            "svg.fonttype": "none",
        }
    )


def _title(fig, title: str, subtitle: str) -> None:
    fig.text(0.04, 0.955, title, fontsize=20, fontweight="bold", ha="left", va="top")
    fig.text(0.04, 0.885, "\n".join(_wrap(subtitle, 105)), fontsize=13, color="#555555",
             ha="left", va="top", linespacing=1.3)


def _save(fig, out: Path, name: str) -> list[Path]:
    out.mkdir(parents=True, exist_ok=True)
    paths = [out / f"{name}.png", out / f"{name}.svg"]
    fig.savefig(paths[0], dpi=200)
    fig.savefig(paths[1])
    plt.close(fig)
    return paths


def _short(name: str, limit: int = 34) -> str:
    return name if len(name) <= limit else name[: limit - 1] + "..."


def _wrap(text: str, width: int) -> list[str]:
    return textwrap.wrap(text, width)


# ---------------------------------------------------------------- task 9


def load_task9(paths: list[Path]) -> tuple[list[dict], list[Path]]:
    """Runs from every readable results.json, each tagged with a case name."""
    runs, used = [], []
    for p in paths:
        if not p.is_file():
            continue
        data = json.loads(p.read_text(encoding="utf-8"))
        for r in data.get("runs", []):
            if r.get("status") == "not run: budget":
                continue  # the launch's spend cap stopped it: never ran, so it is not a 0
            runs.append({**r, "case": r.get("case") or p.parent.name})
        used.append(p)
    return runs, used


def _run_score(r: dict) -> float:
    return r["mean"] if r.get("mean") is not None else 0.0  # failed counts as 0


def _mean(xs: list[float]) -> float:
    return sum(xs) / len(xs)


TIE = 0.005  # score differences this small are ties, not wins


def _crashed(r: dict) -> bool:
    return r.get("status") == "error" or r.get("mean") is None


def _case_names(faults: dict[str, str]) -> dict[str, str]:
    """case id -> readable name ('Sample swap 1'), in FAULT_ORDER; clean cases are absent."""
    names, seen = {}, {}
    rank = {f: i for i, (f, _) in enumerate(FAULT_ORDER)}
    for case, fault in sorted(faults.items(), key=lambda kv: (rank.get(kv[1], 99), kv[0])):
        label = dict(FAULT_ORDER).get(fault, fault)
        seen[label] = seen.get(label, 0) + 1
        names[case] = f"{label} {seen[label]}"
    return names


def chart_task9_swarm_vs_baseline(runs: list[dict], faults: dict[str, str], out: Path,
                                  reruns: list[dict] | None = None) -> list[Path]:
    """The pre-registered summary: the clean case (all clean runs), the fault cases, all suite cases.

    ``faults`` maps each planted-fault case to its fault type; every other case is clean.
    Batch-02's clean repeats are named 'clean' and count toward the clean measure only.
    ``reruns`` (optional) are baseline runs repeated after a harness fix: shown as a hollow
    marker on the measures they change, never mixed into the pre-registered bars.
    """
    arms = [("swarm", "Swarm", OURS), ("baseline", "Single agent (gpt-5.5)", OTHER)]
    suite_ids = {id(r) for r in runs if r["case"] != "clean"}
    n_fault = len({r["case"] for r in runs if r["case"] in faults})
    n_suite = len({r["case"] for r in runs if id(r) in suite_ids})
    measures = [
        ("Clean case\n(all clean runs)", lambda r: r["case"] not in faults),
        (f"{n_fault} planted-fault\ncases", lambda r: r["case"] in faults),
        (f"All {n_suite} suite\ncases", lambda r: id(r) in suite_ids),
    ]
    fixed = {r["case"]: r for r in (reruns or [])}
    fig, ax = plt.subplots(figsize=(13, 7.4))
    fig.subplots_adjust(left=0.20, right=0.93, top=0.70, bottom=0.11)
    bar_h = 0.36
    for i, (label, keep) in enumerate(measures):
        for j, (arm, _, colour) in enumerate(arms):
            group = [r for r in runs if r["arm"] == arm and keep(r)]
            if not group:
                continue
            y = i + (j - 0.5) * (bar_h + 0.04)
            m = _mean([_run_score(r) for r in group])
            crashed = sum(_crashed(r) for r in group)
            alt = None
            if arm == "baseline" and crashed and fixed:
                swapped = [fixed.get(r["case"], r) if _crashed(r) else r for r in group]
                alt = _mean([_run_score(r) for r in swapped])
                ax.barh(y, alt, height=bar_h, facecolor="none", edgecolor=colour, linewidth=2,
                        linestyle=(0, (4, 3)), zorder=1)
                ax.text(alt + 0.012, y, f"{alt:.2f} with the crashed runs rerun", va="center",
                        fontsize=12, color=INK)
            ax.barh(y, m, height=bar_h, color=colour, zorder=2)
            note = f"{len(group)} runs" + (f", {crashed} crashed = 0" if crashed else "")
            ax.text(0.012, y, note, va="center", fontsize=12, zorder=3,
                    color="white" if arm == "swarm" else INK)
            ax.text(m + 0.012, y, f"{m:.2f}", va="center", fontsize=15, fontweight="bold",
                    zorder=3)
    ax.set_yticks(range(len(measures)))
    ax.set_yticklabels([m[0] for m in measures])
    ax.invert_yaxis()
    ax.set_xlim(0, 1.15)
    ax.set_xlabel("Official score, mean over runs (0 to 1)")
    handles = [plt.Rectangle((0, 0), 1, 1, color=c, label=lab) for _, lab, c in arms]
    ax.legend(handles=handles, loc="lower right", bbox_to_anchor=(1.0, 1.0), ncol=2,
              fontsize=13, frameon=False)
    sub = ("Pilot: BixBench3 task 9 from published counts, Edison's grader, same inputs, budget "
           "($2, 40 calls) and sandbox for both arms. Pre-registered: crashed runs count as 0.")
    if fixed:
        sub += (" Dashed outline: the same mean with the crashed single-agent runs repeated after "
                "the harness fix (a labelled deviation, not pre-registered).")
    _title(fig, "Task 9: swarm vs single agent, pre-registered measures", sub)
    return _save(fig, out, "task9_swarm_vs_baseline")


def chart_task9_per_case(runs: list[dict], faults: dict[str, str], out: Path,
                         reruns: list[dict] | None = None) -> list[Path]:
    """Mean score per case and arm; batch-02's clean repeats join the suite's clean case.

    A crashed run is an x at 0 (pre-registered); with ``reruns``, the repeated run's score is
    a hollow marker above it, labelled, and never counted in the title.
    """
    names = _case_names(faults)
    fixed = {(r["case"], r["arm"]): r for r in (reruns or [])}

    def name(case: str) -> str:
        return names.get(case, "Clean")

    order = ["Clean", *names.values()]
    arms = [("baseline", "Single agent (gpt-5.5)", OTHER, -1), ("swarm", "Swarm", OURS, 1)]
    fig, ax = plt.subplots(figsize=(14, 7.6))
    fig.subplots_adjust(left=0.07, right=0.97, top=0.72, bottom=0.17)
    means: dict[tuple[str, str], float] = {}
    n_clean = 0
    for x, label in enumerate(order):
        for arm, _, colour, side in arms:
            group = [r for r in runs if name(r["case"]) == label and r["arm"] == arm]
            if not group:
                continue
            if label == "Clean":
                n_clean = max(n_clean, len(group))
            vals = [_run_score(r) for r in group]
            m = _mean(vals)
            means[(label, arm)] = m
            if len(vals) > 1:
                ax.scatter([x] * len(vals), vals, s=50, color=colour, alpha=0.35, zorder=2)
            if all(_crashed(r) for r in group):
                ax.scatter([x], [0], marker="x", s=170, color=GREY, linewidths=2.5, zorder=3)
                ax.text(x, 0.05, "crashed", ha="center", fontsize=11, color="#555555")
                again = fixed.get((group[0]["case"], arm))
                if again is not None and not _crashed(again):
                    ax.scatter([x + 0.3], [_run_score(again)], s=190, facecolors=BG,
                               edgecolors=colour, linewidths=2.5, zorder=3)
                    ax.text(x + 0.3, _run_score(again) - 0.035,
                            f"{_run_score(again):.2f}\nrerun", ha="center", va="top",
                            fontsize=10, color="#555555")
            else:
                ax.scatter([x], [m], s=230, color=colour, edgecolors=BG, linewidths=2, zorder=3)
        drawn = {a: means[(label, a)] for a, *_ in arms if (label, a) in means
                 and not all(_crashed(r) for r in runs
                             if name(r["case"]) == label and r["arm"] == a)}
        top = max(drawn, key=lambda a: (drawn[a], a == "swarm")) if drawn else None
        for a, m in drawn.items():
            above = a == top
            ax.text(x, m + (0.035 if above else -0.035), f"{m:.2f}", ha="center",
                    va="bottom" if above else "top", fontsize=12)
        if all((label, a) in means for a, *_ in arms):
            ax.plot([x, x], [means[(label, "baseline")], means[(label, "swarm")]],
                    color="#CCCCC8", lw=2, zorder=1)
    ticks = [f"Clean\n({n_clean} runs)" if o == "Clean" else o.replace(" ", "\n", 1) for o in order]
    ax.set_xticks(range(len(order)))
    ax.set_xticklabels(ticks, fontsize=12)
    ax.set_xlim(-0.6, len(order) - 0.4)
    ax.set_ylim(-0.08, 1.05)
    ax.set_ylabel("Official score")
    handles = [plt.Line2D([], [], marker="o", linestyle="", markersize=13, color=c, label=lab)
               for _, lab, c, _ in reversed(arms)]
    handles.append(plt.Line2D([], [], marker="x", linestyle="", markersize=11, color=GREY,
                              markeredgewidth=2.5, label="Run crashed (scored 0)"))
    if fixed:
        handles.append(plt.Line2D([], [], marker="o", linestyle="", markersize=13,
                                  markerfacecolor=BG, markeredgecolor=OTHER, markeredgewidth=2.5,
                                  label="Crashed run repeated after the fix"))
    ax.legend(handles=handles, loc="lower right", bbox_to_anchor=(1.0, 1.0), ncol=len(handles),
              fontsize=12, frameon=False)
    paired = [o for o in order if (o, "swarm") in means and (o, "baseline") in means]
    d = [means[(o, "swarm")] - means[(o, "baseline")] for o in paired]
    wins, losses = sum(x > TIE for x in d), sum(x < -TIE for x in d)
    title = (f"The swarm scored higher on {wins} of {len(paired)} cases, lower on {losses}, "
             f"tied on {len(paired) - wins - losses}")
    sub = (f"Pilot: BixBench3 task 9, one run per arm per fault case and {n_clean} on the clean "
           f"case. Differences under {TIE} count as ties. Crashed runs score 0, as pre-registered.")
    if fixed:
        rescored = {o: means[(o, "swarm")] - (
            _run_score(fixed[(c, "baseline")]) if (c := next(
                (r["case"] for r in runs if name(r["case"]) == o), None)) and
            (c, "baseline") in fixed else means[(o, "baseline")]) for o in paired}
        w2 = sum(v > TIE for v in rescored.values())
        l2 = sum(v < -TIE for v in rescored.values())
        sub += (f" With the crashed runs repeated after the harness fix (hollow, a labelled "
                f"deviation): higher on {w2}, lower on {l2}, tied on {len(paired) - w2 - l2}.")
    _title(fig, title, sub)
    return _save(fig, out, "task9_swarm_vs_baseline_per_case")


# ---------------------------------------------------------------- faults


def chart_fault_detection(out: Path) -> list[Path]:
    rows = list(FAULT_DETECTION)
    cells = [e for v in FAULT_DETECTION.values() for e in v if e]
    caught = sum(c for c, _ in cells)
    planted = sum(p for _, p in cells)
    fig, ax = plt.subplots(figsize=(13, 7.5))
    fig.subplots_adjust(left=0.04, right=0.96, top=0.78, bottom=0.04)
    ax.set_xlim(0, len(FAULT_DATASETS) + 3.0)
    ax.set_ylim(len(rows) + 1.2, -1.2)
    ax.axis("off")
    for j, d in enumerate(FAULT_DATASETS):
        ax.text(2.0 + j + 0.5, -0.65, d, ha="center", va="center", fontsize=15,
                fontweight="bold")
    for i, name in enumerate(rows):
        ax.text(1.85, i + 0.5, name, ha="right", va="center", fontsize=15)
        for j, e in enumerate(FAULT_DETECTION[name]):
            x = 2.0 + j
            if e is None:
                ax.add_patch(plt.Rectangle((x + 0.04, i + 0.06), 0.92, 0.88, color="#E4E4E0"))
                ax.text(x + 0.5, i + 0.5, "n/a", ha="center", va="center", fontsize=14,
                        color="#777777")
                continue
            c, p = e
            full = c == p
            ax.add_patch(plt.Rectangle((x + 0.04, i + 0.06), 0.92, 0.88,
                                       color=OURS if full else OTHER))
            ax.text(x + 0.5, i + 0.5, f"{c}/{p}", ha="center", va="center", fontsize=20,
                    fontweight="bold", color="white" if full else INK)
    y = len(rows)
    ax.text(1.85, y + 0.5, "Caught", ha="right", va="center", fontsize=15, fontweight="bold")
    for j in range(len(FAULT_DATASETS)):
        es = [FAULT_DETECTION[r][j] for r in rows if FAULT_DETECTION[r][j]]
        ax.text(2.0 + j + 0.5, y + 0.5, f"{sum(e[0] for e in es)}/{sum(e[1] for e in es)}",
                ha="center", va="center", fontsize=20, fontweight="bold")
    xa = 2.0 + len(FAULT_DATASETS) + 0.2
    ax.text(xa, -0.65, "All", ha="left", va="center", fontsize=15, fontweight="bold")
    ax.text(xa, y + 0.5, f"{caught}/{planted}", ha="left", va="center", fontsize=24,
            fontweight="bold", color=OURS)
    _title(fig, f"The swarm catches {caught} of {planted} planted faults on real data",
           "Every miss is a label inversion on a single-cell-line design, where the check "
           "abstains. 2 plants per fault per dataset: a sanity check, not a benchmark.")
    return _save(fig, out, "fault_detection_real_data")


# ---------------------------------------------------------------- airway


FAULT_ORDER = [
    ("sample_swap", "Sample swap"),
    ("label_inversion", "Label inversion"),
    ("duplicate_library", "Duplicate library"),
    ("low_depth", "Low depth"),
    ("cell_line_swap", "Cell-line swap"),
    ("gene_version", "Gene version"),
]


def chart_task9_fault_detection(rows: list[dict], runs: list[dict], out: Path,
                                rerun_rows: list[dict] | None = None) -> list[Path]:
    """One dot per planted-fault case and arm: caught (filled), missed (hollow), crashed (x).

    With ``rerun_rows``, each crashed cell is annotated with the repeated run's verdict.
    """
    status = {r["run_id"]: r.get("status") for r in runs}
    again = {(r["case"], r["arm"]): r["verdict"] for r in (rerun_rows or [])}
    rank = {f: i for i, (f, _) in enumerate(FAULT_ORDER)}
    cases = sorted({(r["fault"], r["case"]) for r in rows}, key=lambda fc: (rank[fc[0]], fc[1]))
    arms = [("swarm", "Swarm", OURS), ("baseline", "Single agent (gpt-5.5)", OTHER)]
    cell = {(r["case"], r["arm"]): r for r in rows}
    fig, ax = plt.subplots(figsize=(13, 7.0))
    fig.subplots_adjust(left=0.24, right=0.90, top=0.70, bottom=0.25)
    ax.set_xlim(-0.6, len(cases) - 0.4)
    ax.set_ylim(len(arms) - 0.4, -0.6)
    ax.axis("off")
    for y, (arm, label, colour) in enumerate(arms):
        caught = 0
        for x, (_, case) in enumerate(cases):
            r = cell.get((case, arm))
            if r is None:
                continue
            if status.get(r["run_id"]) == "error":
                ax.scatter(x, y, marker="x", s=170, color=GREY, linewidths=2.5, zorder=3)
                if (case, arm) in again:
                    ax.text(x, y + 0.2, f"rerun:\n{again[(case, arm)]}", ha="center", va="top",
                            fontsize=10, color="#555555", linespacing=1.1)
            elif r["verdict"] == "caught":
                caught += 1
                ax.scatter(x, y, s=420, color=colour, edgecolors=BG, linewidths=2, zorder=3)
            else:
                ax.scatter(x, y, s=420, facecolors=BG, edgecolors=colour, linewidths=2.5, zorder=3)
        ax.text(-0.85, y, label, ha="right", va="center", fontsize=15, fontweight="bold")
        ax.text(len(cases) - 0.15, y, f"{caught} of {len(cases)}", ha="left", va="center",
                fontsize=17, fontweight="bold")
    for i, (fault, name) in enumerate(FAULT_ORDER):
        xs = [x for x, (f, _) in enumerate(cases) if f == fault]
        if not xs:
            continue
        mid = sum(xs) / len(xs)
        ax.text(mid, len(arms) - 0.25, name.replace(" ", "\n", 1), ha="center", va="top",
                fontsize=13, color="#555555", linespacing=1.2)
        if i:
            ax.axvline(min(xs) - 0.5, color="#DDDDDA", linewidth=1, zorder=1)
    ax.text(len(cases) - 0.15, -0.55, "caught", ha="left", va="center", fontsize=12, color="#555555")
    handles = [
        plt.Line2D([], [], marker="o", linestyle="", markersize=13, color=INK, label="Caught: named and handled"),
        plt.Line2D([], [], marker="o", linestyle="", markersize=13, markerfacecolor=BG,
                   markeredgecolor=INK, markeredgewidth=2, label="Missed"),
        plt.Line2D([], [], marker="x", linestyle="", markersize=11, color=GREY, markeredgewidth=2.5,
                   label="Run crashed (counted as missed)"),
    ]
    fig.legend(handles=handles, loc="lower center", ncol=3, frameon=False, fontsize=13,
               bbox_to_anchor=(0.55, 0.01))
    n_crash = sum(1 for r in rows if status.get(r["run_id"]) == "error")
    base_caught = sum(1 for r in rows if r["arm"] == "baseline" and r["verdict"] == "caught")
    rerun_caught = base_caught + sum(1 for (c, a), v in again.items()
                                     if a == "baseline" and v == "caught")
    _title(
        fig,
        "Planted faults caught on BixBench3 task 9",
        f"12 fault cases (6 types, 2 each), one run per arm, same inputs, budget and grader. A judge "
        f"model holding the truth key read each run's METHODS.md (rubric pre-registered). "
        f"{n_crash} single-agent runs crashed on a harness bug, since fixed; as pre-registered they "
        f"count as missed."
        + (f" Repeated after the fix, the single agent caught {rerun_caught} of 12." if again
           else "")
        + " Source: eval/results/task9_batch02.md.",
    )
    return _save(fig, out, "task9_fault_detection")


def chart_airway_label_swap(out: Path) -> list[Path]:
    donors = list(AIRWAY)
    fig, ax = plt.subplots(figsize=(13, 7.5))
    fig.subplots_adjust(left=0.09, right=0.96, top=0.78, bottom=0.2)
    w = 0.34
    for i, d in enumerate(donors):
        alb, albdex, dex = AIRWAY[d]
        for off, v, col, lab in (
            (-w / 2, alb, OTHER, 'Labelled "albuterol"'),
            (w / 2, albdex, OURS, 'Labelled "albuterol + dex"'),
        ):
            ax.bar(i + off, v, width=w, color=col, label=lab if i == 0 else None)
            ax.text(i + off, max(v, 0) + 0.12, f"{v:.2f}", ha="center", va="bottom",
                    fontsize=15, fontweight="bold", zorder=5,
                    bbox={"facecolor": BG, "edgecolor": "none", "pad": 1.5})
        ax.plot([i - w - 0.04, i + w + 0.04], [dex, dex], color=INK, lw=2, ls=(0, (4, 2)),
                zorder=1,
                label="Dex-only sample, for scale" if i == 0 else None)
        if d in AIRWAY_SWAPPED:
            ax.text(i, 4.3, "SWAPPED", ha="center", fontsize=16, fontweight="bold",
                    color="#B33A00")
    ax.set_xticks(range(len(donors)))
    ax.set_xticklabels(donors)
    ax.set_ylim(-0.4, 4.7)
    ax.set_ylabel("Dexamethasone-signature score")
    ax.set_xlabel("Donor")
    ax.legend(loc="upper center", bbox_to_anchor=(0.5, -0.14), ncol=3, fontsize=13,
              frameon=False)
    _title(fig, 'In 2 of 4 donors the "albuterol" sample carries the full dex response',
           "Airway dataset (GSE52778). Inferred from the data alone; not confirmed by the "
           "dataset authors. Score: dex signature vs the donor's untreated sample.")
    return _save(fig, out, "airway_label_swap")


# ---------------------------------------------------------------- calibration


def chart_predictor_calibration(path: Path, out: Path) -> list[Path]:
    methods = json.loads(path.read_text(encoding="utf-8"))["methods"]
    ll = {
        (m, s): methods[m][s]["stated"]["log_loss"]
        for m, _ in PREDICTORS
        if m in methods
        for s in ("test", "shift")
        if s in methods[m] and "stated" in methods[m][s]
    }
    fig, ax = plt.subplots(figsize=(13, 7.5))
    fig.subplots_adjust(left=0.08, right=0.96, top=0.74, bottom=0.14)
    w = 0.36
    shown = [(m, lab) for m, lab in PREDICTORS if (m, "test") in ll]
    for i, (m, _) in enumerate(shown):
        col = OURS if m == "finetuned" else OTHER
        for off, s, hatch in ((-w / 2, "test", None), (w / 2, "shift", "///")):
            v = ll.get((m, s))
            if v is None:
                continue
            ax.bar(i + off, v, width=w, color=col, hatch=hatch,
                   edgecolor="white" if hatch else col, lw=0)
            ax.text(i + off, v + 0.012, f"{v:.2f}", ha="center", va="bottom", fontsize=14,
                    fontweight="bold")
            ax.text(i + off, 0.02, s, ha="center", va="bottom", fontsize=12,
                    color="white" if col == OURS else INK)
    ax.set_xticks(range(len(shown)))
    ax.set_xticklabels([lab for _, lab in shown])
    ax.set_ylabel("Log loss (nats, lower is better)")
    ax.set_ylim(0, max(ll.values()) * 1.15)
    t, a = ll.get(("finetuned", "test")), ll.get(("library", "test"))
    ts, as_ = ll.get(("finetuned", "shift")), ll.get(("library", "shift"))
    if None not in (t, a, ts, as_):
        title = (f"Fine-tuning beats the stated rows in distribution ({t:.2f} vs {a:.2f}), "
                 f"but only ties them under shift ({ts:.2f} vs {as_:.2f})")
    else:
        title = "Predictor log loss on the stated-row forks"
    fig.text(0.04, 0.955, "\n".join(_wrap(title, 62)), fontsize=20, fontweight="bold",
             ha="left", va="top", linespacing=1.15)
    fig.text(0.04, 0.84, "Synthetic cases, stated-row forks only (sample_labels, "
             "group_direction). test = training distribution; shift = weaker effects or 3 "
             "replicates.", fontsize=13, color="#555555", ha="left", va="top")
    return _save(fig, out, "predictor_calibration")


# ---------------------------------------------------------------- main


def build(task9: list[Path], calibration: Path, out: Path,
          faults: Path = DEFAULT_FAULTS, reruns: list[Path] | None = None,
          rerun_faults: Path = DEFAULT_RERUN_FAULTS) -> list[Path]:
    _style()
    made: list[Path] = []
    runs, used = load_task9(task9)
    rows = json.loads(faults.read_text(encoding="utf-8")) if faults.is_file() else []
    fault_of = {r["case"]: r["fault"] for r in rows}
    rerun_runs, _ = load_task9(reruns or [])
    rerun_rows = (json.loads(rerun_faults.read_text(encoding="utf-8"))
                  if rerun_runs and rerun_faults.is_file() else None)
    if runs and fault_of:
        print(f"task9: using {', '.join(str(p) for p in used)} and {faults}")
        made += chart_task9_swarm_vs_baseline(runs, fault_of, out, rerun_runs or None)
        made += chart_task9_per_case(runs, fault_of, out, rerun_runs or None)
        made += chart_task9_fault_detection(rows, runs, out, rerun_rows)
    else:
        print("skipped the task9 charts: need results.json "
              f"({', '.join(str(p) for p in task9)}) and {faults}")
    made += chart_fault_detection(out)
    made += chart_airway_label_swap(out)
    if calibration.is_file():
        made += chart_predictor_calibration(calibration, out)
    else:
        print(f"skipped predictor_calibration: {calibration} not found")
    for p in made:
        print(f"wrote {p}")
    return made


def main() -> None:
    ap = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    ap.add_argument("--task9", nargs="*", type=Path, default=DEFAULT_TASK9,
                    help="results.json file(s) from eval/run_task9_arms.py; each file is one case")
    ap.add_argument("--faults", type=Path, default=DEFAULT_FAULTS,
                    help="fault_detection.json from eval.suites.task9.score_faults")
    ap.add_argument("--reruns", nargs="*", type=Path, default=DEFAULT_RERUNS,
                    help="results.json of baseline runs repeated after a harness fix (shown apart)")
    ap.add_argument("--calibration", type=Path, default=DEFAULT_CALIBRATION)
    ap.add_argument("--out", type=Path, default=DEFAULT_OUT)
    args = ap.parse_args()
    build(args.task9, args.calibration, args.out, args.faults, args.reruns)


if __name__ == "__main__":
    main()
