# The moves in detail

_Plain-text export of this tab (its links and inline marks are dropped; the doc has them)._

Each move says what to do, the evidence it rests on and how to test it cheaply. Effort figures are estimates for a solo founder working with AI agents on the existing toolkit.

1. Make the paid-order test the product

Sell one thing at the door: a verdict plus this week's paid-order test, set up for the founder. The platform drafts the offer, the messages and the order page, connects a payment link in the founder's own payment account and logs a forecast. Seven days later it counts paid orders from strangers against the number.

For a first-time idea with no behavioural evidence, make the test result the revival trigger. PARKED then means "run this test; at N paid orders it becomes a GO". That gives the middle state a job a score band cannot do.

The design rules follow the evidence, except the first, which rests on reasoning:

- Show the price, and count payers, not revenue.
- Count orders net of refunds. Refundable deposits vary widely as commitments: in one survey 77% of holders of one electric-truck reservation planned to buy, but only "just over 20%" of holders of another (Recurrent).
- Say who counts. Warm audiences sign up two to four times more often than cold ones, by one vendor's waitlist figures (LemonPage).
- Call one test a first reading. Savoia's own rule is "a bare minimum of three to five experiments" before trusting a result (book summary).

The platform, not the founder, sets the number. In experiments with senior executives, a predetermined rule reduced the pull to continue with a losing course, while rules people set for themselves did little (Boulding, Morgan and Staelin).

Expect small numbers. As indicative arithmetic, USD 500 of Meta traffic ads at a median of about USD 0.70 a click in the US buys about 700 visits (WordStream). If 1.5–3% of visitors paid, which is an assumption and not a measured rate, that would be 11–21 paid reservations. Pass marks for founder-sent tests will be single digits and noisy.

Two parts of the shared core fit this exactly. The send-only Gmail connector, once merged, is the mechanism by which the founder sends the offer: messages leave from the founder's own address. And payment in the founder's own account is a checkable contrast with agents that hold the customer's money.

Avoid fake doors with a live "buy" promise. Google bans "products, services, or promotional offers in the ad that are unavailable" (Google Ads policy), and Stripe prohibits processing "where there is no bona fide good or service sold" (Stripe). A transparent, refundable pre-order is the lower-risk form.

Over time this builds an asset no product examined has. No independent, large-sample benchmark for landing-page-to-pre-order conversion was found. A platform that logs every test by category would hold one.

2. Harden the verdict method and the evidence ladder

Anchor every score in words. Write word anchors for all five score dimensions, as the demand scale already has (1 = my opinion, 5 = someone has paid or signed). Anchored scales should make a score more repeatable; the one figure found is a vendor's. Stage-Gate International reports a spread (standard deviation) of 5.7% between runs of its AI scorer against 17.5% between managers scoring the same project, in the vendor's own evaluation (Stage-Gate International).

Fix the evidence ladder in the rubric. Savoia's scale is ready-made: opinions and likes score 0, a validated email 1, a phone number 10, a 30-minute time commitment 30, and money one point per unit paid (The Right It). Add one hard rule: desk research alone caps the demand score at 2. Most strangers' ideas will then land in PARKED-with-a-test, which is the honest result and the one that sells move 1.

Isolate the judge. Pass the idea to the scoring agents as a third party's proposal, stripped of ownership and enthusiasm. Inside the workspace, let a separate evaluator with no chat history make each stage decision, and never let the model that drafted a card grade it.

Use the model gateway for its first real task. Three models from different families score independently, and the venture card shows their spread.

Shrink the market scan. Keep the three facts gate 2 needs: who pays for a worse version, at what price, through which channel. Check each link claim by claim. Fewer claims, each verified, beats "500+ citations" given the accuracy figures for AI research.

Define "a stated fact about the world has changed". A workable definition: new behavioural evidence dated after the verdict, or a named external event. A reworded pitch is not a changed fact.

The cheapest test doubles as marketing. Score the same 20 ideas with and without ownership cues and publish the gap. Run each idea five times and publish the spread; no competitor has shown either number.

3. Start a public forecast log

Make the one-week test the unit of proof. Before each test, record the idea, the date, the verdict, the pre-committed number, who counts, and the platform's probability that the number will be hit. Savoia's five likelihood bands (about 10%, 30%, 50%, 70%, 90%) are enough resolution.

Freeze the entry in an append-only log before the test starts. A week later, record the result.

Publish four things:

- the verdict distribution
- the calibration of the forecasts, with a Brier score
- two baselines: the base rate, and a plain chatbot given the same idea
- the sample size, with its uncertainty

