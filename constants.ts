
export const SCRIPT_GENERATION_COST = 1;
export const VIDEO_CHUNK_GENERATION_COST = 5;
export const MAX_CHUNKS = 6; // Number of scenes / acts in a campaign
export const CHUNK_DURATION = 8; // Seconds per scene
export const INITIAL_CREDITS = 100;

/**
 * Veo variants differ in price and in what they accept — verified against the
 * API, not the docs. `lite` rejects `referenceImages` outright, so it cannot
 * hold the influencer's appearance steady between scenes; the other two can.
 * All three cap `durationSeconds` at 4-8.
 *
 * Prices are USD per second of successful output at 720p, audio included.
 * Confirm against Google's own pricing page before quoting a client.
 */
const VEO_MODELS = {
  lite: {
    id: 'veo-3.1-lite-generate-preview',
    usdPerSecond: 0.05,
    supportsCharacterReference: false,
  },
  fast: {
    id: 'veo-3.1-fast-generate-preview',
    usdPerSecond: 0.15,
    supportsCharacterReference: true,
  },
  quality: {
    id: 'veo-3.1-generate-preview',
    usdPerSecond: 0.4,
    supportsCharacterReference: true,
  },
} as const;

/** The variant every render uses. */
export const VEO_MODEL = VEO_MODELS.lite;

/** Veo renders are slow; poll gently and give up rather than hang forever. */
export const VIDEO_POLL_INTERVAL_MS = 10_000;
export const VIDEO_POLL_TIMEOUT_MS = 10 * 60_000;

/**
 * Veo enforces a low per-minute quota. Firing every scene at once reliably
 * trips 429s, so scenes are rendered a few at a time.
 */
export const VIDEO_RENDER_CONCURRENCY = 2;

/** Cross-dissolve length between clips in the final cut. */
export const TRANSITION_DURATION_MS = 1000;

/** Upload ceiling per image, matching what the API accepts inline. */
export const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

/**
 * Ceiling for the reference video sent to the Omni model. It travels inline as
 * base64, which inflates the request by about a third, so this stays well under
 * the API's request size limit. Enough for a minute of vertical social video.
 */
export const MAX_REFERENCE_VIDEO_BYTES = 8 * 1024 * 1024;
