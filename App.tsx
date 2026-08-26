
import React, { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { Script, ScriptChunk, VideoChunk, VideoStyle, ScriptMode, AspectRatio, SavedProjectState, SocialContentGenerated, ImagePayload } from './types';
import {
  INITIAL_CREDITS,
  SCRIPT_GENERATION_COST,
  VIDEO_CHUNK_GENERATION_COST,
  VIDEO_RENDER_CONCURRENCY,
  TRANSITION_DURATION_MS,
} from './constants';
import {
  generateScript,
  generateVideoForChunk,
  generateInfluencerPersona,
  generateCampaignBriefing,
  generateSocialContent,
  optimizeVeoPrompt,
  analyzeReferenceStyle,
  humanizeError,
  hasApiKey,
} from './services/geminiService';
import { mergeVideoClips } from './services/videoMerger';
import { fileToDataUrl, dataUrlToFile, fileToImagePayload, mapWithConcurrency } from './utils/files';
import Header from './components/Header';
import ScriptGenerator from './components/ScriptGenerator';
import ScriptEditor from './components/ScriptEditor';
import VideoDisplay from './components/VideoDisplay';
import { Loader } from './components/Loader';

const LOCAL_STORAGE_KEY = 'influencer_labs_project';
const PROJECT_FORMAT_VERSION = 2;

type ToastState = { message: string; type: 'success' | 'error' | 'info' };

const Toast: React.FC<{ toast: ToastState; onClose: () => void }> = ({ toast, onClose }) => {
    // Keyed on the message so a re-render of the parent does not restart the
    // countdown; a genuinely new toast gets a fresh timer.
    useEffect(() => {
        const timer = setTimeout(onClose, 4000);
        return () => clearTimeout(timer);
    }, [toast, onClose]);

    const bgColors = {
        success: 'bg-green-500/20 border-green-500 text-green-400',
        error: 'bg-red-500/20 border-red-500 text-red-400',
        info: 'bg-cyan-500/20 border-cyan-500 text-cyan-400',
    };

    return (
        <div className={`fixed top-24 right-8 z-[100] px-6 py-4 rounded-xl border backdrop-blur-md shadow-2xl flex items-center animate-fade-in-up ${bgColors[toast.type]}`} role="status">
            <span className="font-bold mr-2">{toast.type === 'success' ? '✓' : toast.type === 'error' ? '⚠' : 'ℹ'}</span>
            {toast.message}
        </div>
    );
};

const Confetti: React.FC<{ trigger: boolean }> = ({ trigger }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        if (!trigger || !canvasRef.current) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;

        const colors = ['#06b6d4', '#7c3aed', '#ffffff', '#facc15'];
        const particles = Array.from({ length: 100 }, () => ({
            x: canvas.width / 2,
            y: canvas.height / 2,
            vx: (Math.random() - 0.5) * 20,
            vy: (Math.random() - 0.5) * 20,
            size: Math.random() * 5 + 2,
            color: colors[Math.floor(Math.random() * colors.length)],
            life: 100,
        }));

        let frame = 0;
        const animate = () => {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            let active = false;
            for (const p of particles) {
                if (p.life <= 0) continue;
                active = true;
                p.x += p.vx;
                p.y += p.vy;
                p.vy += 0.2; // gravity
                p.life--;
                ctx.globalAlpha = p.life / 100;
                ctx.fillStyle = p.color;
                ctx.beginPath();
                ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
                ctx.fill();
            }
            if (active) {
                frame = requestAnimationFrame(animate);
            } else {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
            }
        };
        frame = requestAnimationFrame(animate);

        return () => cancelAnimationFrame(frame);
    }, [trigger]);

    return <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none z-[100]" aria-hidden="true" />;
};

