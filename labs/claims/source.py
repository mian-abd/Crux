"""The source paper and the ``claims.source`` event payload.

Love, Huber & Anders (2014) is open access under CC BY 4.0. The excerpt below is our
paraphrase of its Methods, not a quotation; each claim's ``quote`` is a substring of that
paraphrase (empty for the planted claim, which the paper does not make).

``planted`` marks the claim we added as a known falsehood. It is shown in the UI after the
fact for transparency; agents never read it (it is not in the brief, the questions or the
options).
"""

from __future__ import annotations

from labs.claims.library import CLAIMS

TITLE = "Moderated estimation of fold change and dispersion for RNA-seq data with DESeq2"
CITATION = "Love, Huber & Anders (2014) Genome Biology 15:550"
URL = "https://doi.org/10.1186/s13059-014-0550-8"
LICENSE = "CC BY 4.0"
EXCERPT = (
    "Paraphrase of the Methods: DESeq2 models the read count of gene i in sample j as "
    "negative binomial with mean μij and a gene-specific dispersion αi, so the variance is "
    "μij + αi·μij². With few replicates, per-gene dispersion estimates are noisy, so DESeq2 "
    "shrinks them toward a trend fitted across genes before testing. Log fold changes are "
    "tested with a Wald test, and p-values are adjusted with the Benjamini–Hochberg "
    "procedure, which controls the false discovery rate."
)

# question id -> (quote from EXCERPT or "", planted)
SOURCE: dict[str, tuple[str, bool]] = {
    "claim-nb-variance": ("the variance is μij + αi·μij²", False),
    "claim-wald-calibration": ("Log fold changes are tested with a Wald test", False),
    "claim-bh-fdr": (
        "the Benjamini–Hochberg procedure, which controls the false discovery rate",
        False,
    ),
    "claim-bh-fwer": ("", True),
}


def paper() -> dict:
    """Bibliographic facts about the source (what the lab's profile reports)."""
    return {"title": TITLE, "citation": CITATION, "url": URL, "license": LICENSE}


def source_payload() -> dict:
    """The ``claims.source`` payload (docs/EVENTS.md); field names are a UI contract."""
    return {
        **paper(),
        "excerpt": EXCERPT,
        "claims": [
            {
                "question_id": c.id,
                "claim": c.claim,
                "quote": SOURCE[c.id][0],
                "kind": c.kind,
                "planted": SOURCE[c.id][1],
            }
            for c in CLAIMS
        ],
    }
