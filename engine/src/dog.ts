// Builds the Agent SDK options that put the dog (Claude Code) inside Tini's fence.
// Layer 1 = staging (cwd is a fresh workspace), layer 2 = this PreToolUse hook,
// layer 3 = Claude Code's OS sandbox for Bash and its child processes.
import type { HookCallback, Options, PostToolUseHookInput, PreToolUseHookInput } from "@anthropic-ai/claude-agent-sdk";
import { ALLOWED_TOOLS, checkToolCall, type Fence, type GuardDecision } from "./guard.ts";

/** Who decides each tool call: Tini's fence by default; observe mode swaps in its own policy. */
export type Decide = (tool: string, input: Record<string, unknown>, cwd: string) => GuardDecision;
export interface DogPolicy {
  decide?: Decide;
  extraRead?: string[];   // sandbox allowRead beyond the workspace (observe: the demo folders)
  denyRead?: string[];    // narrower sandbox denies inside those (observe: private files found there)
}

export interface DogHooks {
  onDecision?: (tool: string, input: Record<string, unknown>, d: GuardDecision) => void;
  /** A tool call that ran successfully (PostToolUse): becomes a brick. */
  onToolDone?: (tool: string, input: Record<string, unknown>, response: unknown) => void;
}

// npm's package cache. The OS sandbox may read and write it so `npm install` works inside
// the yard; ~/.npmrc (auth tokens) and everything else under ~/ stays denied.
const NPM_CACHE = "~/.npm";

export function dogOptions(fence: Fence, hooks: DogHooks = {}, extra: Partial<Options> = {}, policy: DogPolicy = {}): Options {
  const decide: Decide = policy.decide ?? ((tool, input, cwd) => checkToolCall(tool, input, cwd, fence));
  const guard: HookCallback = async (raw) => {
    const input = raw as PreToolUseHookInput;
    const toolInput = (input.tool_input ?? {}) as Record<string, unknown>;
    const d = decide(input.tool_name, toolInput, input.cwd || fence.workspace);
    hooks.onDecision?.(input.tool_name, toolInput, d);
    if (d.allow) {
      return { hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow", permissionDecisionReason: "Inside Tini's fence" } };
    }
    return {
      hookSpecificOutput: {
        hookEventName: "PreToolUse",
        permissionDecision: "deny",
        permissionDecisionReason:
          `BLOCKED by Tini: ${d.reason} Do not retry or look for another way to reach it. ` +
          `If you truly need it, call request_access with the path and a one-line reason, then continue with other work; ` +
          `the owner reviews requests, and approved files appear in ./assets/.`,
      },
    };
  };

  const done: HookCallback = async (raw) => {
    const input = raw as PostToolUseHookInput;
    try { hooks.onToolDone?.(input.tool_name, (input.tool_input ?? {}) as Record<string, unknown>, input.tool_response); }
    catch { /* event mapping never breaks Claude's turn */ }
    return {};
  };

  return {
    cwd: fence.workspace,
    model: "sonnet",
    tools: [...ALLOWED_TOOLS],            // base tool set: no Agent/subagents, no WebFetch/WebSearch, no Monitor
    disallowedTools: ["Agent", "Task"],   // belt and braces: subagent tool was renamed Task -> Agent
    permissionMode: "default",
    permissionPrompts: "none",            // anything our hook doesn't explicitly allow is denied, never a hanging prompt
    settingSources: [],                   // ignore the laptop owner's ~/.claude and project settings
    hooks: { PreToolUse: [{ hooks: [guard] }], PostToolUse: [{ hooks: [done] }] },
    sandbox: {
      enabled: true,
      failIfUnavailable: true,
      autoAllowBashIfSandboxed: true,
      allowUnsandboxedCommands: false,    // no dangerouslyDisableSandbox retries
      filesystem: {
        denyRead: ["~/", ...(policy.denyRead ?? [])],
        allowRead: [fence.workspace, NPM_CACHE, ...(policy.extraRead ?? [])],
        allowWrite: [fence.workspace, NPM_CACHE],
      },
      network: { allowedDomains: fence.allowedDomains, strictAllowlist: true },
      credentials: {
        envVars: [
          { name: "ANTHROPIC_API_KEY", mode: "deny" },
          { name: "GEMINI_API_KEY", mode: "deny" },
        ],
      },
    },
    maxTurns: 40,
    maxBudgetUsd: 2,
    ...extra,
  };
}
