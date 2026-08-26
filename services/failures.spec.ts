import { describe, expect, it } from 'vitest';
import {
  DEFAULT_RETRY_POLICY,
  backoffDelayMs,
  classifyFailure,
  decideRetry,
  emptyResponseError,
  errorChain,
  humanizeError,
  isRetryable,
} from './failures';

describe('classifyFailure', () => {
  it('separates terminal quota exhaustion from transient throttling', () => {
    const throttled = classifyFailure({ status: 429, error: { message: 'Rate limit exceeded for this model' } });
    const exhausted = classifyFailure({ status: 429, error: { message: 'You exceeded your current quota' } });

    expect(throttled.code).toBe('RATE_LIMIT');
    expect(isRetryable(throttled)).toBe(true);

    // Same status, opposite decision: retrying an empty balance never succeeds.
    expect(exhausted.code).toBe('QUOTA');
    expect(isRetryable(exhausted)).toBe(false);
  });

  it('recognizes the billing wording behind a Veo 404', () => {
    const failure = classifyFailure({ error: { code: 404, message: 'Requested entity was not found.' } });
    expect(failure.code).toBe('NOT_FOUND');
    expect(failure.status).toBe(404);
    expect(humanizeError(failure)).toMatch(/faturamento/);
  });

  it('reads the status off a failed long-running operation', () => {
    expect(classifyFailure({ code: 503, message: 'The model is overloaded' }).code).toBe('SERVER');
  });

  it('classifies a network failure with no status', () => {
    expect(classifyFailure(new TypeError('Failed to fetch')).code).toBe('TRANSPORT');
  });

  it('classifies an abort as cancelled rather than a failure', () => {
    expect(classifyFailure(new DOMException('aborted', 'AbortError')).code).toBe('CANCELLED');
  });

  it('treats an empty completion as retryable', () => {
    const failure = classifyFailure(emptyResponseError('texto no roteiro'));
    expect(isRetryable(failure)).toBe(true);
  });

  it('separates safety blocks from ordinary bad requests', () => {
    expect(classifyFailure({ status: 400, error: { message: 'Blocked by SAFETY filter' } }).code).toBe('SAFETY');
    expect(classifyFailure({ status: 400, error: { message: 'Invalid aspect ratio' } }).code).toBe('INVALID_ARGUMENT');
  });

  it('reads the delay Gemini asks for in RetryInfo', () => {
    const failure = classifyFailure({
      status: 429,
      error: {
        message: 'Rate limit',
        details: [{ '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: '7s' }],
      },
    });
    expect(failure.retryAfterMs).toBe(7000);
  });

  it('reads Retry-After off a fetch response', () => {
    const error = Object.assign(new Error('Download falhou'), {
      status: 503,
      headers: new Headers({ 'retry-after': '12' }),
    });
    expect(classifyFailure(error).retryAfterMs).toBe(12_000);
  });
});

describe('errorChain', () => {
  it('surfaces the cause behind a wrapper', () => {
    const cause = new Error('ECONNRESET');
    expect(errorChain(new TypeError('Failed to fetch', { cause }))).toBe('Failed to fetch: ECONNRESET');
  });

  it('does not repeat a cause that matches its wrapper verbatim', () => {
    const cause = new Error('boom');
    expect(errorChain(new Error('boom', { cause }))).toBe('boom');
  });

  it('survives a circular cause chain', () => {
    const a = new Error('a');
    const b = new Error('b', { cause: a });
    (a as { cause?: unknown }).cause = b;
    expect(() => errorChain(a)).not.toThrow();
  });
});

describe('backoffDelayMs', () => {
  it('never exceeds the ceiling, however many attempts have passed', () => {
    for (const attempt of [0, 1, 5, 10, 40]) {
      expect(backoffDelayMs(attempt, DEFAULT_RETRY_POLICY, () => 1)).toBeLessThanOrEqual(
        DEFAULT_RETRY_POLICY.maxDelayMs
      );
    }
  });

  it('grows exponentially and jitters symmetrically around the base delay', () => {
    const policy = { ...DEFAULT_RETRY_POLICY, jitterRatio: 0.2 };
    expect(backoffDelayMs(0, policy, () => 0.5)).toBe(1000);
    expect(backoffDelayMs(1, policy, () => 0.5)).toBe(2000);
    expect(backoffDelayMs(0, policy, () => 0)).toBeCloseTo(800);
    expect(backoffDelayMs(0, policy, () => 1)).toBeCloseTo(1200);
  });
});

describe('decideRetry', () => {
  const half = () => 0.5;

  it('gives up immediately on a terminal failure', () => {
    const decision = decideRetry({ status: 403, error: { message: 'API key not valid' } }, 0, DEFAULT_RETRY_POLICY, half);
    expect(decision.kind).toBe('give-up');
  });

  it('gives up once the attempt budget is spent', () => {
    const transient = { status: 503, error: { message: 'overloaded' } };
    expect(decideRetry(transient, DEFAULT_RETRY_POLICY.maxRetries - 1, DEFAULT_RETRY_POLICY, half).kind).toBe('wait');
    expect(decideRetry(transient, DEFAULT_RETRY_POLICY.maxRetries, DEFAULT_RETRY_POLICY, half).kind).toBe('give-up');
  });

  it("honours the provider's delay instead of local backoff", () => {
    const decision = decideRetry(
      {
        status: 429,
        error: {
          message: 'Rate limit',
          details: [{ '@type': 'google.rpc.RetryInfo', retryDelay: '3s' }],
        },
      },
      0,
      DEFAULT_RETRY_POLICY,
      half
    );
    expect(decision).toMatchObject({ kind: 'wait', delayMs: 3000 });
  });

  it('gives up when the provider asks for longer than the ceiling', () => {
    const decision = decideRetry(
      {
        status: 429,
        error: {
          message: 'Rate limit',
          details: [{ '@type': 'google.rpc.RetryInfo', retryDelay: '600s' }],
        },
      },
      0,
      DEFAULT_RETRY_POLICY,
      half
    );
    // Waiting ten minutes is worse for the user than reporting the limit.
    expect(decision.kind).toBe('give-up');
  });
});
