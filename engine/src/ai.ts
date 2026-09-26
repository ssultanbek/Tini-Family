// THE AI LADDER. Every AI call in the engine goes through ask():
//   disk cache -> Gemini Flash (8s, one retry) -> Claude Haiku (10s) -> hard-coded fallback.
// It never throws. Every model answer is validated with zod before it's accepted,
// and only model answers are cached (never fallbacks). AI only writes words and picks
// subsets; enforcement never depends on it.
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { GoogleGenAI } from "@google/genai";
import Anthropic from "@anthropic-ai/sdk";

export type AiSource = "cache" | "gemini" | "claude" | "fallback";
export interface AiImage { mimeType: string; data: string } // base64, no data: prefix

export interface AskArgs<T> {
  task: string;              // short name, e.g. "plan-fence"; shows in logs and the cache key
  instructions: string;      // system prompt
  input: unknown;            // string or JSON-able object
  schema: z.ZodType<T>;
  fallback: T;               // returned (never cached) when every rung fails
  images?: AiImage[];
  cache?: boolean;           // default true
}
export interface AskResult<T> { value: T; source: AiSource; ms: number; trail: string }
export type Ask = <T>(args: AskArgs<T>) => Promise<AskResult<T>>;

// ---------------------------------------------------------------------------
// Providers: take a prompt, return raw text. Throw ProviderError on failure.
// ---------------------------------------------------------------------------
export interface ProviderCall { system: string; user: string; jsonSchema: object; images?: AiImage[]; signal: AbortSignal; timeoutMs: number }
export type Provider = (call: ProviderCall) => Promise<string>;
export class ProviderError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export type FaultMode = "ok" | "503" | "429" | "hang" | "garbage" | "down";
export interface Faults { gemini: FaultMode; claude: FaultMode }
const MODES: FaultMode[] = ["ok", "503", "429", "hang", "garbage", "down"];

/** "gemini=503,claude=hang" -> { gemini: "503", claude: "hang" }. Unknown parts are ignored. */
export function parseFaults(spec: string | undefined): Faults {
  const f: Faults = { gemini: "ok", claude: "ok" };
  for (const part of (spec ?? "").split(",")) {
    const [k, v] = part.split("=").map((x) => x?.trim());
    if ((k === "gemini" || k === "claude") && MODES.includes(v as FaultMode)) f[k] = v as FaultMode;
  }
  return f;
}

/** Wraps a provider so TINI_FAULT can force it to fail in each way we've seen in the wild. */
export function withFault(p: Provider, mode: FaultMode): Provider {
  if (mode === "ok") return p;
  return (call) => {
    switch (mode) {
      case "503": return Promise.reject(new ProviderError("forced 503: model overloaded", 503));
      case "429": return Promise.reject(new ProviderError("forced 429: rate limited", 429));
      case "down": return Promise.reject(new ProviderError("forced down: connection refused", 0));
      case "garbage": return Promise.resolve("Sure! Here is some text that is not JSON {");
      case "hang": return new Promise<string>((_r, reject) => {
        call.signal.addEventListener("abort", () => reject(new ProviderError("aborted", 0)), { once: true });
      });
    }
  };
}

export function geminiProvider(apiKey: string, model: string): Provider {
  const client = new GoogleGenAI({ apiKey, httpOptions: { retryOptions: { attempts: 1 } } });
  return async ({ system, user, jsonSchema, images, signal }) => {
    try {
      const res = await client.models.generateContent({
        model,
        contents: [{ role: "user", parts: [...(images ?? []).map((i) => ({ inlineData: { mimeType: i.mimeType, data: i.data } })), { text: user }] }],
        config: {
          systemInstruction: system,
          responseMimeType: "application/json",
          responseJsonSchema: jsonSchema,
          abortSignal: signal,
          // The ladder owns retries and the 8s timeout (its own timer + abortSignal). Don't pass
          // httpOptions.timeout: the SDK sends it as a server deadline and Gemini 400s anything under 10s.
          httpOptions: { retryOptions: { attempts: 1 } },
        },
      });
      return res.text ?? "";
    } catch (e) {
      throw new ProviderError(errMsg(e), typeof (e as { status?: unknown }).status === "number" ? (e as { status: number }).status : 0);
    }
  };
}