Do not publish a KILL accuracy. Killed ideas are mostly not pursued, and the verdict itself changes behaviour: negative feedback raised abandonment by 13% in venture competitions, a modest relative rise (Howell). Report what happened to people who proceeded anyway as a biased lower bound, and say plainly that the false-negative rate is unknown.

Be realistic about the timetable. About 96 resolved forecasts pin one overall hit rate to within ten points at 95% confidence; calibration by band needs several times more. The best-evidenced competitor's verified USD 1,452 in a month equals roughly 25 reports at its USD 59 price, so even a business of that size would need about four months if every buyer ran the test.

Your protocol already requires one test a week on the live venture, so the log can start today at no cost. At one test a week that takes about two years to reach 96, so count on customer tests to fill it.

It also serves a legal purpose. National courts and authorities in the EU can "require the trader to furnish evidence as to the accuracy of factual claims" (Directive 2005/29/EC), and a forward-registered log is that evidence.

4. Borrow the mechanics that enterprises already trust

The mature innovation methods converge on a handful of mechanics, and New Venture already uses several without naming them. Naming the lineage gives a consumer product a pedigree.

| Mechanic | Source | Use in New Venture |
| Knock-out questions first, scored criteria second | The phase-gate process's must-meet and should-meet criteria (Wikipedia) | Already the door. Cite it |
| Outcomes beyond go and kill | Stage-Gate "Go, Kill, Hold, or Recycle" (Stage-Gate International); Kromatic's "bounce gates" (Kromatic) | PARKED is "Hold". Add the right to bounce back one stage |
| A small fixed budget and time box that grows only with evidence | KICKBOX: CHF 1,000 and two months, then CHF 10,000–50,000 and four months with a pilot "with real customers" (Swisscom) | Sell Develop as boxes with a fee, a deadline and an exit test, not as a monthly subscription |
| The threshold written before the test | Strategyzer's Test Card: hypothesis, test, metric, criteria (Strategyzer); Savoia's "At least X% of Y will Z" | The format of this week's test |
| Evidence graded by what people do | Strategyzer's 0–5 "Evidence & confidence" (scorecard); Savoia's skin-in-the-game points | The evidence ladder in move 2 |
| A written record made at the time of deciding | The decision journal (Farnam Street); the PSL kill memo | The venture card and the documented stop |
| A published kill rate | "If nothing has been stopped in a year, the gates are not functioning" (whichframework.org) | Publish the share of GO, PARKED and KILLED |

Published funnels show how strict a working gate is. Swisscom's programme went from more than 500 first-stage boxes to more than 90 second-stage and 27 implemented ideas (Swisscom case study). At Bosch, 70% of teams retired their project after the first funding round (The Invincible Company preview).

These are employee ideas filtered against company strategy, so the direction transfers and the exact rates do not. Your protocol expects 70–85% of a backlog to die at the gates, which is in line with these funnels.

5. Recast the human review as an evidence check

