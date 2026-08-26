import React from 'react';
import { AspectRatio, VideoChunk, VideoStyle } from '../../types';
import { VIDEO_CHUNK_GENERATION_COST } from '../../constants';
import { Badge, Button, Panel, PanelHeader, SegmentedControl, Spinner, StatusTone, Toggle } from '../ui';

const STYLE_OPTIONS: ReadonlyArray<{ value: VideoStyle; label: string; description: string }> = [
  { value: 'cinematic', label: 'Cinematográfico', description: 'Foto-real, cor tratada' },
  { value: 'vlog', label: 'Vlog UGC', description: 'Selfie, câmera na mão' },
  { value: 'documentary', label: 'Documental', description: 'Luz natural, textura real' },
  { value: 'animation', label: 'Animação 3D', description: 'Render estilizado' },
];

const RATIO_OPTIONS: ReadonlyArray<{ value: AspectRatio; label: string; description: string }> = [
  { value: '9:16', label: 'Vertical', description: 'Reels, TikTok, Shorts' },
  { value: '16:9', label: 'Horizontal', description: 'YouTube, site, TV' },
];

const STATUS_LABEL: Record<VideoChunk['status'], { label: string; tone: StatusTone }> = {
  pending: { label: 'Na fila', tone: 'neutral' },
  generating: { label: 'Renderizando', tone: 'accent' },
  done: { label: 'Pronta', tone: 'ok' },
  error: { label: 'Falhou', tone: 'danger' },
};

/**
 * One scene. Text and video sit in the same card so the narration is readable
 * next to the clip it produced — previously they lived in separate columns
 * with independent scroll.
 */
const SceneRow: React.FC<{
  chunk: VideoChunk;
  index: number;
  aspectRatio: AspectRatio;
}> = ({ chunk, index, aspectRatio }) => {
  const status = STATUS_LABEL[chunk.status];
  const vertical = aspectRatio === '9:16';
  // Width follows the ratio so both formats land near the same height: a
  // 200px-wide 9:16 frame would be 355px tall next to three lines of text.
  const column = vertical ? 'sm:grid-cols-[124px_1fr]' : 'sm:grid-cols-[224px_1fr]';
  const frame = vertical ? 'aspect-[9/16]' : 'aspect-video';

  return (
    <article className={`grid items-start gap-4 rounded border border-line bg-surface-1 p-4 ${column}`}>
      <div
        className={`relative mx-auto w-full max-w-[220px] overflow-hidden rounded border border-line bg-surface-2 sm:mx-0 sm:max-w-none ${frame}`}
      >
        {chunk.status === 'done' && chunk.videoUrl ? (
          <video controls src={chunk.videoUrl} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full flex-col items-center justify-center gap-2 px-3 text-center">
            {chunk.status === 'generating' ? (
              <>
                <Spinner className="h-5 w-5 text-accent-ink" />
                <span className="text-xs text-ink-2">{chunk.progressMessage ?? 'Renderizando'}</span>
              </>
            ) : chunk.status === 'error' ? (
              <span className="text-xs font-medium text-danger">Falhou</span>
            ) : (
              <span className="text-xs text-ink-3">Aguardando</span>
            )}
          </div>
        )}
      </div>

      <div className="min-w-0 space-y-2">
        <div className="flex items-center justify-between gap-3">
          <h4 className="text-sm font-medium text-ink">Cena {index + 1}</h4>
          <Badge tone={status.tone}>{status.label}</Badge>
        </div>

        <p className="text-sm text-ink-2">{chunk.scriptChunk.scene}</p>
        <p className="border-l-2 border-line-strong pl-3 text-sm italic text-ink-2">
          “{chunk.scriptChunk.narration}”
        </p>

        {chunk.status === 'error' && chunk.errorMessage && (
          <p className="rounded border border-danger/30 bg-danger/10 px-3 py-2 text-xs text-danger">
            {chunk.errorMessage}
          </p>
        )}
      </div>
    </article>
  );
};

