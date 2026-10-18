/**
 * The agents module (core_030_agents.sql): the TypeScript shapes of its tables
 * and the contract a product's agent runner implements. Products put their own
 * focus (segments, markets, watchlists) in `config` and their own results in
 * `output` / `body`, so this file names no product concept.
 */
export type AgentKind = "collector" | "personal" | "social";
export type AgentStatus = "active" | "paused" | "unavailable" | "deleted";
export type RunStatus = "running" | "succeeded" | "failed" | "skipped";
export type ItemKind = "alert" | "update" | "answer" | "question" | "ticket" | "note";

export type AgentDefinition = {
  key: string; name: string; kind: AgentKind; description: string | null;
  default_schedule: string | null; default_model: string | null; default_config: Record<string, unknown>;
  confirmation_text: string | null; text_version: number; is_active: boolean; sort_order: number;
};

export type Agent<C = Record<string, unknown>> = {
  id: string; account_id: string; user_id: string; definition_key: string; name: string; status: AgentStatus;
  schedule: string | null; delivery: { push?: boolean; email?: boolean }; model: string | null; config: C;
  confirmed_at: string | null; confirmation_text: string | null; text_version: number | null;
  last_run_at: string | null; created_at: string; updated_at: string;
};

export type AgentRun<O = Record<string, unknown>> = {
  id: string; definition_key: string; agent_id: string | null; account_id: string | null;
  started_at: string; finished_at: string | null; status: RunStatus; mode: string | null; model: string | null;
  tokens_in: number; tokens_out: number; cost_usd_micro: number; sources_used: unknown[]; summary: string | null; error: string | null; output: O;
};

export type AgentItem<B = Record<string, unknown>> = {
  id: string; account_id: string; agent_id: string | null; run_id: string | null; thread_key: string; kind: ItemKind;
  re: string | null; title: string | null; body: B; author: "agent" | "user" | "system"; status: "open" | "answered" | "closed"; created_at: string;
};

export type CollectorSnapshot<P = Record<string, unknown>> = { id: number; definition_key: string; taken_at: string; payload: P; source_health: Record<string, "ok" | "stale" | "failed"> };

/**
 * What a runner does for one definition. The scheduler (a product's cron or a
 * worker) opens a run, calls `run`, and closes it with the usage figures the
 * runner reports. Collectors get no agent; personal agents get theirs.
 */
export type RunContext<C = Record<string, unknown>> = {
  definition: AgentDefinition;
  agent: Agent<C> | null;
  run: Pick<AgentRun, "id" | "mode">;
  /** Append an item to the person's thread (personal agents) — never for collectors. */
  emit: (item: Pick<AgentItem, "thread_key" | "kind" | "title" | "body"> & { re?: string }) => Promise<void>;
  /** Store a shared snapshot (collectors). */
  snapshot: (payload: unknown, sourceHealth?: Record<string, "ok" | "stale" | "failed">) => Promise<void>;
};

export type RunResult = { summary: string; output?: unknown; sourcesUsed?: unknown[]; tokensIn?: number; tokensOut?: number; costUsdMicro?: number; model?: string };

export type AgentRunner<C = Record<string, unknown>> = {
  definitionKey: string;
  run: (ctx: RunContext<C>) => Promise<RunResult>;
};
