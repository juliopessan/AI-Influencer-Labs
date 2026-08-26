import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AspectRatio,
  ImagePayload,
  SavedProjectState,
  Script,
  ScriptChunk,
  ScriptMode,
  SocialContentGenerated,
  StepId,
  VideoChunk,
  VideoStyle,
} from './types';
import {
  INITIAL_CREDITS,
  SCRIPT_GENERATION_COST,
  TRANSITION_DURATION_MS,
  VIDEO_CHUNK_GENERATION_COST,
  VIDEO_RENDER_CONCURRENCY,
} from './constants';
import {
  analyzeReferenceStyle,
  analyzeReferenceVideo,
  generateCampaignBriefing,
  generateInfluencerPersona,
  generateScript,
  generateSocialContent,
  generateVideoForChunk,
  hasApiKey,
  humanizeError,
  optimizeVeoPrompt,
} from './services/geminiService';
import { mergeVideoClips } from './services/videoMerger';
import { exportBriefingPdf } from './services/briefingPdf';
import { dataUrlToFile, fileToDataUrl, fileToMediaPayload, mapWithConcurrency } from './utils/files';
import Header from './components/Header';
import { StepDescriptor, StepFooter, Stepper } from './components/Stepper';
import { PersonaStep } from './components/steps/PersonaStep';
import { CampaignStep } from './components/steps/CampaignStep';
import { ScriptStep } from './components/steps/ScriptStep';
import { ProductionStep } from './components/steps/ProductionStep';
import { DeliveryStep } from './components/steps/DeliveryStep';
import { Button, Notice, Spinner } from './components/ui';

const LOCAL_STORAGE_KEY = 'influencer_labs_project';
const PROJECT_FORMAT_VERSION = 2;

const STEP_ORDER: ReadonlyArray<{ id: StepId; label: string; title: string; lead: string }> = [
  {
    id: 'persona',
    label: 'Persona',
    title: 'Quem é a influencer',
    lead: 'Uma foto define a aparência que todas as cenas vão manter.',
  },
  {
    id: 'campanha',
    label: 'Campanha',
    title: 'O que ela vai divulgar',
    lead: 'Produto, marca e o contexto que orienta o roteiro.',
  },
  {
    id: 'roteiro',
    label: 'Roteiro',
    title: 'O que ela vai dizer',
    lead: 'Seis cenas de oito segundos, em arco contínuo.',
  },
  {
    id: 'producao',
    label: 'Produção',
    title: 'Como o vídeo é gerado',
    lead: 'Estilo, formato e a renderização cena a cena.',
  },
  {
    id: 'entrega',
    label: 'Entrega',
    title: 'O que sai daqui',
    lead: 'Vídeo final montado e legendas prontas para publicar.',
  },
];

type ToastState = { message: string; tone: 'ok' | 'danger' | 'neutral' };

const Toast: React.FC<{ toast: ToastState; onClose: () => void }> = ({ toast, onClose }) => {
  useEffect(() => {
    const timer = setTimeout(onClose, 4000);
    return () => clearTimeout(timer);
  }, [toast, onClose]);

  const tone =
    toast.tone === 'ok'
      ? 'border-ok/40 bg-ok/15 text-ok'
      : toast.tone === 'danger'
        ? 'border-danger/40 bg-danger/15 text-danger'
        : 'border-line-strong bg-surface-3 text-ink';

  return (
    <div
      role="status"
      className={`fixed left-1/2 top-20 z-50 -translate-x-1/2 animate-rise-in rounded border px-4 py-2.5 text-sm shadow-lg ${tone}`}
    >
      {toast.message}
    </div>
  );
};

type PreviewKind = 'influencer' | 'product' | 'logo';

