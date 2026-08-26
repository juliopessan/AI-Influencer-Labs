
/** Base64 media payload as the Gemini API expects it (no data-URL prefix). */
export interface MediaPayload {
  data: string;
  mimeType: string;
}

/** Images are the most common payload; the shape is identical. */
export type ImagePayload = MediaPayload;

export interface ScriptChunk {
  id: string;
  scene: string;
  narration: string;
}

export type Script = ScriptChunk[];

export type VideoChunkStatus = 'pending' | 'generating' | 'done' | 'error';

export interface VideoChunk {
  id: string;
  scriptChunk: ScriptChunk;
  videoUrl: string | null;
  status: VideoChunkStatus;
  /** Veo prompt produced by the director agent, kept for transparency and retries. */
  optimizedPrompt?: string;
  /** Human-readable reason shown on the scene card when status is 'error'. */
  errorMessage?: string;
  /** Current stage of the render, surfaced while status is 'generating'. */
  progressMessage?: string;
}

/** Steps of the workspace, in order. */
export type StepId = 'persona' | 'campanha' | 'roteiro' | 'producao' | 'entrega';

/**
 * `todo` covers both "not started" and "started but incomplete" — the footer
 * carries the detail, so the marker only needs to know whether it is finished.
 */
export type StepState = 'todo' | 'done';

export type VideoStyle = 'cinematic' | 'animation' | 'documentary' | 'vlog';
export type ScriptMode = 'fast' | 'balanced' | 'complex';
export type AspectRatio = '16:9' | '9:16';

export interface SocialPost {
  platform: 'Instagram' | 'TikTok' | 'YouTube';
  caption: string;
  hashtags: string[];
  title?: string; // For YouTube/Shorts
  strategyTip: string;
}

export interface SocialContentGenerated {
  instagram: SocialPost;
  tiktok: SocialPost;
  youtube: SocialPost;
}

// Interface para salvar o projeto no LocalStorage
export interface SavedProjectState {
  version: number;
  timestamp: number;
  topic: string;
  characterDescription: string | null;
  script: Script | null;
  credits: number;
  referenceUrl: string;
  styleAnalysis: string;
  videoStyle: VideoStyle;
  scriptMode: ScriptMode;
  aspectRatio: AspectRatio;
  useCharacterReference: boolean;
  socialContent: SocialContentGenerated | null;
  // Imagens salvas como Base64 Data Strings
  influencerImageBase64: string | null;
  productImageBase64: string | null;
  logoImageBase64: string | null;
}

declare global {
  /**
   * True only in the preview build published as an Artifact, whose sandbox
   * blocks page-initiated downloads. Replaced at build time by Vite.
   */
  const __PREVIEW__: boolean;

  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }
  interface Window {
    aistudio?: AIStudio;
  }
}
