/**
 * The product's words in English: the source shape every other language must
 * match (Dict). {app} is the product name (src/brand.ts), filled in at render.
 * Core's own words (sign-in, switches) live in core/src/i18n. The door's copy
 * follows the sketch ("New Venture — service concept") and the triage protocol.
 */
export const en = {
  common: {
    beta: "Beta",
    privacy: "Privacy",
    signIn: "Sign in",
    runTheGates: "Run the five gates — free",
    nothingSaved: "Nothing is saved until you ask for a verdict.",
    myVentures: "My ventures",
    feedback: "Feedback",
    admin: "Admin",
  },
  landing: {
    eyebrow: "For anyone with an idea and no time to waste on the wrong one",
    title: "Find out this week whether your idea deserves your next 30 days.",
    body: "Five kill gates, a score out of 25, one answer: GO, PARKED or KILLED — with the reason in writing and the one test that would change it. No opinion, no flattery, no pitch deck.",
    how: {
      eyebrow: "How it works",
      steps: [
        { title: "Describe it plainly", body: "Five lines, one each: the idea, who has the problem, what they use today, what you could ship in 30 days, your unfair way to reach them." },
        { title: "Five gates, one No kills", body: "Thirty seconds each. Harsher than your enthusiasm on purpose: no reachable buyers, no one paying for a worse version, nothing sellable in 30 days, you deliver every unit, you won't want it in 18 months." },
        { title: "Score what you can prove", body: "Evidence of demand, time to first euro, price point, distribution edge, margin after fulfilment. Each level has a definition — pick the one you can defend." },
        { title: "One answer, one test", body: "18 or more is GO, with this week's test and a number set in advance. 13 to 17 is PARKED, with the trigger that would revive it. Below that, or a No at a gate, is KILLED — and the reason stays on record so it cannot come back unchanged." },
      ],
    },
    states: {
      eyebrow: "The three states",
      go: { name: "GO", when: "18 or more", what: "A venture card and this week's test, with its number." },
      parked: { name: "PARKED", when: "13 to 17", what: "The one external event that would revive it, written down." },
      killed: { name: "KILLED", when: "A No at a gate, or under 13", what: "The gate and the reason, so it cannot resurface in eight months feeling fresh." },
    },
    after: {
      eyebrow: "After a GO",
      title: "The workspace takes it to the first paying customer.",
      body: "Eight stages, each ending in a decision: the customer problem, the market, willingness to pay, the offer, the smallest sellable thing, the page, the launch, the hand-off. One test a week, with the number fixed before it runs. At most three ventures live, and one of them gets the hours.",
    },
    footer: { made: "Built for people who would rather know." },
  },
  home: {
    title: "My ventures",
    empty: "No ventures yet.",
    emptyHint: "Run an idea through the door; a verdict you save becomes a venture here.",
    doorSoon: "The door opens with the next build step.",
    readOnly: "Read-only view",
  },
  notFound: {
    body: "There is nothing here. If you expected a page, you may be signed in with another login.",
    back: "Back to the start",
    signedInAs: "Signed in as {email}",
    signOut: "Sign out",
  },
  plans: {
    ventureOne: "1 saved venture",
    ventureMany: "{n} saved ventures",
    venturesUnlimited: "Unlimited saved ventures",
    workspace: "The workspace: stages, ledger, decisions, tests",
    membersOne: "1 invited person per venture",
    membersMany: "{n} invited people per venture",
    weeklyReview: "The Monday review",
    forecastPublic: "A public forecast log",
  },
};

export type Dict = typeof en;
