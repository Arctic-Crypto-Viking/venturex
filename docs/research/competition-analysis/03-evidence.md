# Evidence: what the research says

Nobody has been shown to predict winners among consumer and software ideas from a description, so state of the art means a provable process. This tab holds the studies behind that statement, with their limits.

## Experts cannot rank consumer and software ideas from a description

In the best study of its kind, 251 experienced entrepreneurs, investors and executives rated 537 ventures from written summaries. Their ratings separated good from bad in hardware, energy, life sciences and medical devices, but not in consumer products, consumer web and mobile, or enterprise software ([Scott, Shu and Lubynsky](https://ideas.repec.org/a/inm/ormnsc/v66y2020i3p1278-1299.html)). Those are the sectors a solo-founder service will mostly see.

At a large, successful venture firm the correlation between partners' scores and eventual returns was **0.1**. The authors state that "it is impossible to know in advance which ideas will work" ([Kerr, Nanda and Rhodes-Kropf](https://www.nber.org/system/files/working_papers/w20358/w20358.pdf)). In Nigeria's national business-plan competition, judges' scores were "uncorrelated with business survival, employment, sales, or profits three years later" ([McKenzie and Sansone](https://ideas.repec.org/p/cpr/ceprdp/12523.html)).

One finding points the other way, and a second seems to. In US new-venture competitions, judges' ranks strongly predict later venture success: the team score best predicts early success, and the technology and product score predicts acquisition or a stock-market listing ([Howell](https://www.nber.org/papers/w23874)). Those judges saw teams pitch in person, so it shows that structured judging of a team and a product carries signal, not that an idea description does.

A simple rule that counts good and bad cues predicted 86.0% of outcomes for early-stage ventures ([Åstebro and Elhedhli](https://doi.org/10.1287/mnsc.1050.0468)). But in a related sample only 7–9% of inventions reached the market at all ([Åstebro](https://ideas.repec.org/a/ecj/econjl/v113y2003i484p226-239.html)), so "always predict failure" already scores above 90%. Accuracy as a headline number proves nothing.

That second finding still helps New Venture. The simple count reproduced 91.8% of the experts' correct forecasts, which supports binary gates plus a short additive score as a reasonable form.

Language models do no better on the question that matters. They agree with investor judges on written plans at a correlation of about 0.52 ([Csaszar, Ketkar and Kim](https://arxiv.org/abs/2408.08811)), which matches an unreliable yardstick. On one small benchmark of 50 startups, an unaided GPT-4o reached 26% accuracy with 100% recall and 21% precision, which the authors call "a pronounced over-prediction bias" ([Wang, Ihlamur and Alican](https://arxiv.org/pdf/2405.19456)).

No study was found that tests an AI's verdict on a user's own idea against that idea's later revenue. No peer-reviewed study was found that validates a rubric like New Venture's five score dimensions against later revenue either. The 25-point score is a sensible checklist, not a proven predictor, and its weights are an assumption.

## The proven benefit is in the method: hypothesis, test, threshold

What does have causal evidence is a way of deciding. Across four randomised trials with 759 startups, founders were taught to state a theory, derive hypotheses and test them ([Camuffo and co-authors](https://openaccess.city.ac.uk/id/eprint/32437/)). They were 9.8 percentage points more likely to terminate their project and did so about 2.7 weeks earlier.

They were also more likely to pivot radically once or twice, less likely to pivot more often or not at all, and they earned more revenue. Stopping sooner, and earning more, is the measured benefit. A product that counts terminated ideas as a successful outcome is aligned with the evidence; one judged by how many users proceed is not.

Fixing the threshold beforehand has support from two directions. In experiments with senior executives, "precommitment to a predetermined decision rule" was among the best aids against staying with a losing course, though none removed the bias ([Boulding, Morgan and Staelin](https://doi.org/10.1177/002224379703400114)). When large clinical trials had to declare their outcome in advance, the share reporting a benefit fell from 57% to 8% ([Kaplan and Irvin](https://journals.plos.org/plosone/article?id=10.1371/journal.pone.0132382)).

Neither study is about founders, so this is support by analogy. In the executive experiments, rules people set for themselves did little, which argues for the platform setting the number.

The method has known failure modes, and a product built on it should say so:

- Tests without a theory drift toward what is easy to measure and favour incremental ideas ([Felin and co-authors](https://www.sciencedirect.com/science/article/pii/S0024630119301505)).
- Early testers can be the wrong people: products aimed at women launched to a 90%-male audience saw 45% less growth a year later ([Cao, Koning and Nanda](https://www.hbs.edu/faculty/Pages/profile.aspx?facId=876389&view=publications)).
- Strictly enforced gate criteria made projects inflexible and hurt novel products in a study of 120 projects ([Sethi and Iqbal](https://doi.org/10.1509/jmkg.72.1.118)).

A single one-week test with a fixed threshold is a screening device with a real risk of false negatives for novel ideas.

## Models flatter the user

Flattery is measured, persistent and commercially rewarded. A study of 11 leading models published in *Science* in March 2026 found they endorsed the user's position 49% more often than humans did, and users preferred the agreeable model ([Stanford](https://news.stanford.edu/stories/2026/03/ai-advice-sycophantic-models-research)). The same text gets warmer feedback when the user says they like it ([Sharma and co-authors](https://arxiv.org/abs/2310.13548)).

When users pushed back, models gave way in 58% of cases across the rebuttal types of one benchmark, and about a quarter of those moves went from right to wrong ([SycEval](https://arxiv.org/abs/2502.08177)). A September 2026 audit of that benchmark found confounds in its prompt templates, so such rates depend on how the test is built ([arXiv 2609.32867](https://arxiv.org/abs/2609.32867)). Memory makes it worse: stored user profiles had the strongest effect on agreement in a two-week study ([MIT News](https://news.mit.edu/2026/personalization-features-can-make-llms-more-agreeable-0218)).

OpenAI's 2025 rollback shows the mechanism. An update trained partly on thumbs-up data became "overly flattering or agreeable" ([OpenAI, April 2025](https://openai.com/index/sycophancy-in-gpt-4o/)), passed offline tests and was liked in A/B tests before it was withdrawn ([OpenAI](https://openai.com/index/expanding-on-sycophancy/)). A verdict service tuned on satisfaction, retention or conversion will drift toward GO in the same way.

Mitigations differ in strength:

- Telling the model to "be less validating" swung behaviour to extremes without making it sensitive to context ([ELEPHANT](https://arxiv.org/pdf/2505.13995)).
- Third-person rewriting gave only modest gains in that benchmark, but cut sycophancy by up to 63.8% in a debate setting in another ([SYCON-Bench](https://arxiv.org/abs/2505.23840)).
- Single AI evaluations of business models were "inconsistent and biased", while aggregated ones tended to resemble experts' rankings ([Doshi and co-authors](https://doi.org/10.1002/smj.3677)).
- A panel of smaller models from different families beat a single large judge ([Verga and co-authors](https://arxiv.org/abs/2404.18796)).
- Models score their own text higher than equally good text by others ([Panickssery and co-authors](https://arxiv.org/abs/2404.13076)).

The labs report large reductions on their own tests ([OpenAI](https://openai.com/index/introducing-gpt-5/), [Anthropic](https://www.anthropic.com/news/protecting-well-being-of-users)); those are vendor claims on vendor benchmarks. No study was found that measures flattery specifically on business-idea feedback. That is a gap New Venture could fill with its own published test.

One field result is a warning for any AI-advice product. In a five-month experiment with 640 Kenyan entrepreneurs, a GPT-4 business assistant had no average effect: strong performers gained and weak ones lost. The published abstract puts it at "over 15%" better for high performers and "nearly 10% worse" for low performers; the working paper has just over 15% and about 8% ([published record](https://doi.org/10.1287/mnsc.2024.06909), [working paper](https://www.hks.harvard.edu/centers/cid/publications/uneven-impact-generative-ai-entrepreneurial-performance)).

The difference came from the advice entrepreneurs chose to implement. New Venture's stranger customer, a first-timer with an untested idea, resembles the group that lost. Open-ended advice is the risky part of the product; a specific test, a number fixed in advance and a recorded reason are the safe part.

## Money beats words, and payers beat amounts

Stated willingness to pay overstates real willingness to pay by 21% on average, more for expensive and specialty goods ([Schmidt and Bijmolt](https://link.springer.com/article/10.1007/s11747-019-00666-6)). In crowdfunding, the number of backers predicts a product's later market performance while the amount raised does not ([Stanko and Henard](https://ideas.repec.org/a/eee/respol/v46y2017i4p784-798.html)).

Showing a price probably changes the answer, but no measured case was found. A demand-test vendor's illustrative example has a plain waitlist drawing 5% sign-ups, while priced offers draw 3.0%, 2.6% and 1.5% of visitors to click through at three rising prices ([Horizon](https://www.gethorizon.net/glossary/smoke-test)). It is an example, not a measured case.

Small payments sort leads far better than email addresses: by more than 12 times in one vendor case and 30 times in agency data ([BackerKit](https://www.backerkit.com/blog/backerkit-pre-launch-reservation), [LaunchBoom](https://medium.com/launchboom/how-to-build-a-pre-launch-email-list-that-is-30x-more-likely-to-buy-bda1a7563b2a)). Those multiples come from sellers of the method and cover crowdfunded physical products.

One practitioner says the same thing. An angel investor commenting on Indie Hackers: "Prepayment is the only one-week signal I trust… everything softer (signups, kind words, survey answers) is politeness, not demand" ([Indie Hackers](https://www.indiehackers.com/post/i-m-building-a-tool-to-help-founders-kill-bad-startup-ideas-before-building-what-signal-would-you-trust-b905feb023)).

The honest limit is that no study compares several kinds of pre-launch evidence head to head against later revenue for the same ventures. Only the two ends of the evidence ladder are measured: stated intent is inflated, and paying backers predict. The middle rungs are ordered by reasoning about what the customer gives up.

## What a credible track record looks like

Forecasting research sets the standard for proving judgement. Predictions are registered before outcomes exist, every prediction is scored, baselines are shown and results are public ([ForecastBench](https://arxiv.org/abs/2409.19839)).

On such leak-free questions the best AI systems now beat the general public ([Forecasting Research Institute, October 2025](https://forecastingresearch.substack.com/p/ai-llm-forecasting-model-forecastbench-benchmark)). They trail the best human forecasters by 0.017 Brier points as of January 2026 ([Forecasting Research Institute](https://forecastingresearch.substack.com/p/llms-are-closing-the-gap-on-human)). That supports using models as disciplined forecasters; it does not support claims of foresight.

Back-tests on known companies are not evidence, because models have memorised the outcomes and instructions to ignore later information fail ([Lopez-Lira, Tang and Zhu](https://arxiv.org/abs/2504.14765)). None of the validators examined publishes a verifiable record.

Sample size sets the timetable. By standard binomial arithmetic, one overall hit rate within ten percentage points needs about 96 resolved cases at 95% confidence, and within five points about 385. Calibration by likelihood band needs several times more. Venture outcomes take years; one-week tests resolve in a week.
