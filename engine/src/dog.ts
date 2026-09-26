// Builds the Agent SDK options that put the dog (Claude Code) inside Tini's fence.
// Layer 1 = staging (cwd is a fresh workspace), layer 2 = this PreToolUse hook,
// layer 3 = Claude Code's OS sandbox for Bash and its child processes.
import type { HookCallback, Options, PreToolUseHookInput } from "@anthropic-ai/claude-agent-sdk";
import { ALLOWED_TOOLS, checkToolCall, type Fence, type GuardDecision } from "./guard.ts";

export interface DogHooks {
  onDecision?: (tool: string, input: Record<string, unknown>, d: GuardDecision) => void;
}

export function dogOptions(fence: Fence, hooks: DogHooks = {}, extra: Partial<Options> = {}): Options {
  const guard: HookCallback = async (raw) => {
    const input = raw as PreToolUseHookInput;
    const toolInput = (input.tool_input ?? {}) as Record<string, unknown>;
    const d = checkToolCall(input.tool_name, toolInput, input.cwd || fence.workspace, fence);
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
          `If you truly need it, say so in one sentence and continue with other work; the owner reviews requests, ` +
          `and approved files appear in ./assets/.`,
      },
    };
  };

  return {
    cwd: fence.workspace,
    model: "sonnet",
    tools: [...ALLOWED_TOOLS],            // base tool set: no Agent/subagents, no WebFetch/WebSearch, no Monitor
    disallowedTools: ["Agent", "Task"],   // belt and braces: subagent tool was renamed Task -> Agent
    permissionMode: "default",
    permissionPrompts: "none",            // anything our hook doesn't explicitly allow is denied, never a hanging prompt
    settingSources: [],                   // ignore the laptop owner's ~/.claude and project settings
    hooks: { PreToolUse: [{ hooks: [guard] }] },
    sandbox: {
      enabled: true,
      failIfUnavailable: true,
      autoAllowBashIfSandboxed: true,
      allowUnsandboxedCommands: false,    // no dangerouslyDisableSandbox retries
      filesystem: {
        denyRead: ["~/"],
        allowRead: [fence.workspace],
        allowWrite: [fence.workspace],
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
