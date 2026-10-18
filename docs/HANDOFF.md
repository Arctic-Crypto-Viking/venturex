# New Venture — build handoff for Claude Code

*Written 18 Oct 2026 from the record as it stood that day: `platform-core` at `3390113` (17 Oct), `artist-platform` `main` at `3ff3f30` (17 Oct, 22 migration files numbered up to 026; 015–018 unused) with open pull requests #1, #26 and #27, `investx` pull request #1 (18 Oct), `atlas-os` `main` at `2c0ffb7` with pull request #1 open, the "Operating guideline" document (New Venture tab, rev. 9; Inbox, rev. 10), the project docs of the pasai ventures room (concept 3 Oct, triage protocol, venture cards, competition analysis 3 Oct) and the founder's decisions of 13 Oct 2026 (`DECISIONS.md` in `atlas-os` pull request #1). Where this file and a source disagree, the later source wins; say so when you find one.*

*Who reads this: the Claude Code session that builds the product, in the product's own repo. "The founder" is the owner of these repos. His name with Claude is Atlas; that name never appears in anything a customer or tester can see — not as sender, signature, seed data or example.*

---

## 0 · Read this first

1. **What to build.** New Venture is the door every idea goes through and the workspace behind it. The door gives an answer — GO, PARKED or KILLED — with the reason in writing and the test that would change it. A GO opens a workspace that takes the venture through eight stages to its first paying customer. The founder is its first user; then people with an idea and existing businesses with an idea.
2. **Build it on what exists; write only what is New Venture.** The platform core (`platform-core`, pulled in at `core/`) gives sign-in, accounts and members, plans and entitlements, payments recorded by hand, the admin console, five looks, five languages, the feedback board, invite-a-tester and delete-account. Mainfloor (`artist-platform`) is the finished reference product: copy its patterns (§3). The method is the `venture-os` plugin in `atlas-os` (§4): the product turns its files into a database. The AI engine and the connector layer are core work that already exists or is designed (§3.4, §3.5): never write a second one here.
3. **Order.** Step 1 is the free door, with no AI (the person answers, the rules decide). Step 2 is the workspace. Step 3 is AI inside. Build order with exit tests in §8. Stop after each build step and report; the founder runs the exit test.
4. **What a session never does without the founder:** merge, deploy, apply a migration to a hosted database, create a Supabase or Vercel project, sign up for or pay for anything, publish a price, send mail to a stranger. Secrets never enter the repo (`.env.local` only).
5. **Decisions still open** are in §10, each with the default to use until the founder answers. Work does not stop for them unless the default is marked *stop*.

---

## 1 · What New Venture is — decided, and what is still an assumption

### 1.1 Decided (date, source)

| Decision | Date · source |
|---|---|
| New Venture starts now, as a concept and a product: the founder feeds it his ideas, it is developed while he uses it, launched when he says so. | 13 Oct · `atlas-os` `DECISIONS.md` |
| First customers: a person or founder with an idea, and an existing business with an idea for a new product or service. Not innovation environments for now. The founder is the first and most important user. | 13 Oct · same |
| The first answer is free. What costs money follows the sketch. | 13 Oct · same |
| Built from the framework that exists (the method, the platform core, the shared back end), not from the project folder on the Mac. | 13 Oct · same |
| Online on a subdomain of `aintegration.org` as a temporary home; its own front door later. | 13 Oct · same |
| Offered as an additional service to users of any product on the framework. | 13 Oct · same (how: §10 D6) |
| The platform first, New Venture where every venture starts and is verified, the ventures as its products, launched only on verified success. | 13 Oct · `atlas-os` `CLAUDE.md` |
| The product has the core framework features and its own. | 18 Oct · the founder, in the session that wrote this file |
| The door: five kill gates, one No kills; survivors score /25; GO ≥ 18, PARKED 13–17 with a written revival trigger, KILLED below 13 or at a gate; every idea ends in exactly one state; nothing goes back on the list; LIVE capped at three, one gets the hours; every triage ends with one test this week and a number set before it runs. | 23 Sep · `portfolio/venture-triage-protocol.md`; 3 Oct · `new-venture-concept.md` |
| The path: eight stages, each ending in a decision; the exit test of each stage is the method's gate (table in §4.3). A venture stands at the earliest stage whose "Founder does" step is not on record as done. A verdict covers stages 1 and 2. | 3 Oct · concept; 10 Oct · `claude/project-instructions.md` |
| The founder's "Atlas" name is between him and Claude only. | 13 Oct · `DECISIONS.md` |
| Every user on every product gets a person profile (first name, last name, contact details; later linked social accounts). Core, not built (R-006, R-007). | 13 Oct · same |
| Every screen of Mainfloor is shown in full on every device; an app later. | 13 Oct · same (stated for Mainfloor; that it holds for every product on the core is recorded there as an assumption, to confirm — §1.2) |

### 1.2 Assumptions, in the open (never state them as facts to a customer)

- That either customer group pays for an answer. The best-evidenced tool that sells answers alone took USD 29,917 since January 2026 (competition analysis, 3 Oct).
- The prices in the sketch — EUR 149 per verdict (48 h, founder review +EUR 200) and EUR 990 per 30 days of Develop — are proposals. The first five paying customers set the real prices. Nothing in this file sets a price, and no screen shows one until the founder decides (§10 D3).
- That the sketch's five intake lines (§4.1, from its first version of 30 Sep) are still the five on the design page of 9 Oct (§10 D4).
- The middle levels of the worded anchors (§4.2) are proposals; the sketch names only the ends (§10 D5).
- That "every screen in full on every device" holds for every product on the core, as it does for Mainfloor (recorded 13 Oct as an assumption to confirm). This file builds as if it does.

### 1.3 New Venture on its own door

By its own rules New Venture is **PARKED**: 16/25 on 30 Sep, 14/25 on 3 Oct (demand 2, time to first euro 4, price point 3, distribution edge 2, margin 3), because no stranger has paid. The sketch says no app gets built on a parked idea. Both hold if the first build is only what the founder uses himself — the free door and the workspace for his own ventures — and the paid test with strangers (§8, B8) decides everything after it. Revival trigger on record: five of fifty strangers pre-pay EUR 149 within seven days, still unrefunded on day 21 (fail: 0–1; 2–4: one re-run with exactly one thing changed). Before it runs: a named seller and the EU basics (AI disclosure, withdrawal rights, claims, VAT).

---

## 2 · The landscape on 18 Oct 2026 — what exists where

