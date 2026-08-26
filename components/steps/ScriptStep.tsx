import React from 'react';
import { Script, ScriptMode } from '../../types';
import { CHUNK_DURATION } from '../../constants';
import { Badge, EmptyState, Panel, PanelHeader, SegmentedControl } from '../ui';

const MODE_OPTIONS: ReadonlyArray<{ value: ScriptMode; label: string; description: string }> = [
  { value: 'fast', label: 'Rápido', description: 'Flash Lite. Para testar a ideia.' },
  { value: 'balanced', label: 'Equilibrado', description: 'Flash. Padrão recomendado.' },
  { value: 'complex', label: 'Criativo', description: 'Pro com raciocínio. Mais lento.' },
];

/** Roughly what fits in the scene's spoken duration, at ~2.5 words per second. */
const NARRATION_BUDGET = Math.round(CHUNK_DURATION * 2.5);

const SceneCard: React.FC<{
  index: number;
  scene: string;
  narration: string;
  disabled: boolean;
  onChange: (field: 'scene' | 'narration', value: string) => void;
}> = ({ index, scene, narration, disabled, onChange }) => {
  const words = narration.trim() ? narration.trim().split(/\s+/).length : 0;
  const overBudget = words > NARRATION_BUDGET;

  return (
    <article className="rounded border border-line bg-surface-1">
      <header className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5">
        <h4 className="text-sm font-medium text-ink">Cena {index + 1}</h4>
        <span className="font-mono text-xs text-ink-3">{CHUNK_DURATION}s</span>
      </header>

      <div className="space-y-4 p-4">
        <div className="space-y-1.5">
          <label htmlFor={`scene-${index}`} className="text-xs font-medium text-ink-2">
            O que a câmera vê
          </label>
          <textarea
            id={`scene-${index}`}
            value={scene}
            onChange={(e) => onChange('scene', e.target.value)}
            disabled={disabled}
            rows={3}
            className="field resize-y text-sm"
          />
        </div>

        <div className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-2">
            <label htmlFor={`narration-${index}`} className="text-xs font-medium text-ink-2">
              O que ela fala
            </label>
            {/* The narration is spoken by the model, so length is a real
                constraint rather than a style preference. */}
            <span className={`font-mono text-xs ${overBudget ? 'text-warn' : 'text-ink-3'}`}>
              {words}/{NARRATION_BUDGET} palavras
            </span>
          </div>
          <textarea
            id={`narration-${index}`}
            value={narration}
            onChange={(e) => onChange('narration', e.target.value)}
            disabled={disabled}
            rows={2}
            className="field resize-y text-sm"
          />
        </div>
      </div>
    </article>
  );
};

export interface ScriptStepProps {
  script: Script | null;
  scriptMode: ScriptMode;
  setScriptMode: (mode: ScriptMode) => void;
  characterDescription: string | null;
  onScriptChange: (index: number, field: 'scene' | 'narration', value: string) => void;
  locked: boolean;
  isLoading: boolean;
}

export const ScriptStep: React.FC<ScriptStepProps> = ({
  script,
  scriptMode,
  setScriptMode,
  characterDescription,
  onScriptChange,
  locked,
  isLoading,
}) => (
  <div className="space-y-6">
    <Panel>
      <PanelHeader
        title="Modelo do roteirista"
        description="Define quanto a IA raciocina antes de escrever. Não muda o custo em créditos."
      />
      <div className="max-w-3xl p-5">
        <SegmentedControl
          label="Modelo do roteirista"
          options={MODE_OPTIONS}
          value={scriptMode}
          onChange={setScriptMode}
          disabled={locked || isLoading}
          columns={3}
        />
      </div>
    </Panel>

    {characterDescription && (
      <Panel>
        <PanelHeader title="Persona em uso" action={<Badge tone="accent">Etapa 1</Badge>} />
        <p className="max-w-prose p-5 text-sm text-ink-2">{characterDescription}</p>
      </Panel>
    )}

    <Panel>
      <PanelHeader
        title="Roteiro"
        description={
          script
            ? 'Edite livremente. A fala é sintetizada pelo modelo de vídeo exatamente como estiver escrita.'
            : 'Seis cenas em arco contínuo: gancho, problema, experiência, clímax, lifestyle e chamada para ação.'
        }
        action={script ? <Badge tone="ok">{script.length} cenas</Badge> : null}
      />
      <div className="p-5">
        {script ? (
          <div className="space-y-4">
            {script.map((chunk, index) => (
              <SceneCard
                key={chunk.id}
                index={index}
                scene={chunk.scene}
                narration={chunk.narration}
                disabled={locked}
                onChange={(field, value) => onScriptChange(index, field, value)}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            title={isLoading ? 'Escrevendo o roteiro' : 'Roteiro ainda não gerado'}
            description={
              isLoading
                ? 'A IA está construindo as seis cenas a partir da persona e do briefing.'
                : 'Use o botão abaixo para gerar. Depois você pode reescrever qualquer cena antes de renderizar.'
            }
          />
        )}
      </div>
    </Panel>
  </div>
);
