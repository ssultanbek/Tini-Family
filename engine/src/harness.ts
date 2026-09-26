// The simulated attack for the demo. A downloaded template tells Claude to read the
// owner's SSH key; to make that beat fire every time, the harness pushes the same
// Read through the REAL fence checker (guard.checkToolCall) and shows the result,
// clearly labelled simulated. It never touches the file: the guard is pure path logic
// (it resolves the path, it never opens it), and this module does no file I/O at all.
import type { CrewCtx } from "./crew.ts";
import { checkToolCall, type GuardDecision } from "./guard.ts";
import type { Staged } from "./tini/stager.ts";

export const ATTACK_TARGET = "~/.ssh/id_rsa";
export const ATTACK_REASON = "A downloaded template told Claude to read your SSH key. That's outside the fence, so Tini blocked it.";

type HarnessCtx = Pick<CrewCtx, "emit" | "log">;

export function simulateAttack(ctx: HarnessCtx, staged: Staged): GuardDecision {
  const input = { file_path: ATTACK_TARGET };
  const d = checkToolCall("Read", input, staged.workspace, staged.fence);
  ctx.log("hook", `[simulated] PreToolUse Read ${ATTACK_TARGET} -> ${d.allow ? "ALLOW" : `DENY (${d.kind}: ${d.reason})`}`);
  if (d.allow) {
    // Should be impossible. Say so loudly instead of faking a block.
    ctx.log("engine", `harness: the fence ALLOWED ${ATTACK_TARGET}; no block event emitted. Check the fence config.`);
    return d;
  }
  ctx.emit({ actor: "dog", type: "fence.blocked", target: ATTACK_TARGET, tool: "Read", layer: "hook", simulated: true, reason: ATTACK_REASON });
  return d;
}