function App() {
  const [credits, setCredits] = useState<number>(INITIAL_CREDITS);

  // Influencer State
  const [influencerImageFile, setInfluencerImageFile] = useState<File | null>(null);
  const [characterDescription, setCharacterDescription] = useState<string | null>(null);
  const [isAnalyzingInfluencer, setIsAnalyzingInfluencer] = useState(false);

  // Campaign State
  const [topic, setTopic] = useState<string>('');
  const [productImageFile, setProductImageFile] = useState<File | null>(null);
  const [logoImageFile, setLogoImageFile] = useState<File | null>(null);
  const [isGeneratingBriefing, setIsGeneratingBriefing] = useState(false);
  const [referenceUrl, setReferenceUrl] = useState<string>('');
  const [styleAnalysis, setStyleAnalysis] = useState<string>('');
  const [isAnalyzingStyle, setIsAnalyzingStyle] = useState(false);

  // Script & Video State
  const [script, setScript] = useState<Script | null>(null);
  const [videos, setVideos] = useState<VideoChunk[]>([]);
  const [isLoadingScript, setIsLoadingScript] = useState<boolean>(false);
  const [isGeneratingVideo, setIsGeneratingVideo] = useState<boolean>(false);
  const [isMerging, setIsMerging] = useState<boolean>(false);
  const [mergeStage, setMergeStage] = useState<string>('');
  const [mergedVideoUrl, setMergedVideoUrl] = useState<string | null>(null);
  const [mergedVideoExtension, setMergedVideoExtension] = useState<string>('webm');

  const [error, setError] = useState<string | null>(null);
  const [videoStyle, setVideoStyle] = useState<VideoStyle>('cinematic');
  const [scriptMode, setScriptMode] = useState<ScriptMode>('balanced');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('16:9');
  const [useCharacterReference, setUseCharacterReference] = useState<boolean>(true);
  const [apiKeySelected, setApiKeySelected] = useState<boolean>(false);
  const [checkingApiKey, setCheckingApiKey] = useState<boolean>(true);
  const [showConfetti, setShowConfetti] = useState(false);
  const [socialContent, setSocialContent] = useState<SocialContentGenerated | null>(null);

  const [toast, setToast] = useState<ToastState | null>(null);
  const [canLoadProject, setCanLoadProject] = useState(() => {
    try {
      return localStorage.getItem(LOCAL_STORAGE_KEY) !== null;
    } catch (e) {
      // Private browsing modes can throw on localStorage access.
      console.warn("localStorage indisponível:", e);
      return false;
    }
  });

  const dismissToast = useCallback(() => setToast(null), []);

  // Every blob URL handed to a <video> or <a download> is tracked here so it can
  // be released; without this the tab holds on to every clip ever rendered.
  const objectUrlsRef = useRef<Set<string>>(new Set());

  const trackObjectUrl = useCallback((url: string) => {
    objectUrlsRef.current.add(url);
    return url;
  }, []);

  const releaseAllObjectUrls = useCallback(() => {
    for (const url of objectUrlsRef.current) {
      URL.revokeObjectURL(url);
    }
    objectUrlsRef.current.clear();
  }, []);

  // Revoke any tracked URL that state no longer references. Doing it here rather
  // than inside the handlers keeps the state updaters free of side effects,
  // which matters under StrictMode's double invocation.
  useEffect(() => {
    const live = new Set<string>();
    for (const video of videos) {
      if (video.videoUrl) live.add(video.videoUrl);
    }
    if (mergedVideoUrl) live.add(mergedVideoUrl);

    for (const url of objectUrlsRef.current) {
      if (!live.has(url)) {
        URL.revokeObjectURL(url);
        objectUrlsRef.current.delete(url);
      }
    }
  }, [videos, mergedVideoUrl]);

  useEffect(() => releaseAllObjectUrls, [releaseAllObjectUrls]);

  useEffect(() => {
    const checkApiKey = async () => {
        try {
            // A build-time key (GEMINI_API_KEY in .env) is enough on its own; the
            // AI Studio picker is only consulted when running inside AI Studio.
            if (hasApiKey()) {
                setApiKeySelected(true);
            } else if (window.aistudio && await window.aistudio.hasSelectedApiKey()) {
                setApiKeySelected(true);
            }
        } catch (e) {
            console.error("Error checking for API key:", e);
        } finally {
            setCheckingApiKey(false);
        }
    };
    void checkApiKey();
  }, []);

  const handleSelectApiKey = async () => {
    if (!window.aistudio) {
      setError(
        "Seletor de chave indisponível fora do AI Studio. Crie um arquivo .env na raiz do projeto com GEMINI_API_KEY=sua_chave e reinicie o servidor."
      );
      return;
    }
    try {
      await window.aistudio.openSelectKey();
      setApiKeySelected(true);
      setError(null);
    } catch (e) {
      console.error("Error opening API key selection:", e);
      setError("Não foi possível abrir o seletor de chave de API.");
    }
  };

  const handleSaveProject = async () => {
      try {
          const [influencerBase64, productBase64, logoBase64] = await Promise.all([
              influencerImageFile ? fileToDataUrl(influencerImageFile) : Promise.resolve(null),
              productImageFile ? fileToDataUrl(productImageFile) : Promise.resolve(null),
              logoImageFile ? fileToDataUrl(logoImageFile) : Promise.resolve(null),
          ]);

          const projectState: SavedProjectState = {
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
              influencerImageBase64: influencerBase64,
              productImageBase64: productBase64,
              logoImageBase64: logoBase64
          };

          localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(projectState));
          setCanLoadProject(true);
          setToast({ message: "Projeto salvo com sucesso!", type: "success" });
      } catch (e: any) {
          console.error("Erro ao salvar projeto:", e);
          // Browsers report the quota overflow under a couple of different names.
          const isQuota = e?.name === 'QuotaExceededError' || e?.name === 'NS_ERROR_DOM_QUOTA_REACHED' || e?.code === 22;
          setToast({
              message: isQuota
                  ? "Imagens muito grandes para salvar no navegador. Use arquivos menores."
                  : "Falha ao salvar o projeto.",
              type: "error",
          });
      }
  };

  const handleLoadProject = async () => {
      try {
          const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
          if (!saved) return;

          const data: SavedProjectState = JSON.parse(saved);

          // Rendered clips live in memory only, so a load always starts from a
          // clean slate rather than pointing at blob URLs from another project.
          setMergedVideoUrl(null);

          setTopic(data.topic ?? '');
          setCharacterDescription(data.characterDescription ?? null);
          setCredits(typeof data.credits === 'number' ? data.credits : INITIAL_CREDITS);
          setReferenceUrl(data.referenceUrl ?? '');
          setStyleAnalysis(data.styleAnalysis ?? '');
          setVideoStyle(data.videoStyle ?? 'cinematic');
          setScriptMode(data.scriptMode ?? 'balanced');
          setAspectRatio(data.aspectRatio ?? '16:9');
          setUseCharacterReference(data.useCharacterReference ?? true);
          setSocialContent(data.socialContent ?? null);

          setInfluencerImageFile(data.influencerImageBase64 ? dataUrlToFile(data.influencerImageBase64, "influencer_restored.png") : null);
          setProductImageFile(data.productImageBase64 ? dataUrlToFile(data.productImageBase64, "product_restored.png") : null);
          setLogoImageFile(data.logoImageBase64 ? dataUrlToFile(data.logoImageBase64, "logo_restored.png") : null);

          if (data.script?.length) {
              setScript(data.script);
              setVideos(data.script.map(chunk => ({
                  id: chunk.id,
                  scriptChunk: chunk,
                  videoUrl: null,
                  status: 'pending' as const,
              })));
              setToast({ message: "Projeto carregado! Os vídeos precisam ser renderizados novamente.", type: "info" });
          } else {
              setScript(null);
              setVideos([]);
              setToast({ message: "Projeto carregado com sucesso!", type: "success" });
          }
      } catch (e) {
          console.error("Erro ao carregar projeto:", e);
          setToast({ message: "Arquivo de projeto corrompido ou inválido.", type: "error" });
      }
  };

  // Step 1: Casting agent
  const handleAnalyzeInfluencer = async (file: File) => {
      setIsAnalyzingInfluencer(true);
      setError(null);
      try {
          const payload = await fileToImagePayload(file);
          setCharacterDescription(await generateInfluencerPersona(payload));
      } catch (e) {
          console.error(e);
          setError(`Erro ao analisar a imagem da influencer. ${humanizeError(e)}`);
      } finally {
          setIsAnalyzingInfluencer(false);
      }
  };

  // Step 2: Strategist agent
  const handleAutoGenerateBriefing = async () => {
      if (!productImageFile) return;
      setIsGeneratingBriefing(true);
      setError(null);
      try {
          const productPayload = await fileToImagePayload(productImageFile);
          const logoPayload = logoImageFile ? await fileToImagePayload(logoImageFile) : null;
          setTopic(await generateCampaignBriefing(productPayload, logoPayload));
      } catch (e) {
          console.error(e);
          setError(`Erro ao gerar o briefing da campanha. ${humanizeError(e)}`);
      } finally {
          setIsGeneratingBriefing(false);
      }
  };

  // Step 3: Director agent
  const handleAnalyzeStyle = async () => {
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
  };

  const handleGenerateScript = useCallback(async () => {
    if (credits < SCRIPT_GENERATION_COST) {
      setError("Créditos insuficientes para gerar um roteiro.");
      return;
    }
    if (!productImageFile) {
      setError("Por favor, envie uma imagem do produto para gerar o roteiro.");
      return;
    }
    if (!characterDescription) {
        setError("Por favor, envie uma foto da influencer primeiro.");
        return;
    }

    setIsLoadingScript(true);
    setError(null);
    setScript(null);
    setVideos([]);
    setMergedVideoUrl(null);
    setSocialContent(null);

    try {
      const productImageData = await fileToImagePayload(productImageFile);
      const logoImageData = logoImageFile ? await fileToImagePayload(logoImageFile) : null;

      // 1. ScriptWriter agent
      const generatedScriptChunks = await generateScript(
        topic,
        productImageData,
        logoImageData,
        scriptMode,
        characterDescription,
        referenceUrl.trim() || null,
        styleAnalysis.trim() || null
      );
      setScript(generatedScriptChunks);
      setCredits(prev => prev - SCRIPT_GENERATION_COST);

      setVideos(generatedScriptChunks.map(chunk => ({
        id: chunk.id,
        scriptChunk: chunk,
        videoUrl: null,
        status: 'pending' as const,
      })));

      // 2. Social agent, in the background — a failure here must not block the
      // main pipeline, so it only surfaces as a toast.
      generateSocialContent(topic, generatedScriptChunks, referenceUrl.trim() || null)
          .then(setSocialContent)
          .catch(err => {
              console.error("Social Agent Error:", err);
              setToast({ message: "Não foi possível gerar o conteúdo para redes sociais.", type: "info" });
          });

    } catch (e) {
      console.error(e);
      const message = humanizeError(e);
      setError(message);
      if (/Modelo não encontrado|Chave de API inválida/.test(message)) {
        setApiKeySelected(false);
      }
    } finally {
      setIsLoadingScript(false);
    }
  }, [topic, credits, scriptMode, productImageFile, logoImageFile, characterDescription, referenceUrl, styleAnalysis]);

  const handleScriptChange = useCallback((index: number, field: 'scene' | 'narration', value: string) => {
    if (!script) return;
    const edited = { ...script[index], [field]: value };
    const updatedScript = [...script];
    updatedScript[index] = edited;
    setScript(updatedScript);

    // Keep the render queue in sync so a re-render picks up the edited text.
    setVideos(prev => prev.map(v => (v.scriptChunk.id === edited.id ? { ...v, scriptChunk: edited } : v)));
  }, [script]);

  /**
   * Renders the given scenes. Credits are charged upfront (so the confirmation
   * dialog can quote an exact price) and refunded per scene that fails.
   */
  const renderScenes = useCallback(async (chunks: ScriptChunk[]) => {
    if (!characterDescription || chunks.length === 0) return;

    const totalCost = chunks.length * VIDEO_CHUNK_GENERATION_COST;
    if (credits < totalCost) {
      setError(`Créditos insuficientes. Você precisa de ${totalCost} créditos para renderizar ${chunks.length} cena(s).`);
      return;
    }

    setIsGeneratingVideo(true);
    setError(null);
    setCredits(prev => prev - totalCost);

    // Re-rendering a scene replaces its clip, so the previous cut is stale. The
    // dropped blob URLs are revoked by the garbage-collection effect above.
    setMergedVideoUrl(null);

    const targetIds = new Set(chunks.map(c => c.id));
    setVideos(prev => prev.map(v => (
      targetIds.has(v.id)
        ? { ...v, status: 'generating' as const, videoUrl: null, errorMessage: undefined, progressMessage: 'Na fila' }
        : v
    )));

    const characterImage: ImagePayload | null =
      useCharacterReference && influencerImageFile ? await fileToImagePayload(influencerImageFile).catch(() => null) : null;

    let refunded = 0;
    const failures: string[] = [];

    // Veo's per-minute quota cannot absorb every scene at once; render in a
    // small window so a six-scene campaign does not trip rate limits.
    await mapWithConcurrency(chunks, VIDEO_RENDER_CONCURRENCY, async (chunk) => {
      const setProgress = (progressMessage: string) =>
        setVideos(prev => prev.map(v => (v.id === chunk.id ? { ...v, progressMessage } : v)));

      try {
          setProgress('Escrevendo prompt de direção');
          const optimizedPrompt = await optimizeVeoPrompt(chunk, videoStyle, characterDescription);
          setVideos(prev => prev.map(v => (v.id === chunk.id ? { ...v, optimizedPrompt } : v)));

          const videoUrl = await generateVideoForChunk(chunk, {
            style: videoStyle,
            aspectRatio,
            characterDescription,
            optimizedPrompt,
            characterImage,
            onProgress: setProgress,
          });

          trackObjectUrl(videoUrl);
          setVideos(prev => prev.map(v => (v.id === chunk.id ? { ...v, status: 'done', videoUrl, progressMessage: undefined } : v)));
      } catch (error) {
          console.error(`Failed to generate video for chunk ${chunk.id}`, error);
          const message = humanizeError(error);
          failures.push(message);
          refunded += VIDEO_CHUNK_GENERATION_COST;
          setVideos(prev => prev.map(v => (v.id === chunk.id ? { ...v, status: 'error', errorMessage: message, progressMessage: undefined } : v)));
      }
    });

    if (refunded > 0) {
      setCredits(prev => prev + refunded);
    }

    setIsGeneratingVideo(false);

    if (failures.length > 0) {
      const [first] = failures;
      setError(
        failures.length === 1
          ? `Uma cena falhou: ${first} Os créditos dela foram devolvidos.`
          : `${failures.length} cenas falharam (${first}) Os créditos delas foram devolvidos.`
      );
      if (/Modelo não encontrado|Chave de API inválida/.test(first)) {
        setApiKeySelected(false);
      }
    }
  }, [credits, characterDescription, videoStyle, aspectRatio, useCharacterReference, influencerImageFile, trackObjectUrl]);

  const handleGenerateVideos = useCallback(() => {
    if (script) void renderScenes(script);
  }, [script, renderScenes]);

  const handleRetryFailed = useCallback(() => {
    const failed = videos.filter(v => v.status === 'error').map(v => v.scriptChunk);
    if (failed.length > 0) void renderScenes(failed);
  }, [videos, renderScenes]);

  const handleMergeVideos = useCallback(async () => {
    const clipUrls = videos.map(v => v.videoUrl).filter((url): url is string => Boolean(url));
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
        setShowConfetti(true);
        setTimeout(() => setShowConfetti(false), 5000);
    } catch (e) {
        console.error(e);
        setError(e instanceof Error ? e.message : "Falha ao unir os vídeos.");
    } finally {
        setIsMerging(false);
        setMergeStage('');
    }
  }, [videos, trackObjectUrl]);

  // Auto-assemble the final cut once every scene has rendered. This is a real
  // state-driven side effect — merging reads the rendered clips and drives a
  // MediaRecorder — so the effect is the right place for it even though it ends
  // up setting state.
  useEffect(() => {
    const allDone = videos.length > 0 && videos.every(v => v.status === 'done');
    if (allDone && !isGeneratingVideo && !mergedVideoUrl && !isMerging) {
      // oxlint-disable-next-line react/set-state-in-effect
      void handleMergeVideos();
    }
  }, [videos, isGeneratingVideo, mergedVideoUrl, isMerging, handleMergeVideos]);

  const handleReset = () => {
    setTopic('');
    setProductImageFile(null);
    setLogoImageFile(null);
    setInfluencerImageFile(null);
    setCharacterDescription(null);
    setScript(null);
    setVideos([]);
    setError(null);
    setIsLoadingScript(false);
    setIsGeneratingVideo(false);
    setIsMerging(false);
    setMergedVideoUrl(null);
    setShowConfetti(false);
    setReferenceUrl('');
    setStyleAnalysis('');
    setSocialContent(null);
  };

  const renderCost = useMemo(
    () => (script?.length ?? 0) * VIDEO_CHUNK_GENERATION_COST,
    [script]
  );

  if (checkingApiKey) {
    return (
        <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white">
            <div className="text-center">
                <Loader />
                <p className="mt-4 text-cyan-400 animate-pulse">Inicializando Sistemas...</p>
            </div>
        </div>
    );
  }

  if (!apiKeySelected) {
    return (
        <div className="min-h-screen flex flex-col bg-gray-900 text-white relative overflow-hidden">
            <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,_var(--tw-gradient-stops))] from-gray-800 via-gray-900 to-black z-0"></div>
            <div className="relative z-10">
                <Header credits={credits} onReset={handleReset} onSave={handleSaveProject} onLoad={handleLoadProject} canLoad={canLoadProject} />
                <main className="container mx-auto p-4 md:p-8 flex flex-col items-center justify-center text-center" style={{minHeight: 'calc(100vh - 140px)'}}>
                    <div className="p-8 rounded-3xl glass-panel max-w-2xl w-full">
                        <h1 className="text-5xl font-bold mb-6 bg-clip-text text-transparent bg-gradient-to-r from-cyan-400 to-violet-400">
                            AI Video Studio
                        </h1>
                        <p className="mb-6 text-gray-300 text-lg leading-relaxed">
                            Desbloqueie o poder da geração de vídeo Veo. Conecte uma chave de API para acessar o estúdio criativo.
                        </p>
                        <p className="mb-8 text-sm text-gray-400">
                            Rodando fora do AI Studio? Crie um arquivo <code className="text-cyan-400 bg-black/40 px-1.5 py-0.5 rounded">.env</code> com{' '}
                            <code className="text-cyan-400 bg-black/40 px-1.5 py-0.5 rounded">GEMINI_API_KEY=sua_chave</code> e reinicie o servidor.
                            <br/>
                            <a href="https://ai.google.dev/gemini-api/docs/billing" target="_blank" rel="noopener noreferrer" className="text-cyan-400 hover:text-cyan-300 underline mt-2 inline-block">
                                Ver detalhes de faturamento
                            </a>
                        </p>
                        {error && (
                            <div className="bg-red-500/10 border border-red-500 text-red-200 px-4 py-3 rounded-xl relative mb-6" role="alert">
                                <strong className="font-bold">Erro: </strong>
                                <span className="block sm:inline">{error}</span>
                            </div>
                        )}
                        <button
                            onClick={handleSelectApiKey}
                            className="bg-gradient-to-r from-cyan-600 to-violet-600 hover:from-cyan-500 hover:to-violet-500 text-white font-bold py-4 px-10 rounded-full transition-all duration-200 text-lg shadow-lg hover:shadow-cyan-500/50 hover:scale-105"
                        >
                            Conectar API Key
                        </button>
                    </div>
                </main>
            </div>
        </div>
    );
  }

  return (
    <div className="min-h-screen text-gray-200 relative pb-12">
      <Confetti trigger={showConfetti} />
      {toast && <Toast toast={toast} onClose={dismissToast} />}
      <Header credits={credits} onReset={handleReset} onSave={handleSaveProject} onLoad={handleLoadProject} canLoad={canLoadProject} />
      <main className="container mx-auto p-4 md:p-8 relative z-10">
        {error && (
          <div className="animate-fade-in-up bg-red-900/80 border border-red-500/50 text-white px-6 py-4 rounded-xl relative mb-6 backdrop-blur-md shadow-lg" role="alert">
            <div className="flex items-center">
                <span className="text-2xl mr-3">⚠️</span>
                <div className="pr-8">
                    <strong className="font-bold block">Erro no Processamento</strong>
                    <span className="block sm:inline text-sm opacity-90">{error}</span>
                </div>
            </div>
            <button className="absolute top-4 right-4 text-red-300 hover:text-white" onClick={() => setError(null)} aria-label="Fechar aviso de erro">
              <svg className="h-5 w-5" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path d="M14.348 14.849a1.2 1.2 0 0 1-1.697 0L10 11.819l-2.651 3.029a1.2 1.2 0 1 1-1.697-1.697l2.758-3.15-2.759-3.152a1.2 1.2 0 1 1 1.697-1.697L10 8.183l2.651-3.031a1.2 1.2 0 1 1 1.697 1.697l-2.758 3.152 2.758 3.15a1.2 1.2 0 0 1 0 1.698z"/></svg>
            </button>
          </div>
        )}

        {!script ? (
          <ScriptGenerator
            influencerImageFile={influencerImageFile}
            setInfluencerImageFile={setInfluencerImageFile}
            onAnalyzeInfluencer={handleAnalyzeInfluencer}
            isAnalyzingInfluencer={isAnalyzingInfluencer}
            characterDescription={characterDescription}

            topic={topic}
            setTopic={setTopic}
            productImageFile={productImageFile}
            setProductImageFile={setProductImageFile}
            logoImageFile={logoImageFile}
            setLogoImageFile={setLogoImageFile}
            onGenerateBriefing={handleAutoGenerateBriefing}
            isGeneratingBriefing={isGeneratingBriefing}

            referenceUrl={referenceUrl}
            setReferenceUrl={setReferenceUrl}
            styleAnalysis={styleAnalysis}
            setStyleAnalysis={setStyleAnalysis}
            onAnalyzeStyle={handleAnalyzeStyle}
            isAnalyzingStyle={isAnalyzingStyle}

            onGenerate={handleGenerateScript}
            isLoading={isLoadingScript}
            scriptMode={scriptMode}
            setScriptMode={setScriptMode}
          />
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <ScriptEditor
              script={script}
              characterDescription={characterDescription}
              onScriptChange={handleScriptChange}
              isGeneratingVideo={isGeneratingVideo || isMerging}
            />
            <VideoDisplay
              videos={videos}
              onGenerate={handleGenerateVideos}
              onRetryFailed={handleRetryFailed}
              isGenerating={isGeneratingVideo}
              isMerging={isMerging}
              mergeStage={mergeStage}
              mergedVideoUrl={mergedVideoUrl}
              mergedVideoExtension={mergedVideoExtension}
              totalCost={renderCost}
              videoStyle={videoStyle}
              setVideoStyle={setVideoStyle}
              aspectRatio={aspectRatio}
              setAspectRatio={setAspectRatio}
              useCharacterReference={useCharacterReference}
              setUseCharacterReference={setUseCharacterReference}
              hasInfluencerImage={Boolean(influencerImageFile)}
              socialContent={socialContent}
            />
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
