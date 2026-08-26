/**
 * Failure taxonomy and retry policy for the Gemini/Veo calls.
 *
 * Adapted from the retry design in DeepSeek Harness (MIT, deepseek-ai) —
 * specifically `@deepseek-ai/dsh-llm`'s rule that every failure carries a stable
 * machine-routable `code` and that callers route on that code instead of
 * parsing messages, plus its bounded-backoff-with-symmetric-jitter policy and
 * its separation of terminal quota exhaustion from transient rate limiting.
 * Rewritten for the browser and for a single provider.
 *
 * @module services/failures
 */

import { ApiError } from "@google/genai";

/** Stable, provider-neutral failure classes. Route on these, never on `message`. */
export type FailureCode =
  /** Throttled by request rate — safe to retry after a delay. */
  | "RATE_LIMIT"
  /** Account balance, credits or usage cap exhausted — retrying cannot help. */
  | "QUOTA"
  /** Provider-side error (5xx). */
  | "SERVER"
  /** The call did not settle within its deadline. */
  | "TIMEOUT"
  /** Network-level failure: DNS, TLS, connection reset, offline. */
  | "TRANSPORT"
  /** The call succeeded but produced no usable content — safe to repeat. */
  | "EMPTY_RESPONSE"
  /** Key missing, malformed, or without access to the model. */
  | "AUTH"
  /** Model or operation not found; on Veo this usually means billing is off. */
  | "NOT_FOUND"
  /** Blocked by the safety filters. */
  | "SAFETY"
  /** The request itself is malformed or unsupported. */
  | "INVALID_ARGUMENT"
  /** The caller aborted. */
  | "CANCELLED"
  | "UNKNOWN";

/**
 * A classified failure. A plain frozen object rather than an Error subclass:
 * an exported class extending Error in this dependency graph defeats Rollup's
 * tree-shaking of the Gemini SDK, which costs ~235 kB in the bundle.
 */
export interface Failure {
  readonly code: FailureCode;
  readonly message: string;
  readonly status?: number;
  /** Delay the provider explicitly asked for, in milliseconds. */
  readonly retryAfterMs?: number;
}

const ALL_CODES: ReadonlySet<string> = new Set<FailureCode>([
  "RATE_LIMIT",
  "QUOTA",
  "SERVER",
  "TIMEOUT",
  "TRANSPORT",
  "EMPTY_RESPONSE",
  "AUTH",
  "NOT_FOUND",
  "SAFETY",
  "INVALID_ARGUMENT",
  "CANCELLED",
  "UNKNOWN",
]);

/** Failures worth repeating. QUOTA is deliberately absent: it fails identically every time. */
const RETRYABLE: ReadonlySet<FailureCode> = new Set<FailureCode>([
  "EMPTY_RESPONSE",
  "RATE_LIMIT",
  "SERVER",
  "TIMEOUT",
  "TRANSPORT",
]);

export function isRetryable(failure: Failure): boolean {
  return RETRYABLE.has(failure.code);
}

// --- Message rendering ------------------------------------------------------

/**
 * Render a thrown value with its whole `cause` chain, so a wrapper like
 * `TypeError: Failed to fetch` surfaces what actually went wrong underneath
 * instead of masking it. Diagnostics only — never route on the result.
 */
export function errorChain(value: unknown): string {
  const seen = new Set<unknown>();

  const render = (current: unknown): string => {
    if (seen.has(current)) return "<referência circular>";
    seen.add(current);
    try {
      if (!(current instanceof Error)) {
        if (typeof current === "object" && current !== null && "message" in current) {
          const { message } = current as { message?: unknown };
          if (typeof message === "string") return message;
        }
        return typeof current === "string" ? current : JSON.stringify(current) ?? String(current);
      }
      const message = current.message === "" ? current.name : current.message;
      const causeText = current.cause == null ? "" : render(current.cause);
      // Wrappers built as `new Error(String(cause), { cause })` repeat their
      // cause verbatim; printing it twice only adds noise.
      return causeText === "" || causeText === message ? message : `${message}: ${causeText}`;
    } catch {
      // Hostile getters must not escape: this text feeds the error banner.
      return "<valor ilegível>";
    } finally {
      seen.delete(current);
    }
  };

  return render(value);
}

// --- Classification ---------------------------------------------------------

/** Terminal exhaustion wording, as opposed to transient throttling. */
function isQuotaExhausted(detail: string): boolean {
  return (
    /\binsufficient[\s_-]+(?:quota|balance|credits?)\b/i.test(detail) ||
    /\b(?:quota|usage[\s_-]+limit)[\s_-]+(?:exceeded|exhausted|reached)\b/i.test(detail) ||
    /\bexceed(?:ed|s)?[\s_-]+(?:(?:your|the)[\s_-]+)?(?:current[\s_-]+)?quota\b/i.test(detail) ||
    /\b(?:balance|credits?)[\s_-]+(?:exhausted|depleted)\b/i.test(detail) ||
    /\bout[\s_-]+of[\s_-]+(?:credits?|budget)\b/i.test(detail) ||
    /\bbilling[\s_-]+(?:account|not[\s_-]+enabled)\b/i.test(detail)
  );
}

