
import React, { useState, useCallback, useEffect, useRef } from 'react';
import { Script, VideoChunk, VideoStyle, ScriptMode, AspectRatio, SavedProjectState, SocialContentGenerated } from './types';
import { INITIAL_CREDITS, SCRIPT_GENERATION_COST, VIDEO_CHUNK_GENERATION_COST, MAX_CHUNKS } from './constants';
import { generateScript, generateVideoForChunk, generateInfluencerPersona, generateCampaignBriefing, generateSocialContent, optimizeVeoPrompt } from './services/geminiService';
import Header from './components/Header';
import ScriptGenerator from './components/ScriptGenerator';
import ScriptEditor from './components/ScriptEditor';
import VideoDisplay from './components/VideoDisplay';
import { Loader } from './components/Loader';

const TRANSITION_DURATION_MS = 1000; // 1 second cross-dissolve
const TEST_URL = "https://www.tiktok.com/@stylebyassitan/video/7402182344464928032?is_from_webapp=1&sender_device=pc&web_id=7568213656002709008";
const LOCAL_STORAGE_KEY = 'influencer_labs_project';

// Toast Component
const Toast: React.FC<{ message: string; type: 'success' | 'error' | 'info'; onClose: () => void }> = ({ message, type, onClose }) => {
    useEffect(() => {
        const timer = setTimeout(onClose, 3000);
        return () => clearTimeout(timer);
    }, [onClose]);

    const bgColors = {
        success: 'bg-green-500/20 border-green-500 text-green-400',
        error: 'bg-red-500/20 border-red-500 text-red-400',
        info: 'bg-cyan-500/20 border-cyan-500 text-cyan-400',
    };

    return (
        <div className={`fixed top-24 right-8 z-[100] px-6 py-4 rounded-xl border backdrop-blur-md shadow-2xl flex items-center animate-fade-in-up ${bgColors[type]}`}>
            <span className="font-bold mr-2">{type === 'success' ? '✓' : type === 'error' ? '⚠' : 'ℹ'}</span>
            {message}
        </div>
    );
};

