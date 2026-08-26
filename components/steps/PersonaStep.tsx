import React from 'react';
import { MediaUpload } from '../MediaUpload';
import { Badge, EmptyState, Panel, PanelHeader, Spinner } from '../ui';

export interface PersonaStepProps {
  influencerImageFile: File | null;
  influencerPreview: string | null;
  onSelectInfluencer: (file: File | null) => void;
  isAnalyzing: boolean;
  characterDescription: string | null;
  onError: (message: string) => void;
}

export const PersonaStep: React.FC<PersonaStepProps> = ({
  influencerImageFile,
  influencerPreview,
  onSelectInfluencer,
  isAnalyzing,
  characterDescription,
  onError,
}) => (
  <div className="grid items-start gap-6 lg:grid-cols-[320px_1fr]">
    <Panel className="p-5">
      <MediaUpload
        label="Foto da influencer"
        hint="Rosto visível, boa luz. É essa imagem que mantém a aparência estável entre as cenas."
        file={influencerImageFile}
        previewUrl={influencerPreview}
        onSelect={onSelectInfluencer}
        onError={onError}
        aspect="square"
        busy={isAnalyzing}
        busyLabel="Analisando"
        required
      />
    </Panel>

    <Panel>
      <PanelHeader
        title="Persona digital"
        description="O blueprint que descreve a influencer para os modelos de vídeo."
        action={
          characterDescription ? (
            <Badge tone="ok">Pronta</Badge>
          ) : isAnalyzing ? (
            <Badge tone="accent">
              <Spinner className="h-3 w-3" />
              Analisando
            </Badge>
          ) : null
        }
      />
      <div className="p-5">
        {characterDescription ? (
          <p className="max-w-prose text-base text-ink-2">{characterDescription}</p>
        ) : (
          <EmptyState
            title={isAnalyzing ? 'Lendo a imagem' : 'Nenhuma persona ainda'}
            description={
              isAnalyzing
                ? 'A IA está descrevendo aparência, vestuário, cenário e energia da influencer.'
                : 'Envie uma foto ao lado. A IA descreve aparência, vestuário, cenário e energia — e essa descrição alimenta o roteiro e cada cena de vídeo.'
            }
          />
        )}
      </div>
    </Panel>
  </div>
);
