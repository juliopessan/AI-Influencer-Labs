import React, { useState } from 'react';
import { AspectRatio, SocialContentGenerated, SocialPost } from '../../types';
import { Badge, Button, EmptyState, Panel, PanelHeader, SegmentedControl } from '../ui';

type Platform = 'instagram' | 'tiktok' | 'youtube';

const PLATFORMS: ReadonlyArray<{ value: Platform; label: string }> = [
  { value: 'instagram', label: 'Instagram' },
  { value: 'tiktok', label: 'TikTok' },
  { value: 'youtube', label: 'YouTube' },
];

const CopyButton: React.FC<{ text: string; label: string }> = ({ text, label }) => {
  const [copied, setCopied] = useState(false);

  return (
    <Button
      size="sm"
      variant="ghost"
      onClick={() => {
        void navigator.clipboard
          .writeText(text)
          .then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
          })
          .catch(() => setCopied(false));
      }}
      aria-label={`Copiar ${label}`}
    >
      {copied ? 'Copiado' : 'Copiar'}
    </Button>
  );
};

const PostView: React.FC<{ post: SocialPost }> = ({ post }) => (
  <div className="space-y-5">
    {post.title && (
      <div>
        <div className="mb-1.5 flex items-baseline justify-between gap-3">
          <h4 className="text-xs font-medium text-ink-2">Título</h4>
          <CopyButton text={post.title} label="título" />
        </div>
        <p className="text-base font-medium text-ink">{post.title}</p>
      </div>
    )}

    <div>
      <div className="mb-1.5 flex items-baseline justify-between gap-3">
        <h4 className="text-xs font-medium text-ink-2">Legenda</h4>
        <CopyButton text={post.caption} label="legenda" />
      </div>
      <p className="whitespace-pre-wrap text-base text-ink-2">{post.caption}</p>
    </div>

    {post.hashtags.length > 0 && (
      <div>
        <div className="mb-1.5 flex items-baseline justify-between gap-3">
          <h4 className="text-xs font-medium text-ink-2">Hashtags</h4>
          <CopyButton text={post.hashtags.map((t) => `#${t}`).join(' ')} label="hashtags" />
        </div>
        <div className="flex flex-wrap gap-1.5">
          {post.hashtags.map((tag) => (
            <span key={tag} className="rounded bg-surface-2 px-2 py-1 text-xs text-ink-2">
              #{tag}
            </span>
          ))}
        </div>
      </div>
    )}

    <div className="rounded border border-line bg-surface-2 p-4">
      <h4 className="text-xs font-medium text-accent-ink">Dica de estratégia</h4>
      <p className="mt-1 text-sm text-ink-2">{post.strategyTip}</p>
    </div>
  </div>
);

export interface DeliveryStepProps {
  mergedVideoUrl: string | null;
  mergedVideoExtension: string;
  aspectRatio: AspectRatio;
  socialContent: SocialContentGenerated | null;
  isMerging: boolean;
  mergeStage: string;
  onRemerge: () => void;
  canRemerge: boolean;
}

export const DeliveryStep: React.FC<DeliveryStepProps> = ({
  mergedVideoUrl,
  mergedVideoExtension,
  aspectRatio,
  socialContent,
  isMerging,
  mergeStage,
  onRemerge,
  canRemerge,
}) => {
  const [platform, setPlatform] = useState<Platform>('instagram');
  // A vertical clip at the horizontal player's width would run ~900px tall and
  // push the download button off screen, so each ratio gets its own cap.
  const frame =
    aspectRatio === '16:9' ? 'aspect-video max-w-2xl' : 'aspect-[9/16] max-w-[300px]';

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
      <Panel>
        <PanelHeader
          title="Vídeo final"
          description="As cenas unidas com transição cruzada e áudio normalizado."
          action={mergedVideoUrl ? <Badge tone="ok">Pronto</Badge> : null}
        />
        <div className="p-5">
          {mergedVideoUrl ? (
            <div className="space-y-5">
              <div className={`mx-auto w-full overflow-hidden rounded border border-line bg-black ${frame}`}>
                {/* No autoplay: the user decides when a video with sound starts. */}
                <video controls src={mergedVideoUrl} className="h-full w-full" />
              </div>
              <div className="flex flex-wrap justify-center gap-2">
                <Button
                  variant="primary"
                  size="lg"
                  // A sandboxed preview blocks downloads a page starts itself,
                  // so there the button would silently do nothing.
                  disabled={__PREVIEW__}
                  title={__PREVIEW__ ? 'Indisponível nesta prévia' : undefined}
                  onClick={() => {
                    const link = document.createElement('a');
                    link.href = mergedVideoUrl;
                    link.download = `campanha_ugc.${mergedVideoExtension}`;
                    link.click();
                  }}
                >
                  Baixar vídeo .{mergedVideoExtension}
                </Button>
                <Button size="lg" onClick={onRemerge} disabled={!canRemerge || isMerging}>
                  Montar de novo
                </Button>
              </div>
              {__PREVIEW__ && (
                <p className="text-center text-xs text-ink-3">
                  O download só funciona no app rodando localmente — o visualizador desta prévia bloqueia
                  downloads iniciados pela página. O vídeo acima é real e foi montado aqui no navegador.
                </p>
              )}
            </div>
          ) : (
            <EmptyState
              title={isMerging ? mergeStage || 'Montando o corte final' : 'Nenhum vídeo montado'}
              description={
                isMerging
                  ? 'A montagem acontece em tempo real no navegador, então leva aproximadamente a duração do vídeo.'
                  : 'Renderize todas as cenas na etapa anterior. A montagem começa sozinha quando a última ficar pronta.'
              }
              action={
                canRemerge && !isMerging ? (
                  <Button variant="primary" onClick={onRemerge}>
                    Montar agora
                  </Button>
                ) : null
              }
            />
          )}
        </div>
      </Panel>

      <Panel className="h-fit">
        <PanelHeader title="Publicação" description="Legendas geradas a partir do roteiro." />
        <div className="space-y-5 p-5">
          {socialContent ? (
            <>
              <SegmentedControl
                label="Plataforma"
                options={PLATFORMS}
                value={platform}
                onChange={setPlatform}
              />
              <PostView post={socialContent[platform]} />
            </>
          ) : (
            <EmptyState
              title="Conteúdo social indisponível"
              description="É gerado em segundo plano junto com o roteiro. Se falhou, gere o roteiro novamente."
            />
          )}
        </div>
      </Panel>
    </div>
  );
};