function App() {
  const [credits, setCredits] = useState(INITIAL_CREDITS);
  const [currentStep, setCurrentStep] = useState<StepId>('persona');

  const [influencerImageFile, setInfluencerImageFile] = useState<File | null>(null);
  const [characterDescription, setCharacterDescription] = useState<string | null>(null);
  const [isAnalyzingInfluencer, setIsAnalyzingInfluencer] = useState(false);

  const [topic, setTopic] = useState('');
  const [productImageFile, setProductImageFile] = useState<File | null>(null);
  const [logoImageFile, setLogoImageFile] = useState<File | null>(null);
  const [isGeneratingBriefing, setIsGeneratingBriefing] = useState(false);
  const [referenceUrl, setReferenceUrl] = useState('');
  const [referenceVideoFile, setReferenceVideoFile] = useState<File | null>(null);
  const [referenceVideoPreview, setReferenceVideoPreview] = useState<string | null>(null);
  const [styleAnalysis, setStyleAnalysis] = useState('');
  const [isAnalyzingStyle, setIsAnalyzingStyle] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);

  // Previews live here rather than in the form: several steps show the same
  // images, and a loaded project restores them without an upload event.
  const [previews, setPreviews] = useState<Record<PreviewKind, string | null>>({
    influencer: null,
    product: null,
    logo: null,
  });

  const [script, setScript] = useState<Script | null>(null);
  const [videos, setVideos] = useState<VideoChunk[]>([]);
  const [isLoadingScript, setIsLoadingScript] = useState(false);
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
  const [isMerging, setIsMerging] = useState(false);
  const [mergeStage, setMergeStage] = useState('');
  const [mergedVideoUrl, setMergedVideoUrl] = useState<string | null>(null);
  const [mergedVideoExtension, setMergedVideoExtension] = useState('webm');

  const [error, setError] = useState<string | null>(null);
  const [videoStyle, setVideoStyle] = useState<VideoStyle>('cinematic');
  const [scriptMode, setScriptMode] = useState<ScriptMode>('balanced');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('9:16');
  const [useCharacterReference, setUseCharacterReference] = useState(true);
  const [confirmingRender, setConfirmingRender] = useState(false);

  const [apiKeySelected, setApiKeySelected] = useState(false);
  const [checkingApiKey, setCheckingApiKey] = useState(true);
  const [socialContent, setSocialContent] = useState<SocialContentGenerated | null>(null);
  const [toast, setToast] = useState<ToastState | null>(null);
  const [canLoadProject, setCanLoadProject] = useState(() => {
    try {
      return localStorage.getItem(LOCAL_STORAGE_KEY) !== null;
    } catch (e) {
      console.warn('localStorage indisponível:', e);
      return false;
    }
  });

  const dismissToast = useCallback(() => setToast(null), []);

  // --- Blob URL lifecycle ---------------------------------------------------

  const objectUrlsRef = useRef<Set<string>>(new Set());

  const trackObjectUrl = useCallback((url: string) => {
    objectUrlsRef.current.add(url);
    return url;
  }, []);

  const releaseAllObjectUrls = useCallback(() => {
    for (const url of objectUrlsRef.current) URL.revokeObjectURL(url);
    objectUrlsRef.current.clear();
  }, []);

  // Revoke any tracked URL state no longer references. Kept out of the state
  // updaters so they stay free of side effects under StrictMode.
  useEffect(() => {
    const live = new Set<string>();
    for (const video of videos) if (video.videoUrl) live.add(video.videoUrl);
    if (mergedVideoUrl) live.add(mergedVideoUrl);

    for (const url of objectUrlsRef.current) {
      if (!live.has(url)) {
        URL.revokeObjectURL(url);
        objectUrlsRef.current.delete(url);
      }
    }
  }, [videos, mergedVideoUrl]);

  useEffect(() => releaseAllObjectUrls, [releaseAllObjectUrls]);

  // --- API key --------------------------------------------------------------

  useEffect(() => {
    const check = async () => {
      try {
        if (hasApiKey()) {
          setApiKeySelected(true);
        } else if (window.aistudio && (await window.aistudio.hasSelectedApiKey())) {
          setApiKeySelected(true);
        }
      } catch (e) {
        console.error('Error checking for API key:', e);
      } finally {
        setCheckingApiKey(false);
      }
    };
    void check();
  }, []);

  const handleSelectApiKey = async () => {
    if (!window.aistudio) {
      setError(
        'Seletor de chave indisponível fora do AI Studio. Crie um arquivo .env na raiz do projeto com GEMINI_API_KEY=sua_chave e reinicie o servidor.'
      );
      return;
    }
    try {
      await window.aistudio.openSelectKey();
      setApiKeySelected(true);
      setError(null);
    } catch (e) {
      console.error('Error opening API key selection:', e);
      setError('Não foi possível abrir o seletor de chave de API.');
    }
  };

  // --- Image selection ------------------------------------------------------

  const setPreview = useCallback((kind: PreviewKind, value: string | null) => {
    setPreviews((prev) => ({ ...prev, [kind]: value }));
  }, []);

  const selectReferenceVideo = useCallback(
    (file: File | null) => {
      setReferenceVideoFile(file);
      setStyleAnalysis('');
      // A data URL for a multi-megabyte video would be wasteful; the preview
      // only needs a handle to the local file.
      setReferenceVideoPreview((previous) => {
        if (previous) URL.revokeObjectURL(previous);
        return file ? URL.createObjectURL(file) : null;
      });
    },
    []
  );

  const selectImage = useCallback(
    (kind: PreviewKind, file: File | null, onReady?: (file: File) => void) => {
      const setFile =
        kind === 'influencer'
          ? setInfluencerImageFile
          : kind === 'product'
            ? setProductImageFile
            : setLogoImageFile;

      setFile(file);
      if (!file) {
        setPreview(kind, null);
        return;
      }

      void fileToDataUrl(file)
        .then((dataUrl) => {
          setPreview(kind, dataUrl);
          onReady?.(file);
        })
        .catch(() => setError('Não foi possível ler o arquivo selecionado.'));
    },
    [setPreview]
  );

  // --- Agents ---------------------------------------------------------------

  const analyzeInfluencer = useCallback(async (file: File) => {
    setIsAnalyzingInfluencer(true);
    setError(null);
    try {
      setCharacterDescription(await generateInfluencerPersona(await fileToMediaPayload(file)));
    } catch (e) {
      console.error(e);
      setError(`Erro ao analisar a imagem da influencer. ${humanizeError(e)}`);
    } finally {
      setIsAnalyzingInfluencer(false);
    }
  }, []);

  const handleGenerateBriefing = useCallback(async () => {
    if (!productImageFile) return;
    setIsGeneratingBriefing(true);
    setError(null);
    try {
      const product = await fileToMediaPayload(productImageFile);
      const logo = logoImageFile ? await fileToMediaPayload(logoImageFile) : null;
      setTopic(await generateCampaignBriefing(product, logo));
    } catch (e) {
      console.error(e);
      setError(`Erro ao gerar o briefing da campanha. ${humanizeError(e)}`);
    } finally {
      setIsGeneratingBriefing(false);
    }
  }, [productImageFile, logoImageFile]);

  const handleAnalyzeStyle = useCallback(async () => {
    if (!referenceUrl.trim()) return;
    setIsAnalyzingStyle(true);
    setError(null);
    try {
      setStyleAnalysis(await analyzeReferenceStyle(referenceUrl.trim()));
    } catch (e) {
      console.error(e);
      setError(`Erro ao analisar a referência de estilo. ${humanizeError(e)}`);
    } finally {
      setIsAnalyzingStyle(false);
    }
  }, [referenceUrl]);

  /**
   * The video path is the accurate one: Omni actually watches the clip, while
   * the URL path can only reason about the platform in the link.
   */
  const handleAnalyzeReferenceVideo = useCallback(async () => {
    if (!referenceVideoFile) return;
    setIsAnalyzingStyle(true);
    setError(null);
    try {
      const payload = await fileToMediaPayload(referenceVideoFile, 'video/mp4');
      setStyleAnalysis(await analyzeReferenceVideo(payload, referenceUrl.trim() || null));
    } catch (e) {
      console.error(e);
      setError(`Erro ao analisar o vídeo de referência. ${humanizeError(e)}`);
    } finally {
      setIsAnalyzingStyle(false);
    }
  }, [referenceVideoFile, referenceUrl]);

  const handleExportPdf = useCallback(async () => {
    if (!topic || isExportingPdf) return;
    setIsExportingPdf(true);
    try {
      await exportBriefingPdf({
        topic,
        characterDescription,
        referenceUrl,
        styleAnalysis,
        influencerPreview: previews.influencer,
        logoPreview: previews.logo,
      });
    } catch (e) {
      console.error(e);
      setError('Não foi possível gerar o PDF do briefing.');
    } finally {
      setIsExportingPdf(false);
    }
  }, [topic, isExportingPdf, characterDescription, referenceUrl, styleAnalysis, previews]);

  const handleGenerateScript = useCallback(async () => {
    if (!productImageFile || !characterDescription || credits < SCRIPT_GENERATION_COST) return;

    setIsLoadingScript(true);
    setError(null);
    setScript(null);
    setVideos([]);
    setMergedVideoUrl(null);
    setSocialContent(null);

    try {
      const product = await fileToMediaPayload(productImageFile);
      const logo = logoImageFile ? await fileToMediaPayload(logoImageFile) : null;

      const chunks = await generateScript(
        topic,
        product,
        logo,
        scriptMode,
        characterDescription,
        referenceUrl.trim() || null,
        styleAnalysis.trim() || null
      );

      setScript(chunks);
      setCredits((prev) => prev - SCRIPT_GENERATION_COST);
      setVideos(
        chunks.map((chunk) => ({
          id: chunk.id,
          scriptChunk: chunk,
          videoUrl: null,
          status: 'pending' as const,
        }))
      );

      // Background agent: a failure here must not block the pipeline.
      generateSocialContent(topic, chunks, referenceUrl.trim() || null)
        .then(setSocialContent)
        .catch((err) => {
          console.error('Social Agent Error:', err);
          setToast({ message: 'Não foi possível gerar o conteúdo para redes sociais.', tone: 'neutral' });
        });
    } catch (e) {
      console.error(e);
      const message = humanizeError(e);
      setError(message);
      if (/Modelo não encontrado|Chave de API inválida/.test(message)) setApiKeySelected(false);
    } finally {
      setIsLoadingScript(false);
    }
  }, [
    topic,
    credits,
    scriptMode,
    productImageFile,
    logoImageFile,
    characterDescription,
    referenceUrl,
    styleAnalysis,
  ]);

  const handleScriptChange = useCallback(
    (index: number, field: 'scene' | 'narration', value: string) => {
      if (!script) return;
      const edited = { ...script[index], [field]: value };
      const updated = [...script];
      updated[index] = edited;
      setScript(updated);
      setVideos((prev) => prev.map((v) => (v.scriptChunk.id === edited.id ? { ...v, scriptChunk: edited } : v)));
    },
    [script]
  );

  /**
   * Renders the given scenes. Credits are charged upfront so the confirmation
   * can quote an exact price, and refunded per scene that fails.
   */
  const renderScenes = useCallback(
    async (chunks: ScriptChunk[]) => {
      if (!characterDescription || chunks.length === 0) return;

      const totalCost = chunks.length * VIDEO_CHUNK_GENERATION_COST;
      if (credits < totalCost) {
        setError(`Créditos insuficientes: ${chunks.length} cena(s) custam ${totalCost} créditos.`);
        return;
      }

      setIsGeneratingVideo(true);
      setError(null);
      setCredits((prev) => prev - totalCost);
      setMergedVideoUrl(null);

      const targetIds = new Set(chunks.map((c) => c.id));
      setVideos((prev) =>
        prev.map((v) =>
          targetIds.has(v.id)
            ? {
                ...v,
                status: 'generating' as const,
                videoUrl: null,
                errorMessage: undefined,
                progressMessage: 'Na fila',
              }
            : v
        )
      );

      const characterImage: ImagePayload | null =
        useCharacterReference && influencerImageFile
          ? await fileToMediaPayload(influencerImageFile).catch(() => null)
          : null;

      let refunded = 0;
      const failures: string[] = [];

      await mapWithConcurrency(chunks, VIDEO_RENDER_CONCURRENCY, async (chunk) => {
        const setProgress = (progressMessage: string) =>
          setVideos((prev) => prev.map((v) => (v.id === chunk.id ? { ...v, progressMessage } : v)));

        try {
          setProgress('Escrevendo prompt de direção');
          const optimizedPrompt = await optimizeVeoPrompt(chunk, videoStyle, characterDescription);
          setVideos((prev) => prev.map((v) => (v.id === chunk.id ? { ...v, optimizedPrompt } : v)));

          const videoUrl = await generateVideoForChunk(chunk, {
            style: videoStyle,
            aspectRatio,
            characterDescription,
            optimizedPrompt,
            characterImage,
            onProgress: setProgress,
          });

          trackObjectUrl(videoUrl);
          setVideos((prev) =>
            prev.map((v) =>
              v.id === chunk.id ? { ...v, status: 'done', videoUrl, progressMessage: undefined } : v
            )
          );
        } catch (err) {
          console.error(`Failed to generate video for chunk ${chunk.id}`, err);
          const message = humanizeError(err);
          failures.push(message);
          refunded += VIDEO_CHUNK_GENERATION_COST;
          setVideos((prev) =>
            prev.map((v) =>
              v.id === chunk.id
                ? { ...v, status: 'error', errorMessage: message, progressMessage: undefined }
                : v
            )
          );
        }
      });

      if (refunded > 0) setCredits((prev) => prev + refunded);
      setIsGeneratingVideo(false);

      if (failures.length > 0) {
        const [first] = failures;
        setError(
          failures.length === 1
            ? `Uma cena falhou: ${first} Os créditos dela foram devolvidos.`
            : `${failures.length} cenas falharam (${first}) Os créditos delas foram devolvidos.`
        );
        if (/Modelo não encontrado|Chave de API inválida/.test(first)) setApiKeySelected(false);
      }
    },
    [
      credits,
      characterDescription,
      videoStyle,
      aspectRatio,
      useCharacterReference,
      influencerImageFile,
      trackObjectUrl,
    ]
  );

  const handleRetryFailed = useCallback(() => {
    const failed = videos.filter((v) => v.status === 'error').map((v) => v.scriptChunk);
    if (failed.length > 0) void renderScenes(failed);
  }, [videos, renderScenes]);

  const handleMerge = useCallback(async () => {
    const clipUrls = videos.map((v) => v.videoUrl).filter((url): url is string => Boolean(url));
    if (clipUrls.length === 0 || clipUrls.length !== videos.length) return;

    setIsMerging(true);
    setMergeStage('');
    setError(null);

    try {
      const { blob, mimeType } = await mergeVideoClips(clipUrls, {
        transitionMs: TRANSITION_DURATION_MS,
        onProgress: setMergeStage,
      });
      setMergedVideoUrl(trackObjectUrl(URL.createObjectURL(blob)));
      setMergedVideoExtension(mimeType.includes('mp4') ? 'mp4' : 'webm');
      setCurrentStep('entrega');
      setToast({ message: 'Vídeo final pronto.', tone: 'ok' });
    } catch (e) {
      console.error(e);
      setError(e instanceof Error ? e.message : 'Falha ao unir os vídeos.');
    } finally {
      setIsMerging(false);
      setMergeStage('');
    }
  }, [videos, trackObjectUrl]);

  const allScenesRendered = videos.length > 0 && videos.every((v) => v.status === 'done');

  // Auto-assemble the final cut once every scene has rendered.
  useEffect(() => {
    if (allScenesRendered && !isGeneratingVideo && !mergedVideoUrl && !isMerging) {
      // oxlint-disable-next-line react/set-state-in-effect
      void handleMerge();
    }
  }, [allScenesRendered, isGeneratingVideo, mergedVideoUrl, isMerging, handleMerge]);

  // --- Project persistence --------------------------------------------------

  const handleSaveProject = useCallback(async () => {
    try {
      const [influencer, product, logo] = await Promise.all([
        influencerImageFile ? fileToDataUrl(influencerImageFile) : Promise.resolve(null),
        productImageFile ? fileToDataUrl(productImageFile) : Promise.resolve(null),
        logoImageFile ? fileToDataUrl(logoImageFile) : Promise.resolve(null),
      ]);

      const state: SavedProjectState = {
        version: PROJECT_FORMAT_VERSION,
        timestamp: Date.now(),
        topic,
        characterDescription,
        script,
        credits,
        referenceUrl,
        styleAnalysis,
        videoStyle,
        scriptMode,
        aspectRatio,
        useCharacterReference,
        socialContent,
        influencerImageBase64: influencer,
        productImageBase64: product,
        logoImageBase64: logo,
      };

      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(state));
      setCanLoadProject(true);
      setToast({ message: 'Projeto salvo.', tone: 'ok' });
    } catch (e: any) {
      console.error('Erro ao salvar projeto:', e);
      const isQuota =
        e?.name === 'QuotaExceededError' || e?.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e?.code === 22;
      setToast({
        message: isQuota
          ? 'Imagens grandes demais para salvar no navegador.'
          : 'Falha ao salvar o projeto.',
        tone: 'danger',
      });
    }
  }, [
    influencerImageFile,
    productImageFile,
    logoImageFile,
    topic,
    characterDescription,
    script,
    credits,
    referenceUrl,
    styleAnalysis,
    videoStyle,
    scriptMode,
    aspectRatio,
    useCharacterReference,
    socialContent,
  ]);

  const handleLoadProject = useCallback(() => {
    try {
      const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
      if (!saved) return;
      const data: SavedProjectState = JSON.parse(saved);

      setMergedVideoUrl(null);
      setTopic(data.topic ?? '');
      setCharacterDescription(data.characterDescription ?? null);
      setCredits(typeof data.credits === 'number' ? data.credits : INITIAL_CREDITS);
      setReferenceUrl(data.referenceUrl ?? '');
      setStyleAnalysis(data.styleAnalysis ?? '');
      setVideoStyle(data.videoStyle ?? 'cinematic');
      setScriptMode(data.scriptMode ?? 'balanced');
      setAspectRatio(data.aspectRatio ?? '9:16');
      setUseCharacterReference(data.useCharacterReference ?? true);
      setSocialContent(data.socialContent ?? null);

      setInfluencerImageFile(
        data.influencerImageBase64 ? dataUrlToFile(data.influencerImageBase64, 'influencer.png') : null
      );
      setProductImageFile(data.productImageBase64 ? dataUrlToFile(data.productImageBase64, 'produto.png') : null);
      setLogoImageFile(data.logoImageBase64 ? dataUrlToFile(data.logoImageBase64, 'logo.png') : null);
      setPreviews({
        influencer: data.influencerImageBase64 ?? null,
        product: data.productImageBase64 ?? null,
        logo: data.logoImageBase64 ?? null,
      });

      if (data.script?.length) {
        setScript(data.script);
        setVideos(
          data.script.map((chunk) => ({
            id: chunk.id,
            scriptChunk: chunk,
            videoUrl: null,
            status: 'pending' as const,
          }))
        );
        setCurrentStep('roteiro');
        setToast({
          message: 'Projeto carregado. As cenas precisam ser renderizadas de novo.',
          tone: 'neutral',
        });
      } else {
        setScript(null);
        setVideos([]);
        setCurrentStep('persona');
        setToast({ message: 'Projeto carregado.', tone: 'ok' });
      }
    } catch (e) {
      console.error('Erro ao carregar projeto:', e);
      setToast({ message: 'Arquivo de projeto corrompido ou inválido.', tone: 'danger' });
    }
  }, []);

  const handleReset = useCallback(() => {
    setTopic('');
    setProductImageFile(null);
    setLogoImageFile(null);
    setInfluencerImageFile(null);
    setPreviews({ influencer: null, product: null, logo: null });
    setCharacterDescription(null);
    setScript(null);
    setVideos([]);
    setError(null);
    setIsLoadingScript(false);
    setIsGeneratingVideo(false);
    setIsMerging(false);
    setMergedVideoUrl(null);
    setReferenceUrl('');
    selectReferenceVideo(null);
    setStyleAnalysis('');
    setSocialContent(null);
    setConfirmingRender(false);
    setCurrentStep('persona');
  }, [selectReferenceVideo]);

  // --- Step model -----------------------------------------------------------

  const busy = isLoadingScript || isGeneratingVideo || isMerging;
  const renderCost = (script?.length ?? 0) * VIDEO_CHUNK_GENERATION_COST;

  const steps: StepDescriptor[] = useMemo(
    () =>
      STEP_ORDER.map(({ id, label }) => {
        const complete =
          id === 'persona'
            ? Boolean(characterDescription)
            : id === 'campanha'
              ? Boolean(productImageFile) && topic.trim().length > 0
              : id === 'roteiro'
                ? Boolean(script)
                : id === 'producao'
                  ? allScenesRendered
                  : Boolean(mergedVideoUrl);
        return { id, label, state: complete ? 'done' : 'todo' };
      }),
    [characterDescription, productImageFile, topic, script, allScenesRendered, mergedVideoUrl]
  );

  const meta = STEP_ORDER.find((s) => s.id === currentStep) ?? STEP_ORDER[0];

  const goTo = useCallback((id: StepId) => {
    setConfirmingRender(false);
    setCurrentStep(id);
  }, []);

  /** What blocks this step's primary action, phrased as the fix. */
  const blockedBy = ((): string | null => {
    if (currentStep === 'persona') return characterDescription ? null : 'Envie uma foto para gerar a persona.';
    if (currentStep === 'campanha') {
      if (!productImageFile) return 'Envie a imagem do produto.';
      if (!topic.trim()) return 'Escreva ou gere o briefing da campanha.';
      return null;
    }
    if (currentStep === 'roteiro') {
      if (!characterDescription) return 'Falta a persona — volte para a etapa 1.';
      if (!productImageFile || !topic.trim()) return 'Falta o produto ou o briefing — volte para a etapa 2.';
      if (credits < SCRIPT_GENERATION_COST) return 'Créditos insuficientes.';
      return null;
    }
    if (currentStep === 'producao') {
      if (!script) return 'Gere o roteiro primeiro — etapa 3.';
      if (!allScenesRendered && credits < renderCost) {
        return `Créditos insuficientes: são necessários ${renderCost}.`;
      }
      return null;
    }
    if (!allScenesRendered) return 'Renderize todas as cenas na etapa 4 para montar o vídeo.';
    return null;
  })();

  // --- Gates ----------------------------------------------------------------

  if (checkingApiKey) {
    return (
      <div className="flex min-h-screen items-center justify-center text-ink-2">
        <Spinner className="h-5 w-5 text-accent-ink" label="Inicializando" />
      </div>
    );
  }

  if (!apiKeySelected) {
    return (
      <div className="flex min-h-screen flex-col">
        <Header
          credits={credits}
          onReset={handleReset}
          onSave={() => void handleSaveProject()}
          onLoad={handleLoadProject}
          canLoad={canLoadProject}
        />
        <main className="mx-auto flex w-full max-w-xl flex-1 flex-col justify-center px-4 py-16">
          <h1 className="text-3xl font-semibold text-ink">Conecte uma chave de API</h1>
          <p className="mt-3 text-base text-ink-2">
            O estúdio usa Gemini para o roteiro e Veo para o vídeo. O Veo exige um projeto do Google Cloud com
            faturamento habilitado.
          </p>
          <p className="mt-4 text-sm text-ink-3">
            Fora do AI Studio, crie um arquivo{' '}
            <code className="rounded bg-surface-2 px-1.5 py-0.5 text-accent-ink">.env</code> com{' '}
            <code className="rounded bg-surface-2 px-1.5 py-0.5 text-accent-ink">GEMINI_API_KEY=sua_chave</code> e
            reinicie o servidor.
          </p>
          {error && (
            <div className="mt-6">
              <Notice onDismiss={() => setError(null)}>{error}</Notice>
            </div>
          )}
          <div className="mt-8 flex flex-wrap items-center gap-3">
            <Button variant="primary" size="lg" onClick={() => void handleSelectApiKey()}>
              Conectar chave
            </Button>
            <a
              href="https://ai.google.dev/gemini-api/docs/billing"
              target="_blank"
              rel="noopener noreferrer"
              className="rounded text-sm text-accent-ink underline-offset-4 hover:underline"
            >
              Ver detalhes de faturamento
            </a>
          </div>
        </main>
      </div>
    );
  }

  // --- Footer ---------------------------------------------------------------

  const footerActions = (() => {
    switch (currentStep) {
      case 'persona':
        return (
          <Button variant="primary" onClick={() => goTo('campanha')} disabled={!characterDescription}>
            Continuar
          </Button>
        );
      case 'campanha':
        return (
          <Button variant="primary" onClick={() => goTo('roteiro')} disabled={Boolean(blockedBy)}>
            Continuar
          </Button>
        );
      case 'roteiro':
        return (
          <>
            {script && (
              <Button onClick={() => void handleGenerateScript()} disabled={Boolean(blockedBy) || busy}>
                Gerar outro
              </Button>
            )}
            <Button
              variant="primary"
              onClick={() => (script ? goTo('producao') : void handleGenerateScript())}
              disabled={Boolean(blockedBy) || busy}
            >
              {isLoadingScript && <Spinner className="h-4 w-4" />}
              {isLoadingScript
                ? 'Escrevendo'
                : script
                  ? 'Ir para produção'
                  : `Gerar roteiro · ${SCRIPT_GENERATION_COST} crédito`}
            </Button>
          </>
        );
      case 'producao':
        if (allScenesRendered) {
          return (
            <Button variant="primary" onClick={() => goTo('entrega')}>
              Ver resultado
            </Button>
          );
        }
        if (confirmingRender) {
          return (
            <>
              <Button onClick={() => setConfirmingRender(false)}>Cancelar</Button>
              <Button
                variant="primary"
                onClick={() => {
                  setConfirmingRender(false);
                  if (script) void renderScenes(script);
                }}
              >
                Confirmar · {renderCost} créditos
              </Button>
            </>
          );
        }
        return (
          <Button
            variant="primary"
            onClick={() => setConfirmingRender(true)}
            disabled={Boolean(blockedBy) || busy}
          >
            {isGeneratingVideo && <Spinner className="h-4 w-4" />}
            {isGeneratingVideo
              ? 'Renderizando'
              : `Renderizar ${script?.length ?? 0} cenas · ${renderCost} créditos`}
          </Button>
        );
      default:
        return <Button onClick={() => goTo('producao')}>Voltar para produção</Button>;
    }
  })();

  const footerHint = (() => {
    if (currentStep === 'producao' && confirmingRender) {
      return `Isso consome ${renderCost} créditos e não pode ser desfeito.`;
    }
    if (currentStep === 'producao' && isGeneratingVideo) {
      return `Renderizando até ${VIDEO_RENDER_CONCURRENCY} cenas por vez para respeitar a cota do Veo.`;
    }
    if (currentStep === 'entrega' && mergedVideoUrl) return 'Vídeo montado e pronto para baixar.';
    if (currentStep === 'roteiro' && script) return 'Revise as cenas antes de renderizar — depois cada mudança custa uma nova renderização.';
    if (currentStep === 'persona' && characterDescription) return 'Persona pronta. Ela vai reaparecer em cada cena.';
    // Otherwise the footer stays quiet: repeating the subtitle two rows above
    // it added nothing.
    return undefined;
  })();

  return (
    <div className="flex min-h-screen flex-col">
      <Header
        credits={credits}
        onReset={handleReset}
        onSave={() => void handleSaveProject()}
        onLoad={handleLoadProject}
        canLoad={canLoadProject}
      />
      <Stepper steps={steps} current={currentStep} onSelect={goTo} />

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
        <div className="mb-6">
          <h1 className="text-2xl font-semibold text-ink">{meta.title}</h1>
          <p className="mt-1 text-base text-ink-2">{meta.lead}</p>
        </div>

        {error && (
          <div className="mb-6">
            <Notice title="Erro no processamento" onDismiss={() => setError(null)}>
              {error}
            </Notice>
          </div>
        )}

        <div key={currentStep} className="animate-fade-in">
          {currentStep === 'persona' && (
            <PersonaStep
              influencerImageFile={influencerImageFile}
              influencerPreview={previews.influencer}
              onSelectInfluencer={(file) => selectImage('influencer', file, (f) => void analyzeInfluencer(f))}
              isAnalyzing={isAnalyzingInfluencer}
              characterDescription={characterDescription}
              onError={setError}
            />
          )}

          {currentStep === 'campanha' && (
            <CampaignStep
              productImageFile={productImageFile}
              productPreview={previews.product}
              onSelectProduct={(file) => selectImage('product', file)}
              logoImageFile={logoImageFile}
              logoPreview={previews.logo}
              onSelectLogo={(file) => selectImage('logo', file)}
              topic={topic}
              setTopic={setTopic}
              onGenerateBriefing={() => void handleGenerateBriefing()}
              isGeneratingBriefing={isGeneratingBriefing}
              referenceUrl={referenceUrl}
              setReferenceUrl={setReferenceUrl}
              referenceVideoFile={referenceVideoFile}
              referenceVideoPreview={referenceVideoPreview}
              onSelectReferenceVideo={selectReferenceVideo}
              onAnalyzeVideo={() => void handleAnalyzeReferenceVideo()}
              styleAnalysis={styleAnalysis}
              setStyleAnalysis={setStyleAnalysis}
              onAnalyzeStyle={() => void handleAnalyzeStyle()}
              isAnalyzingStyle={isAnalyzingStyle}
              onExportPdf={() => void handleExportPdf()}
              isExportingPdf={isExportingPdf}
              onError={setError}
              disabled={busy}
            />
          )}

          {currentStep === 'roteiro' && (
            <ScriptStep
              script={script}
              scriptMode={scriptMode}
              setScriptMode={setScriptMode}
              characterDescription={characterDescription}
              onScriptChange={handleScriptChange}
              locked={isGeneratingVideo || isMerging}
              isLoading={isLoadingScript}
            />
          )}

          {currentStep === 'producao' && (
            <ProductionStep
              videos={videos}
              videoStyle={videoStyle}
              setVideoStyle={setVideoStyle}
              aspectRatio={aspectRatio}
              setAspectRatio={setAspectRatio}
              useCharacterReference={useCharacterReference}
              setUseCharacterReference={setUseCharacterReference}
              hasInfluencerImage={Boolean(influencerImageFile)}
              isGenerating={isGeneratingVideo}
              isMerging={isMerging}
              mergeStage={mergeStage}
              onRetryFailed={handleRetryFailed}
            />
          )}

          {currentStep === 'entrega' && (
            <DeliveryStep
              mergedVideoUrl={mergedVideoUrl}
              mergedVideoExtension={mergedVideoExtension}
              aspectRatio={aspectRatio}
              socialContent={socialContent}
              isMerging={isMerging}
              mergeStage={mergeStage}
              onRemerge={() => void handleMerge()}
              canRemerge={allScenesRendered}
            />
          )}
        </div>
      </main>

      <StepFooter blockedBy={blockedBy} hint={footerHint}>
        {footerActions}
      </StepFooter>

      {toast && <Toast toast={toast} onClose={dismissToast} />}
    </div>
  );
}

export default App;