/** Parses a protobuf Duration such as `"7s"` or `"1.5s"`. */
function parseDurationMs(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) return value * 1000;
  if (typeof value !== "string") return undefined;
  const match = /^(\d+(?:\.\d+)?)s$/.exec(value.trim());
  if (!match) return undefined;
  const seconds = Number(match[1]);
  return Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : undefined;
}

/**
 * Reads the delay the provider asked for. Gemini returns it as a `RetryInfo`
 * entry in `error.details`; a raw fetch carries it in the `Retry-After` header.
 */
function extractRetryAfterMs(error: unknown): number | undefined {
  const anyErr = error as any;

  const direct = parseDurationMs(anyErr?.retryAfterMs ?? anyErr?.retryDelay);
  if (direct !== undefined) return direct;

  const details = anyErr?.error?.details ?? anyErr?.details;
  if (Array.isArray(details)) {
    for (const detail of details) {
      if (typeof detail?.["@type"] === "string" && detail["@type"].includes("RetryInfo")) {
        const parsed = parseDurationMs(detail.retryDelay);
        if (parsed !== undefined) return parsed;
      }
    }
  }

  const header = anyErr?.headers?.get?.("retry-after");
  if (typeof header === "string") {
    const seconds = Number(header);
    if (Number.isFinite(seconds) && seconds > 0) return seconds * 1000;
  }

  return undefined;
}

/**
 * Extracts an HTTP status from the shapes involved: `ApiError` from the SDK,
 * the REST envelope `{ error: { code } }`, and the flat `{ code, message }`
 * carried on a failed long-running operation.
 */
function extractStatus(error: unknown): number | undefined {
  if (error instanceof ApiError && typeof error.status === "number") return error.status;
  const anyErr = error as any;
  if (typeof anyErr?.status === "number") return anyErr.status;
  if (typeof anyErr?.error?.code === "number") return anyErr.error.code;
  if (typeof anyErr?.code === "number") return anyErr.code;
  return undefined;
}

function codeFromStatus(status: number, detail: string): FailureCode {
  if (status === 429) return isQuotaExhausted(detail) ? "QUOTA" : "RATE_LIMIT";
  if (status === 400) return /SAFETY|blocked|PROHIBITED/i.test(detail) ? "SAFETY" : "INVALID_ARGUMENT";
  if (status === 401 || status === 403) return "AUTH";
  if (status === 404) return "NOT_FOUND";
  if (status === 408 || status === 504) return "TIMEOUT";
  if (status >= 500) return "SERVER";
  return "UNKNOWN";
}

function codeFromMessage(detail: string): FailureCode {
  if (isQuotaExhausted(detail)) return "QUOTA";
  if (/RESOURCE_EXHAUSTED|rate limit/i.test(detail)) return "RATE_LIMIT";
  if (/overloaded|UNAVAILABLE|\b(?:500|502|503)\b/i.test(detail)) return "SERVER";
  if (/\btimed? ?out\b|deadline exceeded/i.test(detail)) return "TIMEOUT";
  if (/Failed to fetch|NetworkError|ERR_NETWORK|ECONNRESET|socket hang up/i.test(detail)) return "TRANSPORT";
  if (/Requested entity was not found|\b404\b/i.test(detail)) return "NOT_FOUND";
  if (/API key not valid|PERMISSION_DENIED|Nenhuma chave de API/i.test(detail)) return "AUTH";
  if (/SAFETY|blocked by/i.test(detail)) return "SAFETY";
  return "UNKNOWN";
}

function pickCode(status: number | undefined, message: string): FailureCode {
  if (status === undefined) return codeFromMessage(message);
  const fromStatus = codeFromStatus(status, message);
  return fromStatus === "UNKNOWN" ? codeFromMessage(message) : fromStatus;
}

/** Turns any thrown value into a routable {@link Failure}. */
export function classifyFailure(error: unknown): Failure {
  if (error instanceof DOMException && error.name === "AbortError") {
    return Object.freeze({ code: "CANCELLED" as const, message: "Operação cancelada." });
  }

  const message = errorChain(error);
  const status = extractStatus(error);
  const retryAfterMs = extractRetryAfterMs(error);

  // A code we attached ourselves is authoritative — no need to re-derive it
  // from text we wrote. Anything else (a Node errno, a provider enum) is
  // ignored here and left to the status and message heuristics below.
  const own = (error as { code?: unknown })?.code;
  const code =
    typeof own === "string" && ALL_CODES.has(own)
      ? (own as FailureCode)
      : // A status alone cannot separate throttling from exhaustion, so both
        // signals feed the decision: 429 + "insufficient balance" is terminal.
        pickCode(status, message);

  return Object.freeze({
    code,
    message,
    ...(status === undefined ? {} : { status }),
    ...(retryAfterMs === undefined ? {} : { retryAfterMs }),
  });
}

