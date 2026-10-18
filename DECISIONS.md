# Decisions — New Venture

Append-only. One line per decision: date, decision, the reason as given, what it
replaces. A decision that changes an earlier one gets a new line; the old line stays.
Cross-venture decisions live in `atlas-os/DECISIONS.md`; the ones that shape this
product are repeated here with their date.

| Date | Decision | Reason, as given | Replaces |
|---|---|---|---|
| 2026-10-13 | New Venture is started now, as a concept and a product: the founder feeds it his ideas, it is developed while he uses it, launched when he says so. | "It's both a need for me and a service for me to offer." | Waiting until the artist platform has its first testers |
| 2026-10-13 | First customers: a person or founder with an idea, and an existing business with an idea. Not innovation environments for now. The founder is the first and most important user. | "A founder or existing business"; "not the innovation environments now"; "for me … it's the most important". | — |
| 2026-10-13 | The first answer is free. What costs money follows the sketch. | "It has to be a free … it's defined there." | — |
| 2026-10-13 | Built from the framework that exists: the method, the platform core, the shared back end. | "Build from the framework." | Building it from the project folder on the Mac |
| 2026-10-13 | Online on a subdomain of aintegration.org as a temporary home; its own front door later. | "so I can actually use it and promote it". | Living only as a project on the Mac |
| 2026-10-13 | Offered as an additional service to users of any product on the framework. | "no matter what product they're using … they will also be able to add this". | — |
| 2026-10-18 | The product has the core framework features and its own; it is built as its own repo on the platform core, from `docs/HANDOFF.md`. | "The New Venture product will have the core framework features and its own." | The 13 Oct recommendation of one platform codebase for all products |
| 2026-10-18 | The build starts now (B0, B1), without waiting for decisions D1–D3; their defaults in HANDOFF §10 apply meanwhile. | "please do it for me". | "Discussed before anything goes to GitHub" (13 Oct) |
| 2026-10-18 | The AI engine is one core module, built once (by whichever product gets there first); this product runs without AI until then and declares its tasks on it. | HANDOFF §3.4; the same design existed twice (connectors spec §15, InvestX agents design). | — |
| 2026-10-18 | The admin/audit core SQL is cut once, here, as `core_007_admin_audit.sql`, and pushed to `platform-core`; InvestX takes the file instead of cutting again. | HANDOFF §3.1; InvestX PR #1 decided the same cut the same day. | A hand-stripped copy per product |
| 2026-10-18 | The product replaces the cards file as the record for the founder's own ventures only after exit test 2 (two weeks of daily use). | HANDOFF §10 D9. | — |
| 2026-10-18 | The plan-reads fix (artist-platform PR #1's migration 018: `is_entitled` / `effective_plan_id` answer only for accounts the caller may read) is core and is taken here as migration 007, ahead of its merge in Mainfloor. | The suite showed any signed-in person, and visitors, could read any account's plan status with the core as it stood in `platform-core`. | — |