// Simple Canvas Confetti Component
const Confetti: React.FC<{ trigger: boolean }> = ({ trigger }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);

    useEffect(() => {
        if (!trigger || !canvasRef.current) return;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;

        const particles: any[] = [];
        const colors = ['#06b6d4', '#7c3aed', '#ffffff', '#facc15'];

        for (let i = 0; i < 100; i++) {
            particles.push({
                x: canvas.width / 2,
                y: canvas.height / 2,
                vx: (Math.random() - 0.5) * 20,
                vy: (Math.random() - 0.5) * 20,
                size: Math.random() * 5 + 2,
                color: colors[Math.floor(Math.random() * colors.length)],
                life: 100
            });
        }

        const animate = () => {
            if (!ctx) return;
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            let active = false;
            particles.forEach(p => {
                if (p.life > 0) {
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
            });
            if (active) requestAnimationFrame(animate);
            else ctx.clearRect(0, 0, canvas.width, canvas.height);
        };
        animate();

    }, [trigger]);

    return <canvas ref={canvasRef} className="fixed inset-0 pointer-events-none z-[100]" />;
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
  const [referenceUrl, setReferenceUrl] = useState<string>(TEST_URL);

  // Script & Video State
  const [script, setScript] = useState<Script | null>(null);
  const [videos, setVideos] = useState<VideoChunk[]>([]);
  const [isLoadingScript, setIsLoadingScript] = useState<boolean>(false);
  const [isGeneratingVideo, setIsGeneratingVideo] = useState<boolean>(false);
  const [isMerging, setIsMerging] = useState<boolean>(false);
  const [mergedVideoUrl, setMergedVideoUrl] = useState<string | null>(null);
  
  const [error, setError] = useState<string | null>(null);
  const [videoStyle, setVideoStyle] = useState<VideoStyle>('cinematic');
  const [scriptMode, setScriptMode] = useState<ScriptMode>('balanced');
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('16:9');
  const [apiKeySelected, setApiKeySelected] = useState<boolean>(false);
  const [checkingApiKey, setCheckingApiKey] = useState<boolean>(true);
  const [showConfetti, setShowConfetti] = useState(false);
  const [socialContent, setSocialContent] = useState<SocialContentGenerated | null>(null);

  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [canLoadProject, setCanLoadProject] = useState(false);

  useEffect(() => {
    const checkApiKey = async () => {
        try {
            if (window.aistudio && await window.aistudio.hasSelectedApiKey()) {
                setApiKeySelected(true);
            }
        } catch (e) {
            console.error("Error checking for API key:", e);
        } finally {
            setCheckingApiKey(false);
        }
    };
    checkApiKey();
    
    // Check for saved project
    const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
    if (saved) setCanLoadProject(true);
  }, []);

  const handleSelectApiKey = async () => {
    try {
      if (window.aistudio) {
          await window.aistudio.openSelectKey();
          setApiKeySelected(true);
          setError(null);
      }
    } catch (e) {
      console.error("Error opening API key selection:", e);
      setError("Não foi possível abrir o seletor de chave de API.");
    }
  };

  const fileToBase64 = (file: File): Promise<string> =>
    new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = () => {
            const result = reader.result as string;
            resolve(result); // Keep full data URL for saving
        };
        reader.onerror = reject;
    });
  
  const base64ToFile = async (dataUrl: string, filename: string): Promise<File> => {
      const res = await fetch(dataUrl);
      const buf = await res.arrayBuffer();
      const type = dataUrl.split(';')[0].split(':')[1];
      return new File([buf], filename, { type });
  };

  const handleSaveProject = async () => {
      try {
          const influencerBase64 = influencerImageFile ? await fileToBase64(influencerImageFile) : null;
          const productBase64 = productImageFile ? await fileToBase64(productImageFile) : null;
          const logoBase64 = logoImageFile ? await fileToBase64(logoImageFile) : null;

          const projectState: SavedProjectState = {
              timestamp: Date.now(),
              topic,
              characterDescription,
              script,
              credits,
              referenceUrl,
              videoStyle,
              scriptMode,
              aspectRatio,
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
          if (e.name === 'QuotaExceededError') {
              setToast({ message: "Erro: Imagens muito grandes para salvar no navegador.", type: "error" });
          } else {
              setToast({ message: "Falha ao salvar o projeto.", type: "error" });
          }
      }
  };

  const handleLoadProject = async () => {
      try {
          const saved = localStorage.getItem(LOCAL_STORAGE_KEY);
          if (!saved) return;

          const data: SavedProjectState = JSON.parse(saved);

          setTopic(data.topic);
          setCharacterDescription(data.characterDescription);
          setCredits(data.credits);
          setReferenceUrl(data.referenceUrl);
          setVideoStyle(data.videoStyle);
          setScriptMode(data.scriptMode);
          setAspectRatio(data.aspectRatio);
          setSocialContent(data.socialContent);

          // Restore Files
          if (data.influencerImageBase64) {
              const file = await base64ToFile(data.influencerImageBase64, "influencer_restored.png");
              setInfluencerImageFile(file);
          }
          if (data.productImageBase64) {
              const file = await base64ToFile(data.productImageBase64, "product_restored.png");
              setProductImageFile(file);
          }
          if (data.logoImageBase64) {
              const file = await base64ToFile(data.logoImageBase64, "logo_restored.png");
              setLogoImageFile(file);
          }

          // Restore Script & Reset Videos
          if (data.script) {
              setScript(data.script);
              // We cannot restore generated video BLOBS from localStorage (too big)
              // So we restore the slots but reset status to pending if they were done
              const restoredVideos = data.script.map(chunk => ({
                  id: chunk.id,
                  scriptChunk: chunk,
                  videoUrl: null, // Cannot persist blobs
                  status: 'pending' as const,
                  optimizedPrompt: undefined
              }));
              setVideos(restoredVideos);
              if (data.script.length > 0) {
                  setToast({ message: "Projeto carregado! Os vídeos precisam ser renderizados novamente.", type: "info" });
              } else {
                  setToast({ message: "Projeto carregado com sucesso!", type: "success" });
              }
          } else {
              setToast({ message: "Projeto carregado com sucesso!", type: "success" });
          }

      } catch (e) {
          console.error("Erro ao carregar projeto:", e);
          setToast({ message: "Arquivo de projeto corrompido ou inválido.", type: "error" });
      }
  };

  // Step 1: Analyze Influencer
  const handleAnalyzeInfluencer = async (file: File) => {
      setIsAnalyzingInfluencer(true);
      setError(null);
      try {
          const base64Full = await fileToBase64(file);
          const base64Data = base64Full.split(',')[1];
          const description = await generateInfluencerPersona({ data: base64Data, mimeType: file.type });
          setCharacterDescription(description);
      } catch (e) {
          setError("Erro ao analisar a imagem da influencer.");
          console.error(e);
      } finally {
          setIsAnalyzingInfluencer(false);
      }
  };

  // Step 2: Auto-Generate Briefing
  const handleAutoGenerateBriefing = async () => {
      if (!productImageFile) return;
      setIsGeneratingBriefing(true);
      setError(null);
      try {
          const productBase64Full = await fileToBase64(productImageFile);
          const productBase64Data = productBase64Full.split(',')[1];
          let logoData = null;
          
          if (logoImageFile) {
              const logoBase64Full = await fileToBase64(logoImageFile);
              const logoBase64Data = logoBase64Full.split(',')[1];
              logoData = { data: logoBase64Data, mimeType: logoImageFile.type };
          }
          
          const briefing = await generateCampaignBriefing(
              { data: productBase64Data, mimeType: productImageFile.type },
              logoData
          );
          setTopic(briefing);
      } catch (e) {
           setError("Erro ao gerar o briefing da campanha.");
           console.error(e);
      } finally {
          setIsGeneratingBriefing(false);
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
      const productBase64Full = await fileToBase64(productImageFile);
      const productImageData = {
        data: productBase64Full.split(',')[1],
        mimeType: productImageFile.type,
      };
      
      let logoImageData: { data: string; mimeType: string } | null = null;
      if (logoImageFile) {
        const logoBase64Full = await fileToBase64(logoImageFile);
        logoImageData = {
          data: logoBase64Full.split(',')[1],
          mimeType: logoImageFile.type,
        };
      }

      // 1. Run ScriptWriter Agent
      const generatedScriptChunks = await generateScript(
        topic, 
        productImageData, 
        logoImageData, 
        scriptMode, 
        characterDescription,
        referenceUrl
      );
      setScript(generatedScriptChunks);
      setCredits(prev => prev - SCRIPT_GENERATION_COST);
      
      const initialVideos = generatedScriptChunks.map(chunk => ({
        id: chunk.id,
        scriptChunk: chunk,
        videoUrl: null,
        status: 'pending' as const,
      }));
      setVideos(initialVideos);

      // 2. Run Social Publisher Agent (Background)
      generateSocialContent(topic, generatedScriptChunks, referenceUrl)
          .then(content => setSocialContent(content))
          .catch(err => console.error("Social Agent Error:", err));

    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : "Ocorreu um erro desconhecido.";
      if (errorMessage.includes("Requested entity was not found")) {
        setError("Chave de API inválida ou modelo não encontrado. Por favor, verifique sua chave.");
        setApiKeySelected(false);
      } else {
        setError(errorMessage);
      }
    } finally {
      setIsLoadingScript(false);
    }
  }, [topic, credits, scriptMode, productImageFile, logoImageFile, characterDescription, referenceUrl]);

  const handleScriptChange = (index: number, field: 'scene' | 'narration', value: string) => {
    if (!script) return;
    const updatedScript = [...script];
    updatedScript[index] = { ...updatedScript[index], [field]: value };
    setScript(updatedScript);
    
    setVideos(prevVideos => {
        const updatedVideos = [...prevVideos];
        const videoIndex = updatedVideos.findIndex(v => v.scriptChunk.id === updatedScript[index].id);
        if(videoIndex !== -1) {
            updatedVideos[videoIndex].scriptChunk = updatedScript[index];
        }
        return updatedVideos;
    });
  };

  const handleGenerateVideos = useCallback(async () => {
    if (!script || !characterDescription) return;

    const totalCost = script.length * VIDEO_CHUNK_GENERATION_COST;
    if (credits < totalCost) {
      setError(`Créditos insuficientes. Você precisa de ${totalCost} créditos para gerar os vídeos de todas as cenas.`);
      return;
    }

    setIsGeneratingVideo(true);
    setError(null);
    setMergedVideoUrl(null);
    setCredits(prev => prev - totalCost);

    setVideos(prev => prev.map(v => ({ ...v, status: 'generating' })));

    let firstErrorMessage: string | null = null;

    const promises = script.map(async (chunk) => {
      try {
          // 1. Agent: Video Director (Optimize Prompt)
          const optimizedPrompt = await optimizeVeoPrompt(chunk.scene, videoStyle, characterDescription);
          
          setVideos(prev => prev.map(v => v.id === chunk.id ? { ...v, optimizedPrompt } : v));

          // 2. Agent: Renderer (Veo)
          const videoUrl = await generateVideoForChunk(chunk, videoStyle, aspectRatio, characterDescription, optimizedPrompt);
          
          setVideos(prev => prev.map(v => v.id === chunk.id ? { ...v, status: 'done', videoUrl } : v));
      } catch (error) {
          console.error(`Failed to generate video for chunk ${chunk.id}`, error);
          if (!firstErrorMessage && error instanceof Error) {
            firstErrorMessage = error.message;
          }
          setVideos(prev => prev.map(v => v.id === chunk.id ? { ...v, status: 'error' } : v));
      }
    });

    await Promise.all(promises);

    setIsGeneratingVideo(false);
    
    if (firstErrorMessage) {
      // Enhance error message for Veo requirements
      if (firstErrorMessage.includes("Requested entity was not found")) {
          setError("O modelo Veo requer um projeto com faturamento habilitado (Paid Tier). Por favor, selecione uma chave de API de um projeto com billing ativo.");
          setApiKeySelected(false);
          return;
      }
      setError(firstErrorMessage);
    }

  }, [script, credits, videoStyle, aspectRatio, characterDescription]);

  // Refactored handleMergeVideos to support Smooth Transitions (Cross-Dissolve)
  const handleMergeVideos = useCallback(async () => {
    const generatedVideos = videos.filter(v => v.status === 'done' && v.videoUrl);
    if (generatedVideos.length !== videos.length || generatedVideos.length === 0) return;

    setIsMerging(true);
    setError(null);
    
    let audioContext: AudioContext | null = null;

    try {
        const videoUrls = generatedVideos.map(v => v.videoUrl!);
        
        // Setup Audio Context
        audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
        await audioContext.resume(); // Important for newer browsers

        const audioDestination = audioContext.createMediaStreamDestination();
        
        // Setup Canvas
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        if (!ctx) throw new Error("Não foi possível obter o contexto do canvas");

        // Initialize Canvas size based on the first video
        const tempVideo = document.createElement('video');
        tempVideo.crossOrigin = "anonymous";
        tempVideo.src = videoUrls[0];
        await new Promise((resolve) => {
            tempVideo.onloadedmetadata = () => {
                canvas.width = tempVideo.videoWidth;
                canvas.height = tempVideo.videoHeight;
                resolve(null);
            };
        });

        // Capture Canvas Stream
        const canvasStream = canvas.captureStream(30);
        const combinedStream = new MediaStream([
            ...canvasStream.getVideoTracks(),
            ...audioDestination.stream.getAudioTracks()
        ]);

        const recorder = new MediaRecorder(combinedStream, { mimeType: 'video/webm; codecs=vp9,opus' });
        const recordedChunks: Blob[] = [];

        recorder.ondataavailable = (e) => {
            if (e.data.size > 0) recordedChunks.push(e.data);
        };

        recorder.onstop = () => {
            const blob = new Blob(recordedChunks, { type: 'video/webm' });
            const url = URL.createObjectURL(blob);
            setMergedVideoUrl(url);
            setIsMerging(false);
            setShowConfetti(true);
            setTimeout(() => setShowConfetti(false), 5000);
            audioContext?.close();
        };

        recorder.start();

        // --- Transition Logic System ---
        
        // We need two video elements to ping-pong between for cross-fading
        const videoA = document.createElement('video');
        const videoB = document.createElement('video');
        
        [videoA, videoB].forEach(v => {
            // CRITICAL FIX: Muted must be FALSE for createMediaElementSource to capture audio
            // We don't hear it because we don't connect it to audioContext.destination (speakers)
            v.muted = false; 
            v.volume = 1.0;
            v.crossOrigin = "anonymous"; // Required for canvas tainting security
            v.playsInline = true;
        });

        // Setup audio graph nodes for both
        const gainNodeA = audioContext.createGain();
        const gainNodeB = audioContext.createGain();
        
        const sourceNodeA = audioContext.createMediaElementSource(videoA);
        const sourceNodeB = audioContext.createMediaElementSource(videoB);
        
        // Connect sources to gains, and gains to the RECORDER (not speakers)
        sourceNodeA.connect(gainNodeA).connect(audioDestination);
        sourceNodeB.connect(gainNodeB).connect(audioDestination);

        // Helper to prepare a video element
        const loadVideo = async (videoEl: HTMLVideoElement, url: string) => {
            videoEl.src = url;
            await new Promise<void>((resolve, reject) => {
                videoEl.oncanplay = () => resolve();
                videoEl.onerror = reject;
            });
        };

        // Sequence State
        let currentIndex = 0;
        let activeVideo = videoA;
        let incomingVideo = videoB;
        let activeGain = gainNodeA;
        let incomingGain = gainNodeB;
        
        // Initial Setup
        await loadVideo(activeVideo, videoUrls[0]);
        
        // Start playback
        activeGain.gain.setValueAtTime(1, audioContext.currentTime);
        incomingGain.gain.setValueAtTime(0, audioContext.currentTime);
        
        await activeVideo.play();

        // Render Loop
        const render = async () => {
            if (!ctx || !activeVideo) return;

            // 1. Draw the active video (Base layer)
            ctx.globalAlpha = 1;
            ctx.drawImage(activeVideo, 0, 0, canvas.width, canvas.height);

            // 2. Check for Transition Trigger
            const timeLeft = activeVideo.duration - activeVideo.currentTime;
            const transitionTimeSec = TRANSITION_DURATION_MS / 1000;
            const hasNextVideo = currentIndex + 1 < videoUrls.length;
            const isTransitioning = !incomingVideo.paused;

            // Trigger Transition
            if (timeLeft <= transitionTimeSec && hasNextVideo && incomingVideo.paused && !incomingVideo.ended) {
                // Load and play next video
                try {
                    await loadVideo(incomingVideo, videoUrls[currentIndex + 1]);
                    
                    // Audio Crossfade
                    const now = audioContext!.currentTime;
                    // Cancel any scheduled changes to avoid conflicts
                    activeGain.gain.cancelScheduledValues(now);
                    incomingGain.gain.cancelScheduledValues(now);
                    
                    // Start fade out/in
                    activeGain.gain.setValueAtTime(1, now);
                    activeGain.gain.linearRampToValueAtTime(0, now + transitionTimeSec);
                    
                    incomingGain.gain.setValueAtTime(0, now);
                    incomingGain.gain.linearRampToValueAtTime(1, now + transitionTimeSec);
                    
                    await incomingVideo.play();
                } catch (err) {
                    console.error("Error starting transition", err);
                }
            }

            // 3. Handle Transition Visuals (Overlay)
            if (isTransitioning) {
                // Calculate alpha based on time progress relative to transition duration
                const progress = incomingVideo.currentTime / transitionTimeSec;
                const alpha = Math.max(0, Math.min(progress, 1)); // Clamp between 0 and 1
                
                ctx.globalAlpha = alpha;
                ctx.drawImage(incomingVideo, 0, 0, canvas.width, canvas.height);
                ctx.globalAlpha = 1; // Reset
            }

            // 4. Handle Video End / Swap
            if (activeVideo.ended) {
                if (hasNextVideo) {
                    // Swap roles
                    const tempVideo = activeVideo;
                    activeVideo = incomingVideo;
                    incomingVideo = tempVideo; // Old active becomes next incoming
                    
                    const tempGain = activeGain;
                    activeGain = incomingGain;
                    incomingGain = tempGain;

                    currentIndex++;
                    
                    // Pause/Reset the finished video to prepare for next load
                    incomingVideo.pause();
                    incomingVideo.currentTime = 0;
                    
                    // Ensure audio levels are completely solidified after swap
                    activeGain.gain.setValueAtTime(1, audioContext!.currentTime);
                    incomingGain.gain.setValueAtTime(0, audioContext!.currentTime);
                    
                    requestAnimationFrame(render);
                } else {
                    // Sequence Finished
                    // Wait a tiny bit to ensure last frame is recorded
                    setTimeout(() => {
                         recorder.stop();
                    }, 100);
                }
            } else {
                requestAnimationFrame(render);
            }
        };

        requestAnimationFrame(render);

    } catch (e) {
        console.error(e);
        setError(e instanceof Error ? e.message : "Falha ao unir os vídeos.");
        setIsMerging(false);
        audioContext?.close();
    }
  }, [videos]);
  
  useEffect(() => {
    const allDone = videos.length > 0 && videos.every(v => v.status === 'done');
    if (allDone && !isGeneratingVideo && !mergedVideoUrl && !isMerging) {
      handleMergeVideos();
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
    setReferenceUrl(TEST_URL);
    setSocialContent(null);
  };

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
                        <p className="mb-8 text-gray-300 text-lg leading-relaxed">
                            Desbloqueie o poder da geração de vídeo Veo. Selecione sua chave de API para acessar o estúdio criativo.
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
      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}
      <Header credits={credits} onReset={handleReset} onSave={handleSaveProject} onLoad={handleLoadProject} canLoad={canLoadProject} />
      <main className="container mx-auto p-4 md:p-8 relative z-10">
        {error && (
          <div className="animate-fade-in-up bg-red-900/80 border border-red-500/50 text-white px-6 py-4 rounded-xl relative mb-6 backdrop-blur-md shadow-lg" role="alert">
            <div className="flex items-center">
                <span className="text-2xl mr-3">⚠️</span>
                <div>
                    <strong className="font-bold block">Erro no Processamento</strong>
                    <span className="block sm:inline text-sm opacity-90">{error}</span>
                </div>
            </div>
            <button className="absolute top-4 right-4 text-red-300 hover:text-white" onClick={() => setError(null)}>
              <svg className="h-5 w-5" role="button" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor"><path d="M14.348 14.849a1.2 1.2 0 0 1-1.697 0L10 11.819l-2.651 3.029a1.2 1.2 0 1 1-1.697-1.697l2.758-3.15-2.759-3.152a1.2 1.2 0 1 1 1.697-1.697L10 8.183l2.651-3.031a1.2 1.2 0 1 1 1.697 1.697l-2.758 3.152 2.758 3.15a1.2 1.2 0 0 1 0 1.698z"/></svg>
            </button>
          </div>
        )}

        {!script ? (
          <ScriptGenerator
            // Influencer Props
            influencerImageFile={influencerImageFile}
            setInfluencerImageFile={setInfluencerImageFile}
            onAnalyzeInfluencer={handleAnalyzeInfluencer}
            isAnalyzingInfluencer={isAnalyzingInfluencer}
            characterDescription={characterDescription}
            
            // Campaign Props
            topic={topic}
            setTopic={setTopic}
            productImageFile={productImageFile}
            setProductImageFile={setProductImageFile}
            logoImageFile={logoImageFile}
            setLogoImageFile={setLogoImageFile}
            onGenerateBriefing={handleAutoGenerateBriefing}
            isGeneratingBriefing={isGeneratingBriefing}
            
            // Reference URL
            referenceUrl={referenceUrl}
            setReferenceUrl={setReferenceUrl}

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
              isGenerating={isGeneratingVideo}
              isMerging={isMerging}
              mergedVideoUrl={mergedVideoUrl}
              totalCost={MAX_CHUNKS * VIDEO_CHUNK_GENERATION_COST}
              videoStyle={videoStyle}
              setVideoStyle={setVideoStyle}
              aspectRatio={aspectRatio}
              setAspectRatio={setAspectRatio}
              socialContent={socialContent}
            />
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
