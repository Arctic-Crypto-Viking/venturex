import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Agent, AgentDefinition, AgentRunner, RunResult } from "./types";

/**
 * Runs one definition once: opens an agent_runs row, calls the product's
 * runner, closes the row with tokens and cost (FR-C2). Needs the service-role
 * client (`@core/lib/supabase/admin`): collectors write shared rows and a
 * personal agent's items are written on the person's behalf.
 */
export async function runAgent<C>(admin: SupabaseClient, runner: AgentRunner<C>, opts: { agent?: Agent<C> | null; mode?: string } = {}): Promise<{ runId: string; result?: RunResult; error?: string }> {
  const { data: def } = await admin.from("agent_definitions").select("*").eq("key", runner.definitionKey).maybeSingle();
  if (!def) throw new Error(`unknown agent definition ${runner.definitionKey}`);
  const definition = def as AgentDefinition;
  const agent = opts.agent ?? null;
  const { data: run, error: openErr } = await admin
    .from("agent_runs")
    .insert({ definition_key: definition.key, agent_id: agent?.id ?? null, account_id: agent?.account_id ?? null, mode: opts.mode ?? null, model: agent?.model ?? definition.default_model })
    .select("id")
    .single();
  if (openErr || !run) throw new Error(`could not open run: ${openErr?.message}`);
  const runId = run.id as string;
  try {
    const result = await runner.run({
      definition, agent, run: { id: runId, mode: opts.mode ?? null },
      emit: async (item) => {
        if (!agent) throw new Error("collectors do not emit personal items");
        await admin.from("agent_items").insert({ account_id: agent.account_id, agent_id: agent.id, run_id: runId, thread_key: item.thread_key, kind: item.kind, title: item.title ?? null, body: item.body ?? {}, re: item.re ?? null, author: "agent" });
      },
      snapshot: async (payload, sourceHealth) => {
        await admin.from("collector_snapshots").insert({ definition_key: definition.key, payload, source_health: sourceHealth ?? {} });
      },
    });
    await admin.from("agent_runs").update({
      finished_at: new Date().toISOString(), status: "succeeded", summary: result.summary, output: result.output ?? {},
      sources_used: result.sourcesUsed ?? [], tokens_in: result.tokensIn ?? 0, tokens_out: result.tokensOut ?? 0, cost_usd_micro: result.costUsdMicro ?? 0, model: result.model ?? agent?.model ?? definition.default_model,
    }).eq("id", runId);
    if (agent) await admin.from("agents").update({ last_run_at: new Date().toISOString() }).eq("id", agent.id);
    return { runId, result };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    await admin.from("agent_runs").update({ finished_at: new Date().toISOString(), status: "failed", error }).eq("id", runId);
    return { runId, error };
  }
}