export function claudeProvider(apiKey: string, model: string): Provider {
  const client = new Anthropic({ apiKey, maxRetries: 0 });
  return async ({ system, user, jsonSchema, images, signal, timeoutMs }) => {
    try {
      const res = await client.messages.create({
        model,
        max_tokens: 4096,
        system: `${system}\n\nReply with ONLY one JSON value matching this JSON Schema, no prose, no code fences:\n${JSON.stringify(jsonSchema)}`,
        messages: [{ role: "user", content: [
          ...(images ?? []).map((i) => ({ type: "image" as const, source: { type: "base64" as const, media_type: i.mimeType as "image/jpeg", data: i.data } })),
          { type: "text" as const, text: user },
        ] }],
      }, { signal, timeout: timeoutMs });
      return res.content.map((b) => (b.type === "text" ? b.text : "")).join("");
    } catch (e) {
      throw new ProviderError(errMsg(e), e instanceof Anthropic.APIError && typeof e.status === "number" ? e.status : 0);
    }
  };
}

// ---------------------------------------------------------------------------
// The ladder
// ---------------------------------------------------------------------------
export interface LadderOptions {
  gemini?: Provider | null;   // null = not configured (no key)
  claude?: Provider | null;
  geminiTimeoutMs?: number;   // 8000
  claudeTimeoutMs?: number;   // 10000
  retryDelayMs?: number;      // 600
  cacheDir?: string | null;   // ~/.tini/ai-cache; null disables the disk cache
  log?: (line: string) => void;
  modelTag?: string;          // part of the cache key, so a model switch doesn't serve stale answers
}

/** Builds the real ladder from env: GEMINI_API_KEY, ANTHROPIC_API_KEY, GEMINI_MODEL, TINI_BACKUP_MODEL, TINI_FAULT. */
export function createAiFromEnv(log?: (line: string) => void, env: NodeJS.ProcessEnv = process.env, faultSpec = env.TINI_FAULT): Ask {
  const faults = parseFaults(faultSpec);
  const geminiModel = env.GEMINI_MODEL || "gemini-3.8-flash";
  const backupModel = env.TINI_BACKUP_MODEL || "claude-haiku-4-5";
  const g = env.GEMINI_API_KEY ? geminiProvider(env.GEMINI_API_KEY, geminiModel) : null;
  const c = env.ANTHROPIC_API_KEY ? claudeProvider(env.ANTHROPIC_API_KEY, backupModel) : null;
  if (faultSpec) log?.(`fault injection: gemini=${faults.gemini} claude=${faults.claude}`);
  return createAi({
    gemini: g ? withFault(g, faults.gemini) : null,
    claude: c ? withFault(c, faults.claude) : null,
    log,
    modelTag: `${geminiModel}|${backupModel}`,
  });
}

