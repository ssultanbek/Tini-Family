# Verified facts (checked against current docs and installed type definitions, Sept 26 2026)

Use these instead of memory. If you need something not listed here, check the current docs
(code.claude.com/docs, ai.google.dev) or the installed `.d.ts` files, then add it here with the source.
Items marked **VERIFY** were not confirmed yet: confirm before relying on them.

## Claude Agent SDK (TypeScript)

- Package `@anthropic-ai/claude-agent-sdk` **0.3.283** (bundles Claude Code 2.1.283; the SDK version tracks the bundled CLI version). Installed in `engine/`.
- `query({ prompt, options })`. `prompt` is `string | AsyncIterable<SDKUserMessage>`. The async-iterable form keeps one session open so we can push follow-up messages: that's `engine/src/inbox.ts`.
- `SDKUserMessage = { type: "user", message: { role: "user", content }, parent_tool_use_id: null, priority?: "now" | "next" | "later", shouldQuery?, ... }`.
- **Auth:** products built on the Agent SDK must use API-key auth, not claude.ai login (overview page note). We use `ANTHROPIC_API_KEY`.
- Options we use (all confirmed in `sdk.d.ts`):
  - `cwd`, `model` (alias like `"sonnet"` works)
  - `tools: string[]`: the **base set** of built-in tools. We pass `["Read","Write","Edit","Glob","Grep","Bash"]`, which removes Agent, WebFetch, WebSearch, Monitor, AskUserQuestion, etc.
  - `disallowedTools: ["Agent","Task"]` as a second guard. **The subagent tool is named `Agent` now**, not `Task`.
  - `permissionMode: "default"`, `permissionPrompts: "none"`: anything our hook doesn't allow is denied, never a hanging prompt.
  - `settingSources: []`. The default loads user, project and local settings, including the owner's hooks and allow rules, so we turn that off.
  - `hooks`, `sandbox`, `maxTurns`, `maxBudgetUsd`, `stderr`.
  - `resume` / `sessionId`, for resume after restart.
  - `systemPrompt: { type: "preset", preset: "claude_code", append: "..." }` keeps Claude Code's prompt and adds ours.
  - `env` **replaces** the whole subprocess environment. Spread `process.env` if you set it.
- **VERIFY:** `Query.interrupt()` for the Stop button (check `sdk.d.ts` for the Query interface) and how an interrupted turn surfaces in the message stream.
- **Hooks:**
  - PreToolUse returns `{ hookSpecificOutput: { hookEventName: "PreToolUse", permissionDecision: "allow"|"deny"|"ask"|"defer", permissionDecisionReason, updatedInput? } }`.
  - `deny` beats everything else. Return `{}` to change nothing.
  - Hook input has `session_id`, `cwd`, `hook_event_name`, `tool_name`, `tool_input`; the second callback argument is the tool use id.
  - PostToolUse can return `additionalContext` or `updatedToolOutput`.
  - Default hook timeout is 600s. A timed-out PreToolUse doesn't run the tool, and the turn continues.
- **Sandbox** (OS-level, macOS Seatbelt):
  - It applies to **Bash, PowerShell and Monitor only**. Read/Edit/Write are *not* sandboxed, so our PreToolUse hook is the only enforcer for the Read tool.
  - Default read access is the **entire computer, including `~/.ssh` and `~/.aws`**. Our config: `filesystem.denyRead: ["~/"]`, `allowRead: [workspace]` (the narrower rule wins), `allowWrite: [workspace]`.
  - `allowUnsandboxedCommands: false` disables the `dangerouslyDisableSandbox` retry, which is otherwise on by default.
  - `failIfUnavailable: true`, `autoAllowBashIfSandboxed: true`.
  - `network: { allowedDomains, strictAllowlist: true }`.
  - `credentials.envVars: [{ name, mode: "deny" }]` unsets those env vars for sandboxed commands.
  - Violations show up in the command's output (e.g. "Operation not permitted").
  - Claude Code's protected paths (`.claude/*` settings, hooks, etc.) are never writable by sandboxed commands.
  - With a settings source excluded via `settingSources`, that source's `sandbox.filesystem` entries are ignored (v2.1.246+).

## Gemini (primary model on the AI ladder)

- SDK `@google/genai` **2.24.0**:
  ```
  new GoogleGenAI({ apiKey }).models.generateContent({ model, contents, config })
  ```
  `config` supports `systemInstruction`, `responseMimeType: "application/json"`, `responseJsonSchema`, `abortSignal`, `httpOptions: { timeout, retryOptions: { attempts } }`. The result text is `res.text`.
- **The SDK retries 5 times by default.** Set `httpOptions.retryOptions.attempts: 1` so the ladder controls timing.
- **Current Flash model:** "Gemini 3.8 Flash", id `gemini-3.8-flash` (per ai.google.dev, Sept 2026). Keep it overridable with `GEMINI_MODEL`, and confirm it's listed in the project's AI Studio.
- Rate limits are per **project**. Linking billing moves Free → Tier 1 instantly. That fixes 429 (quota) errors, not 503s.
- **503 means Google's servers are overloaded**, not us; retry and fall back. There are reports of requests that **hang with no error**, so the client-side timeout (8s) is mandatory.

## Anthropic API (backup model on the AI ladder)

- `@anthropic-ai/sdk` **0.128.0**, model `claude-haiku-4-5` (dated id `claude-haiku-4-5-20251001`).
- Use `new Anthropic({ apiKey, maxRetries: 0 })`, and per request `{ signal, timeout }`.
- Haiku accepts images (base64 image blocks), so it can back up Gemini vision too.
- Keys not scoped to a workspace must send the anthropic-workspace-id header on every request (400 otherwise). We use a workspace-scoped key, so no header is needed. Source: platform.claude.com/docs/manage-claude/authentication.

## Other

- `zod` **4.6.5**: `z.toJSONSchema(schema)` exists. Delete `$schema` before sending the result to Gemini.
- Mac tools: `brew install gitleaks exiftool`. `exiftool-vendored` needs Perl, which macOS ships with.
- **GitHub push protection blocks pushes that contain real-looking API keys.** Demo-kit fake keys must be assembled at runtime by the script, never written into committed files.
- Mac can't create folders at `/` without admin, so demo files live at `~/Clients/Rivera/...`.
- Chrome app mode for the "desktop app" window: `open -na "Google Chrome" --args --app=http://localhost:4000`.
