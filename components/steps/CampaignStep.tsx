import React from 'react';
import { ImageUpload } from '../ImageUpload';
import { Button, Field, Panel, PanelHeader, Spinner } from '../ui';

export interface CampaignStepProps {
  productImageFile: File | null;
  productPreview: string | null;
  onSelectProduct: (file: File | null) => void;

  logoImageFile: File | null;
  logoPreview: string | null;
  onSelectLogo: (file: File | null) => void;

  topic: string;
  setTopic: (topic: string) => void;
  onGenerateBriefing: () => void;
  isGeneratingBriefing: boolean;

  referenceUrl: string;
  setReferenceUrl: (url: string) => void;
  styleAnalysis: string;
  setStyleAnalysis: (analysis: string) => void;
  onAnalyzeStyle: () => void;
  isAnalyzingStyle: boolean;

  onExportPdf: () => void;
  isExportingPdf: boolean;

  onError: (message: string) => void;
  disabled: boolean;
}

export const CampaignStep: React.FC<CampaignStepProps> = ({
  productImageFile,
  productPreview,
  onSelectProduct,
  logoImageFile,
  logoPreview,
  onSelectLogo,
  topic,
  setTopic,
  onGenerateBriefing,
  isGeneratingBriefing,
  referenceUrl,
  setReferenceUrl,
  styleAnalysis,
  setStyleAnalysis,
  onAnalyzeStyle,
  isAnalyzingStyle,
  onExportPdf,
  isExportingPdf,
  onError,
  disabled,
}) => (
  <div className="space-y-6">
    <Panel>
      <PanelHeader title="Produto" description="O que a campanha vende, e a marca por trás dele." />
      <div className="grid max-w-3xl gap-5 p-5 sm:grid-cols-2">
        <ImageUpload
          label="Produto principal"
          hint="A IA lê esta imagem para escrever o briefing e o roteiro."
          file={productImageFile}
          previewUrl={productPreview}
          onSelect={onSelectProduct}
          onError={onError}
          disabled={disabled}
          required
        />
        <ImageUpload
          label="Logo da marca"
          hint="Opcional. Entra também na capa do PDF de briefing."
          file={logoImageFile}
          previewUrl={logoPreview}
          onSelect={onSelectLogo}
          onError={onError}
          fit="contain"
          disabled={disabled}
        />
      </div>
    </Panel>

    <Panel>
      <PanelHeader
        title="Briefing"
        description="O contexto que orienta o roteirista: produto, público e tom de voz."
        action={
          <Button size="sm" onClick={onExportPdf} disabled={!topic || isExportingPdf}>
            {isExportingPdf ? <Spinner className="h-3.5 w-3.5" /> : null}
            Exportar PDF
          </Button>
        }
      />
      <div className="max-w-3xl space-y-4 p-5">
        <Field
          label="Contexto da campanha"
          htmlFor="briefing"
          hint={
            productImageFile
              ? 'Escreva o seu ou deixe a IA propor um a partir das imagens.'
              : 'Envie a imagem do produto acima para gerar automaticamente.'
          }
          action={
            <Button
              size="sm"
              variant="ghost"
              onClick={onGenerateBriefing}
              disabled={!productImageFile || isGeneratingBriefing || disabled}
            >
              {isGeneratingBriefing ? <Spinner className="h-3.5 w-3.5" /> : null}
              {isGeneratingBriefing ? 'Gerando' : 'Gerar com IA'}
            </Button>
          }
        >
          <textarea
            id="briefing"
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            rows={5}
            disabled={disabled || isGeneratingBriefing}
            placeholder="Ex.: sérum facial para pele oleosa, público de 25 a 35 anos, tom próximo e sem promessas exageradas."
            className="field resize-y"
          />
        </Field>
      </div>
    </Panel>

    <Panel>
      <PanelHeader
        title="Referência de estilo"
        description="Opcional. Define ritmo, gancho e tratamento de áudio do vídeo."
      />
      <div className="max-w-3xl space-y-4 p-5">
        <Field
          label="Link de referência"
          htmlFor="reference-url"
          hint="A IA não abre o link — ela deduz o estilo pela plataforma e pelo perfil na URL."
        >
          <div className="flex flex-col gap-2 sm:flex-row">
            <input
              id="reference-url"
              type="url"
              inputMode="url"
              value={referenceUrl}
              onChange={(e) => {
                setReferenceUrl(e.target.value);
                setStyleAnalysis('');
              }}
              disabled={disabled}
              placeholder="https://www.tiktok.com/@perfil/video/..."
              className="field flex-1"
            />
            <Button
              onClick={onAnalyzeStyle}
              disabled={!referenceUrl.trim() || isAnalyzingStyle || disabled}
              className="sm:w-40"
            >
              {isAnalyzingStyle ? <Spinner className="h-3.5 w-3.5" /> : null}
              {isAnalyzingStyle ? 'Analisando' : styleAnalysis ? 'Reanalisar' : 'Analisar'}
            </Button>
          </div>
        </Field>

        {styleAnalysis && (
          <Field
            label="Direção de estilo"
            htmlFor="style-analysis"
            hint="Editável. O texto abaixo entra no prompt do roteirista como está."
          >
            <textarea
              id="style-analysis"
              value={styleAnalysis}
              onChange={(e) => setStyleAnalysis(e.target.value)}
              rows={6}
              disabled={disabled}
              className="field resize-y font-mono text-xs leading-relaxed"
            />
          </Field>
        )}
      </div>
    </Panel>
  </div>
);