No tool found sells a human review of the verdict at any price. Where humans appear, they build investor documents (USD 499 at Preuve; DimeADozen's USD 299 add-on does not say a human is involved) or coach inside a membership reported at USD 2,999 a year.

The nearest price anchors for EUR 200 are a single session with a business expert on Intro, where many charge USD 150–250 within a range of USD 59–2,500 (Intro), and a month with a MentorCruise startup coach at USD 120–590. The price is plausible. The promise is the problem.

The research says a reviewer's opinion must not be sold as predictive for consumer and software ideas. So the review should do three things a founder can verify:

1. Check the three facts the verdict rests on.
2. Check that the test is fair: the number, the audience, the deadline.
3. Sign the record.

Keep the written note short and factual. In a field experiment with 228 evaluators, screeners helped by AI were 9 percentage points more likely to fail a solution. On subjective criteria they followed an AI that argued its case 12 points more often than one that only gave a recommendation (Lane, Boussioux and co-authors, abstract only). A persuasive write-up moves people, whether or not it is right.

Suggested wording for the offer: "Evidence check by a founder. I verify the facts your verdict rests on and sign off your test. I do not predict whether your idea will succeed; for consumer and software ideas, research has not shown that anyone can from a description." This is honest, it differs from every mentoring marketplace, and it is supportable if a regulator asks.

Your own gate 4 applies here: a review on every verdict is personal delivery. Cap it at about 30 minutes, sell it as an add-on, and audit a sample of unreviewed verdicts for the track record. The cheap test: offer it to the first five buyers, and drop or bundle it if fewer than two take it.

6. Reprice and repackage around the test and a defined end

The Summary tab charts the draft prices against the anchors found. Conversions use EUR 1 = USD 1.13 on 3 October 2026 (Frankfurter).

On EUR 149 in 48 hours. As a desk verdict it is above every AI-only price found, and it is the slowest delivery among the AI tools by a wide margin. One commenter described "a weird dead zone between 'free' and 'obviously worth it' where €19 sits for a tool you use once or twice", and added that "People will pay €49 for a one-time honest verdict more easily" (Indie Hackers). Three weeks later the same validator, relaunched at EUR 19 a week earlier, still had no paying user (Indie Hackers).

The price becomes defensible when the 48 hours end in a live order page and a logged forecast, not a PDF. Give the instant desk verdict away or price it low, and charge for the test.

This also answers the open question about a NO-GO customer. The gates are free, so nobody pays to be killed at a gate. A paying customer who lands in PARKED receives the test, the number and one included re-score when the result comes in; that is worth paying for in a way a verdict alone is not.

On EUR 990 per 30 days. It is roughly 9 times Cofounder.co's entry price and about 29 times Buildpad's, and close to what Founder Institute charges for a whole programme. Sold as "an AI workspace" it will be compared with USD 39 and lose.

It can hold as a KICKBOX-style box: a fixed fee, a fixed deadline, a named exit (first paid order from a stranger, or a documented stop), no credit meter and no revenue share. Unpredictable credit burn is a frequent pricing complaint against builders, so "one price, no meter" is itself a selling point.

Consider a smaller first box for stages 3 and 4 only, so a GO customer can buy the pre-sale sprint before committing to the build. What that box should cost is not something this research can answer; the first buyers will.

On outcome-based pricing. Revenue share exists in this market, and one vendor has cut it. Polsia moved from 20% of revenue in February 2026 (its founder's comment on Product Hunt) to 3% of customer payments by September 2026 (a third-party reading of its terms: Digitalix Hub).

Audos keeps 15% indefinitely (TechCrunch) and paired it with up to USD 100,000 for its first cohort of five (vendor PR via StockTitan).

One investor's rule of thumb is that outcome pricing works when outcomes are "unambiguous and measurable" (Bessemer). A first paid order is exactly that; later revenue is not. No example of pay-on-first-customer pricing was found.

The view here: skip revenue share. It earns little on tiny early revenues and forces the platform to sit in the customer's money flow. If an outcome link is wanted, split the Develop fee, with part due at the start and part when the first stranger's payment lands in the customer's own account.

Three smaller points. Credit the Verdict fee against Develop on a GO. Offer a plain refund for non-delivery: 14-day guarantees are standard in this category, so it is hygiene, not a differentiator. Never promise the outcome itself.

On grants. One public scheme fits this purchase for a minority of buyers. Innovation Norway's Oppstartstilskudd 1 pays up to NOK 150,000, and only for "kjøp av tjenester fra eksterne leverandører" that give learning from customers and the market (Innovation Norway).

It is restricted to limited companies under five years old with a demanding technology path, and costs incurred before the application are not covered. Whether a platform fee counts as an eligible external service is unconfirmed and should be asked before it is used in sales. Most idea-stage buyers fall outside the scheme, so it is a door-opener, not a pricing foundation.

7. Cover the EU basics before the first paid order

This is a summary of public sources, not legal advice. It needs an hour with a qualified lawyer before launch.

AI transparency. The EU AI Act's Article 50 has applied since 2 August 2026. Users must be told they are dealing with an AI system, and generated output must be "marked in a machine-readable format and detectable as artificially generated" (AI Act Service Desk). Systems already on the market before that date have until 2 December 2026 to meet the marking duty; a product launched later gets no such period.

The exception for human-reviewed text is written for text published to inform the public, so it does not obviously cover a private verdict. Both readings need legal confirmation. Assessing a business idea is not among the Commission's listed high-risk uses (European Commission), but keep verdicts away from anything that reads as a credit or investment decision about a person.

Consumer rights. A person with an idea who has not started trading plausibly counts as a consumer. That brings full pre-contract information, a 14-day right of withdrawal and, since 19 June 2026, an online withdrawal function (Directive (EU) 2023/2673).

If express consent to immediate delivery and the customer's acknowledgement are not captured, the customer can withdraw after receiving the verdict and owe nothing (Consumer Rights Directive). Build that consent step into checkout.

Claims. Claims about "results to be expected" must be supportable. In coordinated cross-border cases the maximum fine must be set at no less than 4% of annual turnover (Directive 2005/29/EC). The US regulator's line is the same: "There is no AI exemption" (FTC).

So: no "validated", no success rates and no guarantees of outcome until the forecast log can back them.

VAT. Where the selling company is established decides the mechanics, so this belongs with the domicile decision. For a seller established in one EU country, electronically supplied services sold to consumers in other EU countries are taxed in the customer's country once such sales pass EUR 10,000 a year. The optional One Stop Shop lets one registration cover them (European Commission).

A seller established outside the EU should assume the threshold does not apply, and confirm the position with an accountant. Quote consumer prices including VAT; only one competitor found does.

The customers' own pre-sales. The founder, not the platform, is the trader unless a merchant-of-record service is used. Order pages the platform drafts need the required information, a properly labelled pay button, a refund path and the withdrawal function.

For goods, the withdrawal period runs "14 days from the date of delivery" (Your Europe). Every pre-order therefore stays cancellable until two weeks after delivery, which is why paid orders are counted net of refunds.

Trust. Two worries appear in the comments. One Product Hunt commenter asked a validator's maker "are you saving the entered ideas as well?" (Product Hunt). One Hacker News user dismissed a validator as "Yet another 'give me your business ideas for free' business tool" (Hacker News).

That concern is sharper for a platform run by someone who builds ventures of their own. A written commitment not to use, share or build on customers' ideas, shown before intake, is cheap. It is this document's suggestion, not a researched legal requirement, and data-protection rules were not researched.

8. Run everything hosted and hand out no files

Today's form, a private Claude Code plugin with one repository per venture, is safe only while you alone run it. Installing a plugin "clones that marketplace or plugin repository onto their machine" (Claude Code docs). Access control is the git host's, and no licensing or copy protection is described.

A private repository controls who clones, not what they keep. Listing a plugin bundle in Claude's directory even requires "a GitHub repository, which must be public before the listing goes live" (Claude directory docs).

So customers and collaborators should get results, not files. Put the rubric, gate criteria, scoring and data behind the per-product connector endpoint and a web workspace, and give collaborators hosted access with roles. Where files must be shared, the documentation's own advice is to "Host separate marketplaces for separate audiences."

Plan for the method to leak anyway. In one test of 216 custom GPTs, system prompts were extracted in 97.2% of cases (Yu and co-authors). A public collection of extracted prompts from well-funded AI products has 143,900 stars (GitHub). Tool names, descriptions and outputs stay visible through any connector, so secrecy buys time, not defence.

What survives copying is what accumulates:

1. The outcome dataset: which ideas got which verdict, which test, and what happened.
2. Venture state, and the links to the customer's own apps.
3. The public record, and the brand built on it.

One published test is useful: if a technical user can get 80% of the output by pasting the core prompt into a general assistant, the product is a wrapper (Foundra). The desk verdict fails that test. The verdict plus a run money test plus benchmarks from earlier tests passes it.

The hosted version is the largest build on this list. Until it exists, deliver as a concierge service: you run the toolkit privately and the customer sees only the venture card and the order page. That exposes nothing.

9. List the free Gates in assistant directories

Directories are free discovery, not stores. Anyone on a paid Claude plan can submit. A connector needs a remote server, sign-in for user accounts, documentation, a privacy policy and a test account, and review time "isn't fixed" (Claude directory docs, connector submission).

The policy excludes software that moves money and software that serves ads (Anthropic directory policy).

ChatGPT's rules are stricter. "Selling digital products or services—including subscriptions, digital content, tokens, or credits—is not allowed" inside an app, "whether offered directly or indirectly (for example, through freemium upsells)" (OpenAI app guidelines). A free Gates app that leads to a paid verdict may fall foul of that rule in ChatGPT, so check before building for it.

The workable shape is the one Anthropic recommends for a product of one's own: the server as a connector, plus a thin public plugin whose skills teach the assistant to call it. List the free Gates there, since a 15-minute self-serve check is a natural fit. Take payment for the verdict and the test on the product's own site.

Keep expectations low. A connector endpoint per product is where the market already is, not ahead of it. No 2026 measurement of traffic or sales from assistant directories was found, so there is no benchmark for a pass mark: set one before listing and treat the first 30 days as the test.

Do not count on Hacker News either. One validator's launch there drew a single point and no comments (Hacker News), and the one cited earlier drew 15 points and mostly scepticism.

10. Sell through organisations that already hold idea-stage founders

This move is a proposal from the analysis, not a research finding. It answers the weakest score on the protocol: distribution.

A one-off EUR 149 sale to individual founders is the low-ticket, high-volume model your protocol calls structurally hostile to a solo operator. It needs paid acquisition and scale before it pays. Organisations that already hold idea-stage founders change that arithmetic, because one sale covers many verdicts.

Two facts and one grant rule point this way:

- Selective programmes turn most applicants away: Antler UK backs fewer than 1%, and Y Combinator and Techstars accept between 1% and 3% by a third-party count. A verdict with the failed gate named is something they could hand to the people they turn away.
- One university centre has sold idea assessments for decades: it reports more than 8,000 feasibility studies since 1980, at USD 980 each today (Wisconsin Innovation Service Center, vendor-claimed).
- Innovation Norway's start-up grant pays only for services bought from external suppliers (Innovation Norway). Some advisers' clients may therefore arrive with a budget for this kind of purchase.

Candidate buyers are incubators and accelerators with large applicant pools, university entrepreneurship centres, public business advisers, and banks or accountants who meet first-time founders.

Three things are not known: whether any of them would pay, what a fair price per verdict is at volume, and whether their founders would run the test. The cheapest test is five conversations with programme managers, each ending in a concrete offer of a paid pilot of ten to twenty verdicts. Pass if two say yes.

Keep the rules intact in this channel. The verdict still names the failed gate, PARKED still carries a test, and results still go in the forecast log. A partner who wants only GO verdicts for its cohort is asking for the product every competitor already sells.

The threats in full

The Summary tab lists five threats in a table. This section gives the evidence behind each.

The platforms absorb the path. Between 2025 and October 2026 the large platforms took over most generic steps of "research an idea, build something, set up a company, sell". Deep research is bundled into USD 20 assistants. Shopify's connector inside Claude lets a user "describe what you sell, create your store, add products, and sell online" (Claude connector directory).

Shopify also launched a chat-driven store builder in the first days of October 2026 (third-party: Dataconomy). Anthropic publishes free role plugins for sales, marketing and finance. No first-party idea-validation plugin was found, but the adjacent ones are one release away (knowledge-work-plugins).

Incumbents also buy. Wix agreed in June 2025 to pay up to USD 80M for an app builder with a sole owner and fewer than ten staff, and press reports put it at USD 100M of annual recurring revenue within nine months (Calcalist).

What the platforms have not shipped, in the material reviewed, is a committed go or kill, or responsibility for the first customer. That is the ground to hold. Stages 5 to 8 should hand over into their tools.

Commoditisation and price pressure. The desk verdict is already free in a chat, USD 5 as a report and free as open-source skills. One commenter asked of a paid validator: "what does Frank offer that's so different from other AIs that are free and also brutally honest?" (Indie Hackers).

The near neighbours are one feature away from New Venture's open ground. IdeaSignal has a flip-condition monitor on a waitlist, Preuve has market monitoring "coming soon", DimeADozen sells a kit for "a small live market test", and Buildpad is small, EU-based and iterates fast. A newsletter has published a validation sprint, "a $2,250 verdict" on average delivered in ten business days, as a business idea for others to copy (Startup Heist).

The answer is the record and the dataset, which cannot be shipped in a release.

Low outcome rates across the category. If Develop "ends with a paying customer or a documented stop", the evidence says most engagements will end in the stop. Polsia's founder is quoted as saying about 10% of its companies made at least a dollar; an earlier press figure was roughly one in six (Preuve, Rest of World).

Among revenue-disclosing indie products, 67.5% sit in the USD 0–1,000 revenue bracket; the page does not say whether per month or in total (TrustMRR, 2 October 2026). One investor warns that products with "soft ROI" face a "2026 renewal cliff" (Bessemer).

A published first-customer rate may therefore look low. Time-boxed fees survive this better than subscriptions, and the stop has to be sold as a result: the decision reached, the money not spent.

Founders ignore or resent a kill. "People don't like paying to be told their baby is ugly" (Indie Hackers). Negative feedback raised abandonment by 13% in venture competitions, a modest relative rise (Howell). In two preregistered experiments with 1,604 participants, people rated flattering AI as higher quality and were more willing to use it again (Cheng and co-authors).

A product that says no will score worse on satisfaction than one that says yes, and satisfaction is what most products optimise. The defences are structural: keep kills in the free step, frame the paid result as a test, and sell to people with a decision at stake.

Commenters on the failed EUR 19 validator made the same point: people facing a real business decision pay, casual explorers do not (Indie Hackers).

Rules shift under the product. The AI Act's transparency duties are live, a Digital Fairness Act is "under preparation" (European Commission), and directory rules on selling digital services were restrictive when last documented.

Dependence on someone else's data can end a product: GummySearch, a research tool used for validation, closed on 30 November 2025 (GummySearch). Dependence on someone else's model invites the "wrapper" label already aimed at a funded player (36Kr).
