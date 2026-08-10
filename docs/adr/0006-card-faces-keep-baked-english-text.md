# 0006 — Card faces keep the baked-in English rules text

Every card PNG (903×1296) has its English effect text baked into the lower third of the image. The art's provenance and license are unconfirmed (DESIGN.md — the set stays private, LAN play only). The rest of the UI localizes to zh-Hans (ADR-0004).

Decision: card faces keep the art as-is — the baked English text is accepted flavor. Card names, tooltips, the abilities reference, and the log all localize; the abilities list is the authoritative localizable rules surface. A CSS/React overlay covering the baked text band was considered and deferred: it's a cheap change whenever the art license situation resolves or the faces become a real problem, so this is not a commitment.

Status: accepted. Source: grilling session Q4 (2025).