| Thing | Where | State |
|---|---|---|
| Platform core (code) | `github.com/Arctic-Crypto-Viking/platform-core`, consumed as a git subtree at `core/` | Built 14–17 Oct: looks + design selector, sign-in, admin console, entitlement/auth helpers, i18n (en · nb · es · de · fr), feedback board, invite a tester, delete account. `core/README.md` has "Add core to a new product". |
| Platform core (SQL) | `platform-core/supabase/migrations/core_001_tenancy.sql`, `core_003_entitlements_billing.sql`, `core_020_admin_delete_account.sql`, `core_024_feedback.sql` | Verbatim copies. **Gap:** the admin/audit SQL the admin console calls (`audit_log`, `log_audit`, `feature_flags` + `flag_enabled()`, `app.assert_superadmin`, `admin_list_accounts`, `admin_account_detail`, view-as, `admin_set_*`, `owner_setting`, hooks `app.overview_extra` / `app.admin_account_extra`) exists only as `artist-platform` migrations 007, 009 and 014 with artist code mixed in. **Done on 18 Oct 2026 (13:27 UTC) by the InvestX session:** platform-core branch `core/agents-module-and-admin-cut` (platform-core PR #1) holds the cut as `core_007_admin_audit.sql` + `core_009_admin_rpcs.sql`, the agents module `core_030_agents.sql` + `src/agents/{types,runner}.ts`, and (added by the New Venture session the same day) `core_018_plan_reads.sql`. New Venture takes 007, 009 and 018 verbatim; a second cut made in the New Venture repo an hour later was dropped. |
| Mainfloor, the artist platform | `github.com/Arctic-Crypto-Viking/artist-platform`, live at `app.mainfloor.app` | 22 migration files on `main`, numbered up to 026 (015–018 unused); 020–026 reported applied in production (PR #26). The reference product for every pattern in §3.2. |
| Connector layer (AI assistants → product via `/mcp`; product → Gmail; the Data API gate; auth triggers) | `artist-platform` PR #1 (draft, branch `proposal/platform-connectors`, head `8e50404`), `docs/CONNECTORS-SPEC.md` | Built and reviewed on the 13 Oct `main`, **before** the core extraction. Before it merges: rebase onto `core/` (its `src/lib/mcp/*`, `/oauth/consent`, `src/lib/auth.ts` change belong in core), renumber its migrations 015–019 after the last number on `main` (027 is already taken by the security pull request PR #27 announces), renumber its setup-guide part (13 → 15, since 13 and 14 are now the digest and the feedback board). Then port to `platform-core`. New Venture takes it from core, flags off (§3.5). |
| Model access / the AI engine | **Built as a core module on 18 Oct 2026 (platform-core PR #1): `core_030_agents.sql` — `agent_definitions`, `agents` (quota `agents.max` by trigger), `agent_runs` (tokens and cost), `agent_items`, `collector_snapshots`, the social data collector tables, RPCs `create_agent` / `set_agent_status` / `agent_quota` / `admin_agent_costs` — and `src/agents/{types,runner}.ts` (`AgentRunner` contract, `runAgent()`). New Venture does not apply it before B7.** Designed earlier: `CONNECTORS-SPEC.md` §15 (model gateway, `defineTask`, model per task as a setting, `ai.<task>` quotas, flag `ai.enabled`). Designed in more detail for InvestX: `investx` PR #1 `docs/agents-architecture.md` §4 (per-user agent runs, context pack from the database only, versioned prompt templates, `agent_runs` with tokens/cost/model/template version, model per tier). | Not built anywhere. One engine, in core, built once with its first real task (§3.4). |
| The method | `atlas-os/plugins/venture-os` (commands `/new-venture`, `/validate`, `/weekly-review`, `/ship`; agents; skills `venture-validation-gates`, `assumption-ledger`, `minimum-sellable-product`, `venture-context`, and `operating-rules` in PR #1; templates) | v1.1.0 on `main`. The product makes this a database with screens; the plugin keeps working on repos. |
| The sketch | "New Venture — service concept" (Design artifact, 3 Oct, updated 9 Oct): landing page, backbone map, six phone screens (intake → gates → score → verdict → GO workspace / NO-GO), proposed prices. The first version of the sketch (`Design.pdf`, 30 Sep) is in `atlas-os` PR #1 `docs/research/2026-09-30-new-venture-sketch-first-version.md`. | Read it for screen wording and layout before building the door. The sketch wins over this file on screen copy. |
| The write-ups | `atlas-os` PR #1 `docs/new-venture.md` (what it is, exists, missing; the seven decisions; Norway; Claude inside) and the Operating guideline document (`https://claude.ai/code/artifact/201a6030-2405-4fd0-9ada-b7f6bf938810`, tabs New Venture, Conscious Pulse, Inbox) | The Conscious Pulse tab is the first real verdict through the door (13 Oct, PARKED 13/25, trigger and test written): use it as the sample record when designing the tables and the verdict screen. |
| The rules and the record | `portfolio/venture-triage-protocol.md`, `portfolio/venture-cards-v1.md`, `claude/project-instructions.md`, `portfolio/new-venture-concept.md`, `portfolio/new-venture-competition-analysis.md` (pasai ventures project docs) | The cards file is today's record of the founder's own ventures (one file, edited in place). When the product passes exit test B4 it becomes the record and the cards file points to it (§10 D9). |
| InvestX | `github.com/Arctic-Crypto-Viking/investx`: a snapshot of the live claude.ai page and jobs (14 Oct), PR #1 with the agents architecture and `docs/mainfloor-reuse.md` (18 Oct) | No app code yet; to be built on the same core by the same recipe. Its `mainfloor-reuse.md` is the closest precedent for this handoff and is consistent with it. |
| The venture repos | `tanktopman`, `djtranceman` (GitHub); Conscious Pulse has files but no repo yet | Each carries `CLAUDE.md`, `STATE.md`, `DECISIONS.md`, `assumptions.md`, `offer.md` — the files the product's tables mirror (§5). |

---

## 3 · Reuse — what is taken as is, what is copied by pattern, what is not written here

### 3.1 From platform core, as is (pull in; never fork into `src/`)

Follow `core/README.md` "Add core to a new product", steps 1–9, exactly. It gives, without writing a line: `core/src/app/{login,auth,admin,api,app/feedback}` (route files in the product are one-line re-exports), `core/src/lib/{auth,env,entitlements,safe-next,theme,i18n}`, the three Supabase clients, `createProxy`, `ui.tsx`, the five looks and the Look/Dark-Bright/Language pickers, `sign-in-link.mjs` and the dev sign-in script, the feedback board, invite a tester, delete account, `/api/me/entitlements`, `/api/internal/overview`.

SQL, copied verbatim from `platform-core/supabase/migrations/` into this product's `supabase/migrations/` as its first migrations, in this order: `core_001`, `core_003`, **`core_007_admin_audit`** (the cut named above), `core_020`, `core_024`. If `core_007` does not exist yet when this product is built, this build makes the cut: take `artist-platform` 007 + 009 + 014 and remove the artist code they carry: in 009 `app.guard_identity_limit`, `app.log_stage_change`, `public.set_profile_stage`, and the `artist_identities` join and `identity_names` column in `admin_list_accounts`; in 007 and 014 the `internal_overview()` / `app.overview_extra()` bodies (captures, sources, founding seats, campaigns) become the empty hook default; in 014 `app.admin_account_extra()` and the `identities` key `admin_account_detail()` builds inline from `artist_identities` / `artist_profiles` move behind the hook. Keep `audit_log`, `log_audit`, `feature_flags` + `flag_enabled()` (007), `app.assert_superadmin` and the generalised admin RPCs of 014. (`create_account_with_identity` is in 002 and stays Mainfloor's.) Run the RLS suite green, and push the file to `platform-core` with the subtree (`core/README.md` "Changing core"), so InvestX takes it instead of cutting it again. PLATFORM-CORE §4 rule 1: a core SQL change lands in every repo that carries it in the same week.

The product contract: `src/product.tsx` (`ProductConfig` from `core/src/product.ts`) and `src/brand.ts` (`ProductBrand`: the one place the name and addresses are written). Model both on Mainfloor's files of the same name.

Note a drift: `docs/PLATFORM-CORE.md` §2 lists `create_account` / `ensure_personal_account` as core RPCs. They do not exist in code. Each product writes its own signup RPC on the pattern of Mainfloor's `create_account_with_identity` (migration 002: slug, default plan, owner membership, optional trial from `system_settings.signup`). Here it is `create_venture` (§5.3).

### 3.2 From Mainfloor, by pattern (copy the file, rename the nouns, keep the idiom)

| Mainfloor, finished and in production | New Venture equivalent |
|---|---|
| `/onboarding`: seven screens, one question per screen, plain `<form>` server actions (`useActionState`), progress dots, phone first, choice lists in `src/lib/wizard.ts` typed to the check constraints, `WizardState` saved on the account; the last screen asks before anything goes public | **The door**: intake → five gates → five scores → verdict, one question per screen (§6). Choice lists and anchors in `src/lib/door.ts`. Before sign-in the answers live in one HttpOnly cookie; on "Save" they become the venture (§5.3). |
| `opportunity_fit_scores` + `compute_fit_score` (rules v1, reasons, blockers, bands, a rules version) | **`door_runs`**: the five gate answers and five scores with their evidence, the total, the state, the rules version (§5.2). Every re-score is a new row; nothing is overwritten. |
| `opportunity_states` (one state per item, reasons) | The venture's state on `ventures`, changed only through `set_venture_state` (§5.4), which enforces the cap and the kill rule. |
| `artist_identities` + `app.guard_identity_limit` trigger (`identity.max`) | `ventures` per owner + `app.guard_venture_limits` trigger: saved ventures per owner (`venture.ventures_max`), LIVE at most three per owner, exactly one `has_hours` per owner. The quota is enforced in the database; the UI only shows "n of m". |
| `deals` / `deal_stage_history` / `app.deal_stage_after` (005; `app.log_stage_change` in 002/009 does the same for profile stages) | `stage_progress` with a history trigger: every stage change dated, for "weeks at stage" and stalls. |
| `/api/cron/digest` + `src/lib/digest.ts`: `CRON_SECRET` bearer, `maxDuration 60`, the claim row (`last_sent_at` moved before sending so a duplicate call sends nothing), Resend from its own subdomain | **`/api/cron/weekly-review`** (§7): Monday mail per owner — the test due and its number, stalled ventures, the cap. Same guard, same claim idiom, same mail path. Vercel Hobby runs a cron once a day; that is enough here. |
| `src/lib/plan-summary.ts` with `LIVE_FEATURES` | Same file, same rule: anything a customer reads about a plan names only built features; a key is added in the change that ships the feature. |
| `src/i18n/*.ts` (English typed, `tsc` fails on a missing key), `getDict()` on the server | Same. Norwegian (`nb`) and English from day one; the other three languages carry English until translated (the founder reviews the gate wording in Norwegian before testers see it). |
| Public views for public reads (migration 019: `public_identities`, `public_gigs`; `revoke all` + `grant select` on every view an API role reads) | The **forecast log** page (§4.5) reads a view `public_forecasts`, never the tables; only ventures whose owner switched `forecast_public` on. |
| `/privacy` with `company` in `src/brand.ts`; `admin.testerNote`; `admin.storageBuckets` | Same three. Data controller: §10 D2. No Storage bucket in v0 (`storageBuckets: []`). |
| `src/app/admin/_product/{account-panel,view-as}.tsx`, `overviewTiles` | Account panel: the ventures of the account with state, score, stage, test due. Tiles: ventures by state, tests due this week, verdicts in the last seven days, stalled ventures. |
| RLS suite `supabase/tests/rls_isolation.sql` + `supabase/tests/local/run.sh` (the auth shim comes with `core/`: `core/supabase/tests/local/auth_shim.sql`, which `run.sh` reads) | Copy the two files; keep the zero-leak scan over every `account_id` table; add the product's negative checks (§8 B1). |

What stays Mainfloor-only and is not copied: identities and the EPK, Radar sources and curation, gigs and ICS, the outreach pipeline and templates, artist domains.

### 3.3 From the method (`venture-os`), as the content

The gates, the score anchors, the ledger rules, the offer one-pager fields, the minimum-sellable-product scope brake, the `/weekly-review` logic (stalled = same gate for more than four weeks; rank by evidence; a kill candidate has failed the same gate twice or had no test run in a month) and the `/ship` checklist are the product's rules and copy. Lift the wording from the skill files; do not paraphrase them into something new. The eight stages of the sketch are the product's names; the method's gates are the exit tests (§4.3). Never show a bare "Gate 3" to a customer.

### 3.4 The AI engine — not written here

Two designs of the same thing exist: `CONNECTORS-SPEC.md` §15 (core: one model gateway, tasks declared per product with `defineTask`, the model per task as a setting, gating and cost through `consume_quota`, flag `ai.enabled`) and `investx/docs/agents-architecture.md` §4 (per-user agent runs: context pack from the database only, versioned prompt templates in `prompts/`, `agent_runs` with tokens, cost, model and template version, model per tier). They are one core module. Rule: **it is built once, in core.** On 18 Oct 2026 the InvestX session put the first version in `platform-core` (`core_030_agents.sql`, `src/agents/*`, PR #1 there); this product declares its tasks on it at B7 and writes no engine of its own. New Venture's tasks, when the engine exists: `verdict.scan` (a market scan behind each score: who pays for a worse version, at what price, via which channel), `stage.draft` (the stage's deliverable from the venture's record: problem statement, pre-sale message, offer page, launch plan), `review.weekly` (the Monday review written from the tables). Each is a task row with its own quota key (`venture.ai_verdicts_per_month` …), its own AI disclosure line on the screen, and `/privacy` names the provider before the first call. Until then the product runs without AI, and the door is complete without it.

### 3.5 The connector layer — not written here

Taken from core once `artist-platform` PR #1 is rebased, merged and ported (§2). This product's part is `src/mcp/product.ts` registering declared tools in `src/mcp/tools/` (rule 12 of Mainfloor's `CLAUDE.md` on the `proposal/platform-connectors` branch: `defineTool()`, one effect each, run as the caller, gated by `mcp.read` / `mcp.write`, pass `npm run check:mcp` — the script and `npm test` arrive with that branch): `venture_list`, `venture_card_get`, `door_run_get`, `evidence_add`, `decision_add`, `test_set` (sets the week's test with its number), `test_result_record`. Nothing an assistant can call sends mail, pays, deletes or changes a state. The `venture-os` commands can then read the product instead of repo files (`/validate` on a venture in the product). Flags `mcp.enabled` / `connect.enabled` stay off until the founder's own test.

### 3.6 Not built in this product, by decision

A checkout or any automated payment rail. Core records payments by hand (`record_manual_payment` in `core_003` moves `paid_through`); the admin form for it is not built in any product yet (Mainfloor's go-live stage 3 names it), so the first money is recorded by that function, and the form is core work when the first payment comes. Reselling Claude subscriptions or signing in with Claude (not allowed by Anthropic's terms, checked 13 Oct). A second cards file, tracker or dashboard. A per-venture Claude Code automation ("the platform develops it" as agents) before the workspace has two weeks of the founder's daily use.

---

## 4 · The rules as code — the door, the path, the record

The rules are code constants with a version (`DOOR_RULES_VERSION = 1` in `src/lib/door.ts`), stored on every `door_runs` row. A rule change never silently re-scores an old run.

### 4.1 Intake — five lines

The sketch's five lines (first version, 30 Sep, page 2 "Step 1 of 4 · Your idea": "Describe it plainly. One line each. Vague answers get vague verdicts. Name specific people and specific money."), one per screen, each a short free-text answer:

1. The idea in one line.
2. Who has this problem. ("People who like X" is not a customer — push back once and ask for a findable person, as the `/new-venture` command does.)
3. What they use today.
4. What you could ship in 30 days.
5. Your unfair way to reach them.

Each answer is stored as given and shown beside the gate or score it feeds (3 → gate 2 and demand; 4 → gate 3; 5 → distribution edge). On "Save" two facts the record needs are asked once, not at the door: hours per week available, and market and language (they drive the cap, the hours and the country rules). The `/new-venture` command's third question — what you believe true that you have not tested — becomes the first entry of the ledger on the workspace, not an intake line.

### 4.2 The door — gates, scores, verdict

**Gates** (binary, one per screen, about 30 seconds each, in this order; the first No stops the run):

| # | Question, as the protocol words it | Kills |
|---|---|---|
| 1 | Can I reach 10 potential buyers this week without anyone's permission — no partnership, no platform approval, no gatekeeper? | ideas with no reachable demand side |
| 2 | Does someone already pay money for a worse version of this? | category creation |
| 3 | Can I ship something sellable in ≤ 30 days of solo work? | projects disguised as products |
| 4 | Does it still earn if I am not personally delivering each unit? | freelancing disguised as a business |
| 5 | Am I willing to still be working on this in 18 months? | the enthusiasm spike |

Each answer carries one line of evidence (free text) and, on a No, the run ends: state KILLED, `killed_at_gate = n`, the line recorded. The kill screen shows the gate and the line and says, in the protocol's words, that a kill in thirty seconds is a good outcome.

**Scores** (survivors only; each 1–5, one per screen, with the anchor wording shown as the choices; the sketch's screen says "Score what you can prove, not what you hope. Each level has a definition — pick the one you can defend." and names the ends of each scale: demand *1 opinion · 5 someone paid*, time *1 over 90 days · 5 under 14*, price point *1 cheap and frequent · 5 high and recurring*, distribution edge *1 none yet · 5 buyers come to you*, margin *1 hours per unit · 5 near zero*):

| Dimension | Anchors |
|---|---|
| Evidence of demand | 1 my opinion, or "cool idea" · 2 search volume, forum complaints, a competitor exists · 3 specific named people described the problem unprompted · 4 someone asked me to build it or asked the price · 5 someone has paid, pre-paid or signed something. *Rule (competition analysis, move 2: demand is capped at 2 without behavioural evidence):* 3 or above needs a named person, 5 needs a payment on record — the screen asks for the name or the payment and stores it as evidence; without it the score is capped at 2 and the screen says why. *(The cap is the analysis's; what counts as evidence per level is a proposal, §10 D5.)* |
| Time to first euro | Days from **today** to money in the account: 5 under 14 days · 4 14–30 · 3 31–60 · 2 61–90 · 1 over 90. *(5 and 1 are the protocol's; the middle anchors are a proposal, §10 D5.)* |
| Price point | What one customer pays, per transaction or per month: 5 high and recurring · 4 recurring, modest · 3 mid-ticket, one-off · 2 low-ticket with repeat purchase · 1 cheap and frequent. *(The ends are the sketch's; the middle a proposal, §10 D5. The protocol's rule: score high-ticket or recurring above cheap-and-frequent.)* |
| Distribution edge | An unfair way to reach these buyers: 5 buyers come to you (a list or audience of them you own) · 4 a channel you are good at, with them in it · 3 a small audience, list, credential or relationship you already hold · 2 a channel you could learn · 1 none yet ("I'd figure out marketing"). *(The ends are the sketch's and the protocol's; the middle a proposal, §10 D5.)* |
| Margin and operational load | Gross margin after the work of fulfilment: 5 near zero — digital or productised · 4 digital with some service · 3 service with leverage · 2 physical with some leverage · 1 hours per unit — handmade. *(The ends are the sketch's; the middle a proposal, §10 D5. The protocol's rule: physical and handmade score low almost regardless of price.)* |

**Verdict**, computed, never edited:

| Total | State | Must be written before the run is saved |
|---|---|---|
| 18–25 | **GO** → the venture is LIVE | this week's test: what, cost, deadline, pass number, fail number (§4.4) |
| 13–17 | **PARKED** | the revival trigger: the external event, as a number with a deadline ("15 orders from strangers in 7 days on 1,000 paid clicks"); "when I have time" is refused by validation |
| under 13, or a No at a gate | **KILLED** | the gate or the score, one line; shown on the kill list forever |

The verdict screen also shows, as the sketch's page 5 does, "where it is weak" (the lowest scores with their one-line reason) and, from the Conscious Pulse lesson: which scores are the person's own to correct (demand and distribution usually), what one point changes (the next threshold and how far it is), and — when the total sits within one point of a threshold — that it does ("At the bar. Live only until the pre-sale says otherwise."). The sketch's "Nothing is saved until you ask for a verdict" is the rule for the anonymous door (§6).

**Re-scoring.** A new `door_runs` row, never an edit. A KILLED venture is re-scored only with a `fact_changed` note (what stated fact about the world changed, with source and date); the screen refuses otherwise. A PARKED venture is re-scored when its trigger fires (the person records the trigger's result; the test with the number is the evidence).

### 4.3 The path — eight stages, the method's gates as exit tests

| # | Stage (the product's name) | Exit test (the method's gate) | Founder does |
|---|---|---|---|
| 1 | Clarify the customer problem | a customer you can find this week; five conversations where the problem came up unprompted, plus evidence of current spend or a workaround (gates 0 and 1) | names ten real people who have it |
| 2 | Research the market | a named channel, a cost to reach people, a size above the revenue floor (gate 2) | confirms the wedge |
| 3 | Validate willingness to pay | a number set in advance and hit, in money (gate 3) | sends the pre-sale; counts paid orders, not likes |
| 4 | Define the offer | the one-page offer: customer, problem, promise, deliverable, price, proof, risk reversal, objections, unit economics (gate 4) | picks the price the buyers confirmed |
| 5 | Minimum sellable product | a first paying customer, delivered to, who would recommend it (gate 5) | ships it to those who paid |
| 6 | Landing page or web app | built from the offer; part of gate 5 | approves; connects payments |
| 7 | Launch marketing and sales | one channel with three sales at a known, acceptable cost (gate 6) | talks to every buyer in week one |
| 8 | Document, automate, delegate | the recurring work written as a process; the most frequent step automated or delegated (gate 7) | hands off what should not be done by hand |

A GO lands at stage 3, because the verdict covers stages 1 and 2. A venture stands at the earliest stage whose "Founder does" step is not recorded as done, whatever is built later. Work that belongs to a later stage is shown as premature, in the method's words. Stall: more than four weeks at one stage.

### 4.4 Tests, the week and the cap

- A test is: what, cost, deadline, pass number, fail number, set **before** it runs (`set_at` precedes `started_at`; the numbers are immutable after `set_at`), result, result date, outcome (pass · fail · middle — the sketch's page 6 "Decided in advance": LIVE at 5 or more, PARKED at 2 to 4 with the trigger, killed below), and what changes (one thing changed on a re-run).
- One open test per venture. One **week test** per owner: the venture with the hours gets it. A PARKED venture's trigger is tested only if the owner opts in.
- Cap, per owner: at most three ventures LIVE; exactly one `has_hours`. A fourth GO asks which LIVE venture is parked or killed first; the screen does not let a fourth in. (Which one leaves is the owner's call; the rule has no default — §10 D8.)
- Money beats opinion: a payment, deposit, pre-order or signature outranks any interest. The ledger marks a claim `fact` only with a source and a date.
- Country rules per test, v0 as a static checklist shown before a test starts (`src/lib/test-rules.ts`): Norway — a shop may not charge a consumer before dispatch; reserve the payment and charge at dispatch (Forbrukertilsynet, Vipps reserve-and-capture, read 13 Oct); a regulated product (food, health, finance) needs a written rules check before its test; the EU basics before any pre-sale (AI disclosure, withdrawal rights, claims, VAT).

### 4.5 The forecast log (competition analysis, moves 1–3)

Every verdict is a forecast: the week's test, its pass number and deadline, logged before the result. Every result is scored against it. The log cannot be backdated, so it starts with the founder's own ventures. A public page per owner (`/f/[slug]`) shows the log for ventures the owner marks public, read through the view `public_forecasts`: state, score, the test, the number, the result. Off by default. This is the open position no competitor holds; it is cheap because the rows already exist.

### 4.6 The card — the read model

One view `venture_card` per venture, the decision layer, never a table. Two sources, merged: the record fields of `claude/project-instructions.md` "THE RECORD" (10 Oct, the later source) — state with basis (scored · declared) and date; gate results and score (latest run); stage with evidence; hours (`has_hours`, hours per week); the test in flight with its number and deadline; the revival trigger if PARKED; money in and committed; next date; "to confirm" (any status older than 14 days) — and the descriptive fields of the venture-cards template and the sketch's card (page 5, "v1 · date"): what it is, assets it owns, channel has, channel needs, calendar, unblocker. The descriptive six are columns on `ventures` (`assets`, `channel_has`, `channel_needs`, `calendar`, `unblocker`, with `title` as "what it is"), filled at the first verdict and kept current. The card is the venture's home screen, what `venture_card_get` returns, and — later — "Download the card as PDF" (sketch page 5; in `later.md`).

---

## 5 · Data model — vertical tables on the core

Tenant = venture = `accounts` row (PLATFORM-CORE §3). The owner's portfolio is the accounts they own (`getMyAccounts()`); the founder's "My ventures" is the superadmin's accounts list. Every table below carries `account_id`, RLS by `app.is_member(account_id)`, `created_at` / `updated_at` with `app.set_updated_at`, and — when the connector core lands — `select app.protect_from_oauth_clients('public.<table>')` (with `p_tool_writes => true` only for `evidence`, `decisions` and `tests`, the tables the write tools insert into). No table is written from the client except through its RPC or a members-only policy; states and the cap go through RPCs with `security definer`, `set search_path = ''`, and `perform app.assert_not_assistant()` once that function exists in core.

### 5.1 `ventures` — one row per account

`account_id` (pk, fk `accounts`), `title` (the idea in one line, intake line 1), `customer` (line 2), `uses_today` (line 3), `ship_in_30_days` (line 4), `unfair_reach` (line 5), `assets`, `channel_has`, `channel_needs`, `calendar`, `unblocker` (the card's descriptive fields, §4.6), `market`, `language`, `hours_per_week int`, `state text check in ('untriaged','live','parked','killed')`, `state_basis text check in ('scored','declared')`, `state_since date`, `state_reason text`, `has_hours boolean default false`, `stage smallint check 1–8`, `stage_since date`, `next_action text`, `next_date date`, `money_in_cents bigint default 0`, `committed_cents bigint default 0`, `committed_hours int`, `revival_trigger text`, `revival_number int`, `revival_deadline date`, `forecast_public boolean default false`, `latest_run_id uuid`.

Trigger `app.guard_venture_limits` (before insert or update of `state`, `has_hours`): per `owner_user_id` of the account — saved ventures ≤ `feature_value(venture.ventures_max)` of the owner's plan on the account being created (unlimited = −1), LIVE ≤ 3, `has_hours` true on at most one. Errors are the words the screen shows.

### 5.2 The door and the ledger

- **`door_runs`**: `id`, `account_id`, `rules_version int`, `intake jsonb` (the five lines), `gate_1 … gate_5 boolean`, `gate_1_note … gate_5_note text`, `killed_at_gate smallint`, `score_demand, score_time, score_price, score_edge, score_margin smallint check 1–5` (null when killed at a gate), `score_demand_evidence_id uuid` (fk `evidence`, required for demand ≥ 3), `total smallint` (generated), `state text` (computed by `compute_verdict(run)`), `fact_changed text` (required when the previous state was killed), `run_by uuid`, `created_at`. Immutable: no update policy, no update RPC.
- **`evidence`** — the assumption ledger: `id`, `account_id`, `kind text check in ('fact','assumption','killed')`, `claim text`, `source text`, `source_date date`, `impact smallint 1–5`, `uncertainty smallint 1–5`, `risk int` (generated, impact × uncertainty), `test_id uuid`, `status text check in ('open','promoted','killed')`, `promoted_from uuid`. Promotion from assumption to fact is a new row with `promoted_from`; a fact needs `source` and `source_date` (check constraint).
- **`decisions`**: `id`, `account_id`, `decided_on date`, `decision text`, `reason text`, `replaces text`. Append-only (no update or delete policy).
- **`tests`**: `id`, `account_id`, `what text`, `cost_cents bigint`, `currency`, `deadline date`, `pass_number int`, `fail_number int`, `set_at timestamptz`, `started_at`, `result_number int`, `result_at`, `outcome text check in ('pass','fail','middle')`, `changed_one_thing text`, `is_week_test boolean`, `status text check in ('open','done')`. Numbers and `what` are immutable after `set_at` (trigger). Partial unique index: one `open` test per account; one `is_week_test and status = 'open'` per owner (enforced in the RPC, since the owner is on `accounts`).
- **`stage_progress`**: `account_id`, `stage smallint`, `entered_at`, `founder_step_done_at`, `evidence text`, `exit_passed_at`; `stage_history` written by a trigger like Mainfloor's `log_stage_change`.
- **`offers`**: one per venture, the one-pager fields as columns (customer, problem, promise, deliverable, price_cents, anchored_against, proof, risk_reversal, objections jsonb, unit economics columns, wtp_instrument, wtp_pass_number, wtp_deadline, wtp_result). Fills at stage 4.
- **`processes`**: stage 8's process docs (owner, frequency, time, status, trigger, inputs, steps jsonb, decision points jsonb, output, failure modes jsonb, automation notes). Later than v0.

### 5.3 RPCs (`security definer`, `set search_path = ''`, caller judged with `app.is_member` / `app.is_superadmin`)

- `create_venture(p_intake jsonb, p_run jsonb, p_name text, p_locale text)` → account id: the signup RPC on the pattern of `create_account_with_identity`: requires `auth.uid()`, makes the slug from the title, picks the plan with `is_default_for_signup`, inserts `accounts`, `account_members` (owner), `ventures`, the first `door_runs` row and the intake's line-3 assumptions into `evidence`, applies `system_settings.signup.trial_days` if set. Called by "Save" on the verdict screen; the cookie's answers are its input.
- `record_door_run(p_account, p_run jsonb)` → run id: validates (gate order, evidence for demand ≥ 3, `fact_changed` when killed), computes the verdict in SQL (`compute_verdict`, same thresholds as `door.ts`; the unit test asserts both agree on a fixture set), updates `ventures.state` through `set_venture_state`.
- `set_venture_state(p_account, p_state, p_basis, p_reason)`: the only writer of `ventures.state`; the cap trigger fires here; `declared` states are allowed (a venture the owner declares LIVE without a run counts toward the cap, as the project instructions say).
- `set_week_test(p_account, p_test jsonb)`: moves the week test to this venture (closes none; refuses when another open week test exists for the owner unless `p_force` names it), requires `has_hours` on the venture or sets it with a confirmation flag.
- `record_test_result(p_test, p_number, p_changed text)`: writes the result and outcome; a PARKED venture whose trigger fired gets a prompt to re-score.
- `invite_member(p_account, p_email)`: inserts `account_members` with `status = 'invited'` and returns the one-time sign-in link made by core's `createSignInLink()` (server side), bounded by `venture.members_max`. The invited person sees that one venture and nothing else (RLS); the RLS suite proves it.

### 5.4 Reference data — modules, features, plans (migration in Mainfloor's 008 style)

- Module `venture` ("New Venture").
- Features (key · kind · unit, in the words `features.kind` and `features.unit` accept — `flag | quota | limit` and `per_day | per_week | per_month | lifetime | absolute`, `core_003`): `venture.ventures_max` (limit · absolute; −1 unlimited, read by the cap trigger with `feature_value()` like `identity.max`) · `venture.workspace` (flag · absolute: stages, ledger, decisions, offer, processes) · `venture.members_max` (limit · absolute) · `venture.weekly_review` (flag · absolute, the Monday mail) · `venture.forecast_public` (flag · absolute) · `venture.ai_verdicts_per_month` (quota · per_month, metered by `consume_quota()`; **inactive until the engine exists**, like Mainfloor's planned keys: not in `LIVE_FEATURES`).
- Plans (keys are data; code never names them): `free` — the door and saving up to 3 ventures, no workspace, no members · `develop` — unlimited ventures, workspace, 1 member per venture, weekly review, forecast log; `is_public false` until the founder sets a price (`plan_prices` empty; the sketch's EUR 990 / 30 days is noted in `description` as a proposal, never shown) · `founder` — everything, comped, `is_public false`, the founder's own accounts. `is_default_for_signup` = `free`. `system_settings.signup.trial_days` = 0.
- Flags: `venture.forecast_log` (off until B5 passes), `venture.weekly_review` (off until Resend is set up).
- `LIVE_FEATURES` at B2: `venture.ventures_max`; B3 adds `venture.workspace`, `venture.members_max`; B5 adds `venture.forecast_public`, `venture.weekly_review`.

### 5.5 Views

`venture_card` (members only; §4.6), `public_forecasts` (anon; owner slug, venture title, state, score, test what/number/deadline/result; only `forecast_public` ventures; `revoke all` then `grant select`), `admin_venture_overview` (service only; feeds `app.overview_extra()` and the account panel).

---

## 6 · Screens — phone first, one question per screen

Routes, in the order a person meets them. Every screen composes `@core/components/ui`; no raw palette classes; shown in full from 320 px to desktop (Mainfloor `CLAUDE.md` rule 9; its PR #27 makes one-column forms on phones the default in `core/src/components/ui.tsx` — take that version of core).

**Public (no sign-in)**

- `/` — the landing page from the sketch: what the door does, the three states, "Run your idea through the door" (primary), sign in (secondary). No prices.
- `/door` → `/door/gate/[1-5]` → `/door/score/[1-5]` → `/door/verdict` — the five intake lines, the five gates (stop at the first No: `/door/killed`), the five scores, the verdict. Progress dots across the run. State in an HttpOnly cookie `nv_door` (JSON, under 4 KB, 24 h); "Save this verdict" → `/login?next=/door/save` → `create_venture` from the cookie → `/app/v/[id]`. Nothing is written for an unsaved run. A free run never asks for an e-mail before the verdict.
- `/f/[slug]` — the public forecast log (B5).
- `/privacy` — from day one.

**Signed in (`/app`, `privatePrefixes: ["/app"]`)**

- `/app` — My ventures: cards by state (LIVE first, with the one that has the hours marked; then PARKED with triggers; KILLED collapsed), the cap line ("2 of 3 live · hours on X"), the week's test with its number and deadline, "New idea" → `/app/new` (the door, saved straight into a new venture). Free plan: the "n of 3 saved" line and an upgrade nudge from `planSummary`.
- `/app/v/[id]` — the card (§4.6), the home of a venture: state and basis, score with the five dimensions, stage with evidence, the test in flight, next action and date, "Re-score" (opens the door on this venture; refused for KILLED without `fact_changed`).
- `/app/v/[id]/stages` — the eight stages with exit tests and "Founder does"; mark the founder's step done with evidence; premature work named.
- `/app/v/[id]/ledger` — the assumption ledger: open by risk, facts with source and date, killed; promote with a source.
- `/app/v/[id]/decisions` — append-only list; add one (date, decision, reason, replaces).
- `/app/v/[id]/tests` — set the test (numbers locked at save), record the result, see the log of forecasts and results.
- `/app/v/[id]/offer` — the one-pager (stage 4). `/app/v/[id]/processes` (stage 8) comes later.
- `/app/v/[id]/team` — invite one person (plan-gated); who has access; remove.
- `/app/feedback` (core), `/app/account` — copy Mainfloor PR #27's product page (`src/app/app/account/page.tsx`: signed-in e-mail, Admin link for superadmins, Look, Dark/Bright, Language, Feedback · Privacy, Sign out; the header carries one Account button). It is a product page, not core. The person profile itself (R-006) is not built; `users.display_name` is all there is.

**Admin (`/admin`, core)** — Overview with the product's tiles, Accounts with the venture panel and View as (the owner's `/app`, read-only), Plans & features, Settings, Feedback, Invite a tester, Delete account. Product tab `/admin/ventures`: every venture across accounts by state, stalled first, with the cap per owner.

Copy: lift from the sketch and the skill files; the founder reviews Norwegian. Every screen that will one day show an AI result carries its disclosure line only when the engine is on; v0 has none because nothing is AI.

---

## 7 · Jobs

One in v0: `/api/cron/weekly-review` (Vercel Cron, Mondays, once a day on Hobby), `CRON_SECRET` bearer, the claim idiom from Mainfloor's digest (`weekly_reviews.last_sent_at` per owner moved before sending). For each owner with `venture.weekly_review`: the test due this week and its number (or "no number set"), results not reported, stalled ventures (over four weeks at a stage), kill candidates (a gate failed twice, or no test in a month), the cap. Sent through Resend from the product's own subdomain (SETUP-GUIDE Part 13 pattern); sender name and address are the seller's (§10 D2), never a person's name the record does not hold. Off (`venture.weekly_review` flag) until Resend is set up by the founder.

No collectors, no LLM runs, no scheduled tasks in claude.ai. When the engine exists, `review.weekly` becomes its first task here.

---

## 8 · Build order with exit tests

Each step ends with the named test green and a report to the founder; the founder runs the exit test himself where it says so. Do not start the next step on a failed test.

| Step | Build | Done when |
|---|---|---|
| **B0 · Bootstrap** (founder + session, §9) | Repo `new-venture` on GitHub; `CLAUDE.md` (under 200 lines, from the skeleton in §11), `STATE.md`, `DECISIONS.md` seeded with §1.1, this file as `docs/HANDOFF.md`, `assumptions.md` with §1.2. | The repo is private, pushed, and a fresh Claude Code session in it names the product, the first customer, the stage and the next action correctly. |
| **B1 · The shell on the core** | `core/README.md` steps 1–9; `src/product.tsx`, `src/brand.ts`; one-line route re-exports; `src/proxy.ts`; root layout with theme, look and fonts; `globals.css`; `src/i18n/{en,nb}.ts` (+ `es`, `de`, `fr` carrying English); `/privacy`; the RLS harness copied; migrations `core_001`, `core_003`, `core_007` (cut if missing, §3.1), `core_020`, `core_024`; `npm run build && npm run lint` green. | `/login` works at phone width in all five looks, Dark and Bright; the founder signs in with the dev link; `/admin` shows the core console (404 for a second user); the RLS suite runs green on a fresh Postgres in the build session. Nothing applied to a hosted database yet. |
| **B2 · The door** (step 1 of the product) | Migrations: `ventures`, `door_runs`, `evidence`, `decisions`, `tests`, reference data (§5.4), `create_venture`, `record_door_run`, `set_venture_state`, `compute_verdict`, the cap trigger, `venture_card`; `src/lib/door.ts` with the rules and anchors; the `/door/*` screens and `/app`, `/app/v/[id]` (card), `/app/new`; the unit test that `door.ts` and `compute_verdict` agree on a fixture of 20 runs (incl. Conscious Pulse at 13 → PARKED, a gate-2 kill, an 18 → GO); RLS suite extended (a member of venture A reads nothing of venture B; anon reads no table; a fourth LIVE is refused; a KILLED re-score without `fact_changed` is refused; `tests` numbers immutable after `set_at`). | **Founder exit test 1 (his own, two sittings):** ten of his own ideas through the door on a phone, saved under his account, Conscious Pulse among them with the 13 Oct answers reproducing PARKED 13/25. After ten: what did the door get wrong, where did he overrule it — recorded in `DECISIONS.md`, rules changed only through `DOOR_RULES_VERSION`. |
| **B3 · The workspace** (step 2) | `stage_progress` + history, `offers`, `/app/v/[id]/{stages,ledger,decisions,tests,offer,team}`, `set_week_test`, `record_test_result`, `invite_member`, plan gating (`venture.workspace`, `venture.members_max`), `planSummary`, admin panel and tiles, `/admin/ventures`. | **Founder exit test 2:** he runs his ventures in it daily for two weeks instead of the cards file: states, the week's test with its number, results, decisions. **Exit test 3:** one invited person opens one venture and sees nothing else (RLS suite + a browser check at phone width from a second account). |
| **B4 · The record moves** | The cards file gets a header "record moved to New Venture on <date>" (§10 D9); each venture repo's `CLAUDE.md` state and gate lines point to the product; `STATE.md` here says so. | The founder confirms the product is the record for his ventures. |
| **B5 · The log and the review** | `public_forecasts`, `/f/[slug]`, `forecast_public` switch; `/api/cron/weekly-review` with Resend (needs the founder's Part 13-style setup: sending domain, `RESEND_API_KEY`, `CRON_SECRET`); flags on. | The founder's own forecast log is public for the ventures he marks; the first Monday mail arrives with the right test and number. |
| **B6 · A second founder** | Invite a tester from Admin (core), `testerNote`; the first sign-up by someone else from a blank account. | **Exit test 4:** a second founder runs an idea through the door and saves it on a phone without help; their feedback lands on the board. |
| **B7 · AI inside** (step 3) — only when the engine exists in core (§3.4) | Tasks `verdict.scan`, `stage.draft`, `review.weekly`; quota keys live; AI disclosure lines; `/privacy` names the provider; the connector tools (§3.5) when the layer is in core, flags off. | The founder's own week with AI on; cost per run visible in admin; the Laya / small-LLM rule from CONNECTORS-SPEC §15 applies to any classifier. |
| **B8 · The first money** — the founder's go, not the session's | A named seller and the EU basics on `/privacy` and the terms; the manual payment path (core: `record_manual_payment` → `payments` → `paid_through`; the admin form for it is core work in this step, shared with Mainfloor's stage 3); then the paid test. | **The revival trigger of New Venture itself:** five of fifty strangers pre-pay EUR 149 within seven days, unrefunded on day 21. Fail 0–1; 2–4 one re-run with one change. Only a pass sets a price on a screen. |

Order of the founder's hours: Mainfloor has them (13 Oct). This product's steps B1–B3 are built in sessions; his part is B0, the exit tests, and the hosted steps in §9.

---

## 9 · The founder's steps (verified against `core/README.md`, `atlas-os/README.md` and Mainfloor's `docs/SETUP-GUIDE.md`)

1. **Create the repo** (Mac, Terminal): `mkdir -p ~/Documents/Atlas/new-venture/docs && cd ~/Documents/Atlas/new-venture && git init`, copy this file to `docs/HANDOFF.md`, `git add . && git commit -m "New Venture: handoff"`, then `gh repo create new-venture --private --source=. --push` (the form `atlas-os/README.md` uses). Open Claude Code there, or attach the repo to a cloud session, and say: *build New Venture from `docs/HANDOFF.md`, step B0 then B1*. The working-name default for the repo and `brand.name` is "New Venture" (§10 D1).
2. **Supabase project** (browser, when B2 is ready to apply): a new project in **eu-central-1 (Frankfurt)**, as SETUP-GUIDE Parts 3–5; keys into `.env.local` (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`, `NEXT_PUBLIC_SITE_URL`); `npx supabase link`, then `npx supabase db push` is the last step after the suite is green in the build session (rule 1). The free plan pauses a project after seven idle days; resume it in the dashboard before a push. One Supabase project per product is today's setup (PLATFORM-CORE §5); a shared sign-in across products is a core decision for later (§10 D6).
3. **Superadmin**: Mainfloor's seed sets it; this product has no seed. After his first sign-in (which creates his `public.users` row), run in the Supabase SQL editor: `update public.users set is_superadmin = true where lower(email) = lower('<his e-mail>');` — the guard in `core_001` allows the change only from direct SQL. Sign in with `node scripts/dev-login-link.mjs <his e-mail>` (Part 7b).
4. **Vercel** (Part 11): a new project from the repo, `vercel.json` with `fra1`, the three Supabase variables (`NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SECRET_KEY`) and not `NEXT_PUBLIC_SITE_URL` — on Vercel the app takes its own address automatically (Part 11 step 3). The Vercel address is the app's address until the subdomain is decided; then one DNS record at Domeneshop for the chosen `*.aintegration.org` name and Supabase Auth's Site URL and Redirect URLs updated to it (`/auth/callback`).
5. **Resend** (B5, Part 13 pattern): a sending subdomain of the product's domain, `RESEND_API_KEY`, `CRON_SECRET`.
6. **`ANTHROPIC_API_KEY`** (feedback board, Part 14): optional; the board works untidied without it.

Nothing in this list is done by a session. A session prepares, verifies and writes the exact lines; the founder runs them.

---

## 10 · Open decisions — the founder's, with the default a session uses meanwhile

| # | Decision | Recommendation · default until answered |
|---|---|---|
| D1 | The product's name and the subdomain of `aintegration.org`. | Working name "New Venture" in `brand.ts` (one file to change). Deploy on the Vercel address; the subdomain is one DNS record when chosen. |
| D2 | The seller: which company's name stands on `/privacy` and the terms, and the sender of the Monday mail. | *Stop* before B5's mail and before B8. Until then `company` in `brand.ts` carries Mainfloor's pattern with the name left as "to be decided" and the page says so; no mail goes out. |
| D3 | Where free ends: after the gates (sketch) or after the scored verdict (analysis) or the whole self-scored door (13 Oct recommendation). | The whole self-scored door is free; paying starts where work is done for the customer (the researched verdict, the test set up, the workspace). Plans in §5.4 follow this; no price is shown anywhere. |
| D4 | The intake: §4.1 takes the five lines of the sketch's first version (30 Sep). The design page of 9 Oct may word them differently; the `/new-venture` command asks five other questions. | Use §4.1; the builder reads the design page and, if its intake screen differs, the page wins and §4.1 is updated with the date. |
| D5 | The middle levels of the worded anchors (§4.2); the sketch and the protocol name the ends and the demand ladder only. | Use §4.2 as rules version 1; a change is version 2 and old runs keep theirs. |
| D6 | How a user of Mainfloor or InvestX "adds" New Venture, with one Supabase project per product. | A link from each product to the door now (zero work, no shared data); a shared auth project is a core decision taken when a second product has customers who use both (PLATFORM-CORE §5). |
| D7 | Who builds the AI engine first. | Settled 18 Oct: the InvestX session put it in platform-core (`core_030`, PR #1 there); this product declares tasks on it at B7 (§3.4). |
| D8 | Which LIVE venture leaves when a fourth scores 18. | No default; the screen asks the owner. The rule gap is noted in the sketch (first version) and stays open. |
| D9 | When the product becomes the record for the founder's own ventures, replacing `portfolio/venture-cards-v1.md` and the "My ventures" page as stores. | After exit test 2 passes (B4). Until then the cards file is the record and the product is a copy that names its source and date. |
| D10 | Which languages beyond `en` and `nb` get real translations, and who reviews the Norwegian gate wording. | English and Norwegian at B2; the founder reviews `nb` before the first tester; the rest carry English. |
| D11 | The InvestX regulatory check before InvestX is offered as a venture through this door (venture cards, "Watch"). | Not this product's work; the door records it as a rules-check item on that venture's test. |

Still open from 3 Oct and 13 Oct, for the record: the ten moves of the competition analysis (1–3 are built into §4.5 and §4.2), who paid for the Innovation Portal and why it stopped in 2012, and whether the NAV-linked assessment could be delivered through the door.

---

## 11 · `CLAUDE.md` skeleton for the new repo (under 200 lines; keep it current)

```
# New Venture (working name; `src/brand.ts` is the one place the name is written)

The door every idea goes through — GO, PARKED or KILLED with the reason in writing —
and the workspace that takes a GO to its first paying customer. Built on the platform
core (`core/`, a git subtree of `Arctic-Crypto-Viking/platform-core`); the method is the
`venture-os` plugin in `atlas-os`. Full brief: `docs/HANDOFF.md` (18 Oct 2026).

## Status (<date>)
<one paragraph: which build step (B0–B8) is done, which exit test passed, what is
applied to the hosted database, what waits on the founder>

## Read first, in this order
1. `docs/HANDOFF.md` — what to build, the rules as code, the data model, the build order.
2. `core/README.md` — how a product consumes the core; never fork a core file into `src/`.
3. `supabase/migrations/*.sql` — the schema is the truth.
4. `STATE.md`, `DECISIONS.md` — where things stand, what was decided and why.

## Stack and layout
<the lines from Mainfloor's CLAUDE.md "Stack and layout" that hold here: core at `core/`,
Next.js 16 (read `node_modules/next/dist/docs/` first), Supabase Frankfurt + Vercel fra1,
`src/brand.ts`, `src/product.tsx`, `src/lib/door.ts` (rules, versioned), `src/lib/plan-summary.ts`
(`LIVE_FEATURES`), `src/i18n/*`, migrations append-only>

## Commands
npm run dev · npm run build && npm run lint · npm test (this repo adds the script: `tsx --test "src/**/*.test.ts"`,
as the connector branch does; Mainfloor's main has none) · npx supabase db push (founder, last)
supabase/tests/local/run.sh -h <host> -p <port> -U postgres

## Rules that are not up for interpretation
1–5, 7, 9–11 of Mainfloor's `CLAUDE.md` word for word (RLS on every tenant table; never trust
the client; superadmin is a database fact; modules and features are data; payment rails
decoupled from access; venture-neutral surfaces; mobile first; migrations append-only;
secrets never in the repo), plus:
12. The door's rules are versioned code; a verdict is computed, stored with its version,
    never edited. A KILLED venture is re-scored only with a stated changed fact.
13. A test's numbers are set before it runs and immutable after.
14. The cap lives in the database (three LIVE, one with the hours, per owner).
15. No price on any screen until the founder decides one (HANDOFF §10 D3).
16. Nothing is AI until the core engine exists; then every AI result carries its disclosure.
17. "Atlas" never appears in anything a tester or customer can see.

## How the founder works (apply to every task)
<the four lines from Mainfloor's CLAUDE.md, plus: close with a "To record" block;
stop before anything that merges, deploys, applies a migration remotely, pays or sends>

## Build order and where we are
<the table of HANDOFF §8 with a status column>

## Who signs what goes out
<empty until D2 is decided; nothing goes out before>
```

---

## Sources

Read on 18 Oct 2026 unless dated. GitHub: `platform-core` (`README.md`, `src/product.ts`, `src/lib/env.ts`, `supabase/migrations/core_*.sql`), `artist-platform` `main` (`CLAUDE.md`, `docs/PLATFORM-CORE.md`, `docs/SETUP-GUIDE.md` headings, `docs/IMPLEMENTATION-NOTES.md` rows 55–59, `docs/requirements-foundation.md` R-006/R-007/R-081, `src/product.tsx`, `src/brand.ts`, `src/lib/plan-summary.ts`, `src/lib/wizard.ts`, migrations 002, 008, 009), `artist-platform` PR #1 (`docs/CONNECTORS-SPEC.md`), `investx` (`CLAUDE.md`, `STATE.md`, `DECISIONS.md`; PR #1 `docs/agents-architecture.md`, `docs/mainfloor-reuse.md`, `supabase/draft/investx_010_agents.sql`), `atlas-os` `main` (`README.md`, the `venture-os` plugin) and PR #1 (`CLAUDE.md`, `STATE.md`, `DECISIONS.md`, `docs/new-venture.md`, `docs/research/2026-09-30-new-venture-sketch-first-version.md`, the `operating-rules` skill, the venture templates). An independent fact-check of this file against those sources ran on 18 Oct 2026 (13 findings, all folded in). claude.ai: the Operating guideline document (tabs New Venture rev. 9, Inbox rev. 10, Conscious Pulse rev. 1), the pasai ventures project docs (`portfolio/new-venture-concept.md` 3 Oct, `portfolio/venture-triage-protocol.md` 23 Sep, `portfolio/venture-cards-v1.md` 23 Sep, `portfolio/new-venture-competition-analysis.md` 3 Oct, `claude/project-instructions.md` 10 Oct, `claude/platform-connectors.md` 13 Oct). Not read: the "New Venture — service concept" Design artifact itself (the builder reads it for screen copy), the full competition analysis artifact's five tabs.
