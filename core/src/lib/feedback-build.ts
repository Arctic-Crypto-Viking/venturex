import "server-only";

/**
 * "Start the build with Claude" (Admin → Feedback, migration 030): the founder picks
 * the status, the server opens one issue in the product's GitHub repository that
 * mentions @claude, and the Claude Code GitHub Action in that repository
 * (.github/workflows/claude.yml) implements it on a branch and opens a pull request.
 * Nothing merges by itself; the founder reviews the pull request and sets the
 * suggestion to Shipped afterwards.
 *
 * What leaves the product: title, summary, kind, vote count and the founder's note —
 * the fields every signed-in person already reads on the board. Never the author
 * and never the original text (/privacy stays as it is). The repository is private
 * and the issue is written as the founder, with the founder's own token.
 *
 * Needs FEEDBACK_GITHUB_REPO ("owner/name") and FEEDBACK_GITHUB_TOKEN (a fine-grained
 * personal access token with Issues: read and write on that repository). Without
 * them the status is not offered (SETUP-GUIDE Part 17).
 */

export type FeedbackBuildItem = {
  id: string;
  kind: string;
  title: string;
  summary: string;
  vote_count: number;
};

export function feedbackBuildConfig(): { repo: string; token: string } | null {
  const repo = process.env.FEEDBACK_GITHUB_REPO?.trim();
  const token = process.env.FEEDBACK_GITHUB_TOKEN?.trim();
  if (!repo || !token || !/^[\w.-]+\/[\w.-]+$/.test(repo)) return null;
  return { repo, token };
}

const KIND_WORD: Record<string, string> = { idea: "Idea", problem: "Problem", other: "Other" };

/** Opens the issue and returns its address. Throws with a readable message when GitHub refuses. */
export async function openFeedbackBuildIssue(
  item: FeedbackBuildItem,
  opts: { note: string | null; productName: string; adminUrl: string },
): Promise<string> {
  const cfg = feedbackBuildConfig();
  if (!cfg) throw new Error("Start the build is not set up: FEEDBACK_GITHUB_REPO and FEEDBACK_GITHUB_TOKEN are missing.");

  const body = [
    `@claude Please build this suggestion from the ${opts.productName} feedback board.`,
    "",
    `**Kind:** ${KIND_WORD[item.kind] ?? item.kind} · **Votes:** ${item.vote_count} · **Board id:** \`${item.id}\``,
    "",
    `**Summary:** ${item.summary}`,
    opts.note ? `\n**Founder's note:** ${opts.note}` : "",
    "",
    "How to work:",
    "1. Read `CLAUDE.md` and the docs it names first, and follow the repository's rules (RLS on every tenant table, migrations append-only, no visible string outside the dictionaries, mobile first).",
    "2. Make the smallest complete change on a branch and open a pull request that links this issue. Do not merge it.",
    "3. If the suggestion is unclear, or too large for one pull request, comment here with your questions or the split instead of guessing.",
    `4. Leave the feedback tables alone: the founder sets the suggestion to Shipped on [Admin → Feedback](${opts.adminUrl}) after the merge.`,
  ].join("\n");

  const res = await fetch(`https://api.github.com/repos/${cfg.repo}/issues`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${cfg.token}`,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ title: `Feedback: ${item.title}`, body, labels: ["feedback"] }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    const detail = (() => { try { return (JSON.parse(text) as { message?: string }).message; } catch { return text.slice(0, 200); } })();
    throw new Error(`GitHub refused the issue (${res.status}${detail ? `: ${detail}` : ""}). Check FEEDBACK_GITHUB_REPO and the token's Issues permission.`);
  }
  const json = (await res.json()) as { html_url?: string };
  if (!json.html_url || !json.html_url.startsWith("https://")) throw new Error("GitHub created the issue but returned no address.");
  return json.html_url;
}