export interface ProductionStepProps {
  videos: VideoChunk[];
  videoStyle: VideoStyle;
  setVideoStyle: (style: VideoStyle) => void;
  aspectRatio: AspectRatio;
  setAspectRatio: (ratio: AspectRatio) => void;
  useCharacterReference: boolean;
  setUseCharacterReference: (enabled: boolean) => void;
  hasInfluencerImage: boolean;
  isGenerating: boolean;
  isMerging: boolean;
  mergeStage: string;
  onRetryFailed: () => void;
}

export const ProductionStep: React.FC<ProductionStepProps> = ({
  videos,
  videoStyle,
  setVideoStyle,
  aspectRatio,
  setAspectRatio,
  useCharacterReference,
  setUseCharacterReference,
  hasInfluencerImage,
  isGenerating,
  isMerging,
  mergeStage,
  onRetryFailed,
}) => {
  const failed = videos.filter((v) => v.status === 'error');
  const done = videos.filter((v) => v.status === 'done').length;
  const settingsLocked = isGenerating || isMerging;

  return (
    <div className="space-y-6">
      <Panel>
        <PanelHeader
          title="Ajustes de render"
          description="Valem para todas as cenas. Só podem mudar antes de renderizar."
        />
        <div className="max-w-3xl space-y-6 p-5">
          <fieldset className="space-y-3" disabled={settingsLocked}>
            <legend className="text-sm font-medium text-ink">Estilo visual</legend>
            <SegmentedControl
              label="Estilo visual"
              options={STYLE_OPTIONS}
              value={videoStyle}
              onChange={setVideoStyle}
              disabled={settingsLocked}
              columns={2}
            />
          </fieldset>

          <fieldset className="space-y-3" disabled={settingsLocked}>
            <legend className="text-sm font-medium text-ink">Formato</legend>
            <SegmentedControl
              label="Formato"
              options={RATIO_OPTIONS}
              value={aspectRatio}
              onChange={setAspectRatio}
              disabled={settingsLocked}
              columns={2}
            />
          </fieldset>

          <div className="border-t border-line pt-5">
            <Toggle
              label="Consistência de personagem"
              description={
                hasInfluencerImage
                  ? 'Envia a foto da influencer como referência em cada cena, reduzindo variação de rosto e roupa. Se o modelo recusar, a cena segue só com texto.'
                  : 'Indisponível: nenhuma foto de influencer carregada.'
              }
              checked={useCharacterReference && hasInfluencerImage}
              onChange={setUseCharacterReference}
              disabled={settingsLocked || !hasInfluencerImage}
            />
          </div>
        </div>
      </Panel>

      <Panel>
        <PanelHeader
          title="Cenas"
          description={`Cada cena custa ${VIDEO_CHUNK_GENERATION_COST} créditos e é renderizada separadamente.`}
          action={
            <div className="flex items-center gap-2">
              <Badge tone={done === videos.length && videos.length > 0 ? 'ok' : 'neutral'}>
                {done}/{videos.length} prontas
              </Badge>
              {failed.length > 0 && !isGenerating && (
                <Button size="sm" onClick={onRetryFailed}>
                  Refazer {failed.length} {failed.length === 1 ? 'cena' : 'cenas'}
                </Button>
              )}
            </div>
          }
        />

        {isMerging && (
          <div className="flex items-center gap-3 border-b border-line bg-accent/10 px-5 py-3 text-sm text-accent-ink">
            <Spinner className="h-4 w-4" />
            {mergeStage || 'Montando o corte final'}
          </div>
        )}

        <div className="space-y-4 p-5">
          {videos.map((chunk, index) => (
            <SceneRow key={chunk.id} chunk={chunk} index={index} aspectRatio={aspectRatio} />
          ))}
        </div>
      </Panel>
    </div>
  );
};