export function createAi(opts: LadderOptions): Ask {
  const gT = opts.geminiTimeoutMs ?? 8000;
  const cT = opts.claudeTimeoutMs ?? 10000;
  const retryDelay = opts.retryDelayMs ?? 600;
  const cacheDir = opts.cacheDir === undefined ? path.join(os.homedir(), ".tini", "ai-cache") : opts.cacheDir;
  const log = opts.log ?? (() => {});

  return async function ask<T>(a: AskArgs<T>): Promise<AskResult<T>> {
    const t0 = Date.now();
    const trail: string[] = [];
    const done = (value: T, source: AiSource): AskResult<T> => {
      const r = { value, source, ms: Date.now() - t0, trail: trail.join(" > ") || "-" };
      try { log(`${a.task}: answered by ${source} in ${r.ms}ms (${r.trail})`); } catch { /* logging never breaks the ladder */ }
      return r;
    };
    try {
      let jsonSchema: Record<string, unknown>;
      try { jsonSchema = z.toJSONSchema(a.schema) as Record<string, unknown>; delete jsonSchema.$schema; }
      catch { jsonSchema = {}; }
      const user = typeof a.input === "string" ? a.input : JSON.stringify(a.input, null, 2);
      const useCache = a.cache !== false && cacheDir !== null;
      const key = crypto.createHash("sha256")
        .update(JSON.stringify([a.task, a.instructions, user, jsonSchema, (a.images ?? []).map((i) => i.mimeType + ":" + i.data), opts.modelTag ?? ""]))
        .digest("hex");
      const file = useCache ? path.join(cacheDir!, `${key}.json`) : "";

      // 1. cache
      if (useCache) {
        try {
          const hit = a.schema.safeParse(JSON.parse(fs.readFileSync(file, "utf8")).value);
          if (hit.success) { trail.push("cache hit"); return done(hit.data, "cache"); }
          trail.push("cache invalid");
        } catch { /* miss */ }
      }
      const save = (value: T, source: AiSource) => {
        if (!useCache) return;
        try { fs.mkdirSync(cacheDir!, { recursive: true }); fs.writeFileSync(file, JSON.stringify({ task: a.task, source, at: new Date().toISOString(), value })); }
        catch { /* a read-only disk never breaks the ladder */ }
      };
      const call = { system: a.instructions, user, jsonSchema, images: a.images };

      // 2. Gemini: one retry after ~600ms on 429/5xx/499/unparseable/invalid, none after a timeout
      if (opts.gemini) {
        for (let attempt = 1; attempt <= 2; attempt++) {
          const r = await attemptOnce(opts.gemini, call, gT, a.schema);
          if (r.ok) { trail.push(`gemini ok`); save(r.value, "gemini"); return done(r.value, "gemini"); }
          trail.push(`gemini ${r.why}`);
          if (attempt === 2 || !r.retry) break;
          await sleep(retryDelay);
        }
      } else trail.push("gemini not configured");

      // 3. Claude Haiku: one shot
      if (opts.claude) {
        const r = await attemptOnce(opts.claude, call, cT, a.schema);
        if (r.ok) { trail.push("claude ok"); save(r.value, "claude"); return done(r.value, "claude"); }
        trail.push(`claude ${r.why}`);
      } else trail.push("claude not configured");
    } catch (e) {
      trail.push(`ladder error ${errMsg(e)}`);
    }
    // 4. fallback (never cached)
    return done(a.fallback, "fallback");
  };
}

type Attempt<T> = { ok: true; value: T } | { ok: false; why: string; retry: boolean };

async function attemptOnce<T>(p: Provider, call: Omit<ProviderCall, "signal" | "timeoutMs">, timeoutMs: number, schema: z.ZodType<T>): Promise<Attempt<T>> {
  const ctl = new AbortController();
  let timer: NodeJS.Timeout | undefined;
  // Race our own timer too: some SDK calls have been seen hanging with no error.
  const timeout = new Promise<"timeout">((r) => { timer = setTimeout(() => { ctl.abort(); r("timeout"); }, timeoutMs); });
  try {
    const out = await Promise.race([p({ ...call, signal: ctl.signal, timeoutMs }), timeout]);
    if (out === "timeout") return { ok: false, why: `timeout ${timeoutMs}ms`, retry: false };
    let parsed: unknown;
    try { parsed = parseJson(out); } catch { return { ok: false, why: "unparseable", retry: true }; }
    const v = schema.safeParse(parsed);
    if (!v.success) return { ok: false, why: "schema-invalid", retry: true };
    return { ok: true, value: v.data };
  } catch (e) {
    if (ctl.signal.aborted) return { ok: false, why: `timeout ${timeoutMs}ms`, retry: false };
    const status = e instanceof ProviderError ? e.status : 0;
    const retry = status === 429 || status === 499 || status >= 500;
    return { ok: false, why: `${status || "error"} ${errMsg(e).slice(0, 160)}`, retry };
  } finally {
    clearTimeout(timer);
  }
}

function parseJson(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  return JSON.parse(t);
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
function errMsg(e: unknown) { return (e instanceof Error ? e.message : String(e)).replace(/\s+/g, " "); }