/**
 * Signals a completion that finished normally but carried nothing usable.
 * Tagged with an explicit `code` so the classifier routes on that rather than
 * on the wording of the message.
 */
export function emptyResponseError(what: string): Error {
  return Object.assign(new Error(`A API não retornou ${what}.`), {
    code: "EMPTY_RESPONSE" satisfies FailureCode,
  });
}

// --- User-facing messages ---------------------------------------------------

const MESSAGES: Record<FailureCode, string | null> = {
  QUOTA:
    "Cota ou saldo esgotado no seu projeto Google Cloud. Tentar de novo não resolve — revise o faturamento no AI Studio.",
  RATE_LIMIT:
    "Limite de requisições por minuto atingido. Aguarde alguns instantes e tente novamente.",
  SERVER: "O modelo está sobrecarregado no momento. Tente novamente em alguns instantes.",
  TIMEOUT: "A chamada demorou demais para responder. Tente novamente.",
  TRANSPORT: "Falha de conexão com a API. Verifique sua internet e tente novamente.",
  EMPTY_RESPONSE: "O modelo respondeu sem conteúdo. Tente novamente.",
  AUTH: "Chave de API inválida ou sem permissão para este modelo.",
  NOT_FOUND:
    "Modelo não encontrado. O Veo exige um projeto do Google Cloud com faturamento habilitado (Paid Tier).",
  SAFETY:
    "O conteúdo foi bloqueado pelos filtros de segurança. Ajuste o roteiro ou as imagens e tente de novo.",
  INVALID_ARGUMENT: null,
  CANCELLED: "Operação cancelada.",
  UNKNOWN: null,
};

/** Turns any failure into a message a non-technical user can act on. */
export function humanizeError(error: unknown): string {
  const failure = classifyFailure(error);
  return MESSAGES[failure.code] ?? failure.message ?? "Ocorreu um erro desconhecido ao falar com a API.";
}

// --- Backoff ----------------------------------------------------------------

export interface RetryPolicy {
  /** Attempts after the first one. */
  readonly maxRetries: number;
  readonly initialDelayMs: number;
  /** Ceiling for both local backoff and an accepted provider delay. */
  readonly maxDelayMs: number;
  /** Symmetric multiplier range around 1 (0.1 = ±10%). */
  readonly jitterRatio: number;
}

export const DEFAULT_RETRY_POLICY: RetryPolicy = Object.freeze({
  maxRetries: 5,
  initialDelayMs: 1_000,
  maxDelayMs: 30_000,
  jitterRatio: 0.2,
});

/** Bounded exponential backoff with symmetric jitter, capped at `maxDelayMs`. */
export function backoffDelayMs(
  attempt: number,
  policy: RetryPolicy = DEFAULT_RETRY_POLICY,
  random: () => number = Math.random
): number {
  const exponential = Math.min(policy.initialDelayMs * 2 ** Math.min(attempt, 30), policy.maxDelayMs);
  const jitter = 1 - policy.jitterRatio + 2 * policy.jitterRatio * random();
  return Math.min(exponential * jitter, policy.maxDelayMs);
}

/** What to do about one failed attempt. */
export type RetryDecision =
  | { readonly kind: "give-up"; readonly failure: Failure }
  | { readonly kind: "wait"; readonly failure: Failure; readonly delayMs: number };

/**
 * Decides whether an attempt is worth repeating and how long to wait.
 *
 * A provider-supplied delay replaces local backoff when it fits under the cap.
 * When the provider asks for longer than the cap, that is a signal the wait is
 * not worth making the user sit through — give up and report it, rather than
 * sleeping past the cap or ignoring the instruction and hammering the API.
 */
export function decideRetry(
  error: unknown,
  attempt: number,
  policy: RetryPolicy = DEFAULT_RETRY_POLICY,
  random: () => number = Math.random
): RetryDecision {
  const failure = classifyFailure(error);

  if (!isRetryable(failure) || attempt >= policy.maxRetries) {
    return { kind: "give-up", failure };
  }

  if (failure.retryAfterMs !== undefined) {
    return failure.retryAfterMs <= policy.maxDelayMs
      ? { kind: "wait", failure, delayMs: failure.retryAfterMs }
      : { kind: "give-up", failure };
  }

  return { kind: "wait", failure, delayMs: backoffDelayMs(attempt, policy, random) };
}

/** A delay that resolves early when the caller aborts. */
export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    function onAbort(): void {
      clearTimeout(timer);
      resolve();
    }
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}
