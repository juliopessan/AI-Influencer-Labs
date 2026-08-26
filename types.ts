
export interface ScriptChunk {
  id: string;
  scene: string;
  narration: string;
}

export type Script = ScriptChunk[];

export interface GeneratedScriptResponse {
  characterDescription: string;
  script: Script;
}

export type VideoChunkStatus = 'pending' | 'generating' | 'done' | 'error';

export interface VideoChunk {
  id: string;
  scriptChunk: ScriptChunk;
  videoUrl: string | null;
  status: VideoChunkStatus;
}

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
  timestamp: number;
  topic: string;
  characterDescription: string | null;
  script: Script | null;
  credits: number;
  referenceUrl: string;
  videoStyle: VideoStyle;
  scriptMode: ScriptMode;
  aspectRatio: AspectRatio;
  socialContent: SocialContentGenerated | null;
  // Imagens salvas como Base64 Data Strings
  influencerImageBase64: string | null;
  productImageBase64: string | null;
  logoImageBase64: string | null;
}

declare global {
  interface AIStudio {
    hasSelectedApiKey: () => Promise<boolean>;
    openSelectKey: () => Promise<void>;
  }
  interface Window {
    aistudio?: AIStudio;
  }
}
