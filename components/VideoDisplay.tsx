import React, { useState } from 'react';
import { VideoChunk, VideoStyle, AspectRatio, SocialContentGenerated } from '../types';
import { VIDEO_CHUNK_GENERATION_COST } from '../constants';
import { Loader } from './Loader';
import { VideoIcon, DownloadIcon, StyleIcon, CheckIcon, ShareNetworkIcon } from './Icons';

interface VideoDisplayProps {
  videos: VideoChunk[];
  onGenerate: () => void;
  onRetryFailed: () => void;
  isGenerating: boolean;
  isMerging: boolean;
  mergeStage: string;
  mergedVideoUrl: string | null;
  mergedVideoExtension: string;
  totalCost: number;
  videoStyle: VideoStyle;
  setVideoStyle: (style: VideoStyle) => void;
  aspectRatio: AspectRatio;
  setAspectRatio: (ratio: AspectRatio) => void;
  useCharacterReference: boolean;
  setUseCharacterReference: (enabled: boolean) => void;
  hasInfluencerImage: boolean;
  socialContent: SocialContentGenerated | null;
}

/** Stages emitted by the render pipeline, in the order they occur. */
const RENDER_STAGES = [
    "Na fila",
    "Escrevendo prompt de direção",
    "Enviando cena para o Veo",
    "Renderizando",
    "Baixando clipe",
];

const GenerationProgressTracker: React.FC<{ stage?: string }> = ({ stage }) => {
    const steps = RENDER_STAGES;
    // Reflects the actual pipeline stage rather than a timer-driven guess.
    const matchedIndex = stage ? steps.indexOf(stage) : -1;
    const currentStep = matchedIndex >= 0 ? matchedIndex : 0;

    return (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-black/80 backdrop-blur-md z-20 p-6 rounded-2xl">
            <div className="w-full max-w-xs font-mono text-xs">
                <div className="flex items-center justify-between border-b border-gray-800 pb-2 mb-4">
                    <span className="text-cyan-400 animate-pulse">&gt;&gt; SYSTEM_PROCESSING</span>
                    <Loader />
                </div>
                <ul className="space-y-4">
                    {steps.map((step, index) => (
                        <li key={step} className={`flex items-center justify-between transition-all duration-500 ${currentStep >= index ? (currentStep === index ? 'text-white scale-105 font-bold' : 'text-cyan-500/70') : 'text-gray-700 blur-[1px]'}`}>
                            <span className="tracking-wider">{`[${currentStep > index ? 'OK' : currentStep === index ? '..' : '  '}] ${step}`}</span>
                            {currentStep > index && <CheckIcon className="h-3 w-3 text-cyan-400 shadow-[0_0_10px_rgba(34,211,238,0.8)]" />}
                        </li>
                    ))}
                </ul>
                <div className="mt-6 h-1 w-full bg-gray-800 rounded-full overflow-hidden relative">
                     <div
                        className="absolute top-0 left-0 h-full bg-cyan-500 shadow-[0_0_10px_#06b6d4] transition-[width] duration-700 ease-out"
                        style={{ width: `${((currentStep + 1) / steps.length) * 100}%` }}
                     ></div>
                </div>
                {matchedIndex < 0 && stage && (
                    <p className="mt-3 text-[10px] text-cyan-300/80 tracking-wider">{stage}</p>
                )}
            </div>
        </div>
    );
};


const VideoChunkCard: React.FC<{ chunk: VideoChunk, index: number, aspectRatio: AspectRatio }> = ({ chunk, index, aspectRatio }) => {
  const aspectRatioClass = aspectRatio === '16:9' ? 'aspect-video' : 'aspect-[9/16]';

  return (
    <div className={`group relative bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden ${aspectRatioClass} transition-all duration-300 hover:border-cyan-500/50 hover:shadow-[0_0_30px_rgba(6,182,212,0.15)] hover:-translate-y-1`}>
      <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-cyan-500 to-transparent opacity-0 group-hover:opacity-100 transition-opacity"></div>
      
      <div className="absolute top-3 left-3 bg-black/70 backdrop-blur border border-white/10 text-white text-[10px] font-bold uppercase px-3 py-1 rounded-lg z-10 tracking-widest">
        Cena 0{index + 1}
      </div>
      
      <div className="w-full h-full flex items-center justify-center bg-[url('https://www.transparenttextures.com/patterns/carbon-fibre.png')]">
        {chunk.status === 'pending' && (
            <div className="text-center opacity-50 group-hover:opacity-100 transition-opacity">
                 <div className="w-16 h-16 rounded-full bg-gray-800 border border-gray-700 flex items-center justify-center mx-auto mb-3 group-hover:scale-110 transition-transform duration-300 shadow-lg">
                     <VideoIcon />
                 </div>
                 <p className="text-[10px] text-gray-400 font-mono uppercase tracking-widest">Aguardando Renderização</p>
            </div>
        )}
        
        {chunk.status === 'generating' && <GenerationProgressTracker stage={chunk.progressMessage} />}

        {chunk.status === 'done' && chunk.videoUrl && (
           <video controls src={chunk.videoUrl} className="w-full h-full object-cover"></video>
        )}

        {chunk.status === 'error' && (
            <div className="text-center text-red-400 p-4 bg-red-900/20 backdrop-blur w-full h-full flex flex-col items-center justify-center border-2 border-red-500/20">
                <span className="text-3xl mb-3 drop-shadow-lg">⚠️</span>
                <span className="text-xs font-bold uppercase tracking-widest">Falha na Renderização</span>
                {/* Surface the actual reason instead of a generic "system failure". */}
                <span className="text-[10px] mt-2 opacity-80 leading-relaxed line-clamp-4">
                    {chunk.errorMessage ?? 'Tente gerar novamente'}
                </span>
            </div>
        )}
      </div>
    </div>
  );
};

const FinalVideoPlayer: React.FC<{ url: string, aspectRatio: AspectRatio, extension: string }> = ({ url, aspectRatio, extension }) => {
    const aspectRatioClass = aspectRatio === '16:9' ? 'aspect-video' : 'aspect-[9/16]';
    return (
        <div className="flex flex-col items-center animate-fade-in-up w-full">
            <div className={`relative w-full max-w-lg rounded-2xl overflow-hidden shadow-[0_0_50px_rgba(6,182,212,0.2)] border border-cyan-500/40 bg-black ${aspectRatioClass}`}>
                <video controls autoPlay src={url} className="w-full h-full object-cover"></video>
            </div>
            <a 
                href={url} 
                download={`campanha_ugc_ia.${extension}`}
                className="mt-8 group relative inline-flex items-center justify-center px-10 py-4 font-bold text-white transition-all duration-200 bg-cyan-600 rounded-full focus:outline-none hover:bg-cyan-500 hover:scale-105 hover:shadow-[0_0_30px_rgba(34,211,238,0.6)] overflow-hidden"
            >
                <span className="absolute inset-0 w-full h-full -mt-1 rounded-lg opacity-30 bg-gradient-to-b from-transparent via-transparent to-white/20"></span>
                <DownloadIcon />
                <span className="ml-3 uppercase tracking-wider text-sm">Baixar Resultado Final</span>
            </a>
        </div>
    );
}

const MergingLoader: React.FC<{ stage?: string }> = ({ stage }) => (
    <div className="flex flex-col items-center justify-center space-y-6 my-12 h-64 bg-black/30 rounded-3xl border border-cyan-500/20 backdrop-blur-md relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-b from-cyan-500/5 to-transparent animate-pulse"></div>
        <div className="relative w-24 h-24">
             <div className="absolute inset-0 rounded-full border-4 border-gray-800"></div>
             <div className="absolute inset-0 rounded-full border-4 border-t-cyan-500 border-r-cyan-500/30 border-l-transparent border-b-transparent animate-spin"></div>
             <div className="absolute inset-0 rounded-full border-4 border-b-violet-500 border-l-violet-500/30 border-r-transparent border-t-transparent animate-spin-slow"></div>
             <div className="absolute inset-0 flex items-center justify-center">
                 <div className="w-3 h-3 bg-cyan-400 rounded-full shadow-[0_0_15px_#22d3ee] animate-pulse"></div>
             </div>
        </div>
        <div className="text-center relative z-10">
            <p className="text-cyan-400 font-bold tracking-[0.2em] text-sm uppercase animate-pulse">Masterizando Vídeo</p>
            <p className="text-[10px] text-gray-400 mt-2 font-mono bg-black/40 px-3 py-1 rounded-full inline-block border border-white/5">
                {stage || 'Unindo Clipes • Normalizando Áudio'}
            </p>
        </div>
    </div>
);

const StyleSelector: React.FC<{
    selectedStyle: VideoStyle;
    onSelectStyle: (style: VideoStyle) => void;
    disabled: boolean;
}> = ({ selectedStyle, onSelectStyle, disabled }) => {
    const styles: { id: VideoStyle; name: string }[] = [
        { id: 'cinematic', name: 'Cinematic' },
        { id: 'animation', name: '3D Animation' },
        { id: 'documentary', name: 'Realism' },
        { id: 'vlog', name: 'UGC Vlog' },
    ];

    return (
        <div className="mb-6">
            <h4 className="flex items-center text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">
                <StyleIcon />
                <span className="ml-2">Estilo Visual</span>
            </h4>
            <div className="grid grid-cols-2 gap-3">
                {styles.map((style) => (
                    <button
                        key={style.id}
                        onClick={() => onSelectStyle(style.id)}
                        disabled={disabled}
                        className={`px-4 py-3 text-xs font-bold uppercase rounded-xl transition-all duration-200 border ${
                            selectedStyle === style.id
                                ? 'bg-cyan-500/10 border-cyan-500 text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.15)]'
                                : 'bg-gray-800/40 border-gray-700 text-gray-500 hover:border-gray-500 hover:text-gray-300'
                        } disabled:opacity-50`}
                    >
                        {style.name}
                    </button>
                ))}
            </div>
        </div>
    );
};

const AspectRatioSelector: React.FC<{
    selectedRatio: AspectRatio;
    onSelectRatio: (ratio: AspectRatio) => void;
    disabled: boolean;
}> = ({ selectedRatio, onSelectRatio, disabled }) => {
    const ratios: { id: AspectRatio; name: string }[] = [
        { id: '16:9', name: 'Horizontal (16:9)' },
        { id: '9:16', name: 'Vertical (9:16)' },
    ];

    return (
        <div className="mb-6">
            <h4 className="flex items-center text-xs font-bold text-gray-400 uppercase tracking-widest mb-4">
                <span className="ml-2">Formato</span>
            </h4>
            <div className="grid grid-cols-2 gap-3">
                {ratios.map((ratio) => (
                    <button
                        key={ratio.id}
                        onClick={() => onSelectRatio(ratio.id)}
                        disabled={disabled}
                        className={`px-4 py-3 text-xs font-bold uppercase rounded-xl transition-all duration-200 border ${
                            selectedRatio === ratio.id
                                ? 'bg-cyan-500/10 border-cyan-500 text-cyan-400 shadow-[0_0_15px_rgba(6,182,212,0.15)]'
                                : 'bg-gray-800/40 border-gray-700 text-gray-500 hover:border-gray-500 hover:text-gray-300'
                        } disabled:opacity-50`}
                    >
                        {ratio.name}
                    </button>
                ))}
            </div>
        </div>
    );
};

/**
 * Sends the influencer's own photo to Veo as an asset reference, which is what
 * keeps her face from drifting between scenes. Not every model tier accepts it,
 * so the renderer silently falls back to a text-only prompt when rejected.
 */
const CharacterReferenceToggle: React.FC<{
    enabled: boolean;
    onToggle: (enabled: boolean) => void;
    hasInfluencerImage: boolean;
    disabled: boolean;
}> = ({ enabled, onToggle, hasInfluencerImage, disabled }) => {
    const isOn = enabled && hasInfluencerImage;

    return (
        <div className="mb-6 flex items-start justify-between gap-4 bg-black/20 border border-white/5 rounded-xl p-4">
            <div>
                <h4 className="text-xs font-bold text-gray-300 uppercase tracking-widest">Consistência de Personagem</h4>
                <p className="text-[11px] text-gray-500 mt-1 leading-relaxed max-w-sm">
                    {hasInfluencerImage
                        ? 'Envia a foto da influencer como referência visual em cada cena, reduzindo variações de rosto e roupa.'
                        : 'Envie uma foto da influencer para habilitar a referência visual.'}
                </p>
            </div>
            <button
                type="button"
                role="switch"
                aria-checked={isOn}
                aria-label="Consistência de personagem"
                onClick={() => onToggle(!enabled)}
                disabled={disabled || !hasInfluencerImage}
                className={`shrink-0 mt-1 w-12 h-6 rounded-full border transition-colors relative disabled:opacity-40 disabled:cursor-not-allowed ${
                    isOn ? 'bg-cyan-500/30 border-cyan-500' : 'bg-gray-800 border-gray-700'
                }`}
            >
                <span
                    className={`absolute top-1/2 -translate-y-1/2 w-4 h-4 rounded-full transition-all ${
                        isOn ? 'left-6 bg-cyan-400 shadow-[0_0_10px_#22d3ee]' : 'left-1 bg-gray-500'
                    }`}
                />
            </button>
        </div>
    );
};

const SocialContentDisplay: React.FC<{ content: SocialContentGenerated }> = ({ content }) => {
  const [activeTab, setActiveTab] = useState<'instagram' | 'tiktok' | 'youtube'>('instagram');

  const socialPlatforms = [
    { id: 'instagram', name: 'Instagram'},
    { id: 'tiktok', name: 'TikTok'},
    { id: 'youtube', name: 'YouTube'}
  ];

  const activeContent = content[activeTab];

  return (
    <div className="mt-12 animate-fade-in-up w-full max-w-lg mx-auto">
      <h3 className="text-xl font-bold text-white mb-6 text-center flex items-center justify-center">
        <ShareNetworkIcon />
        <span className="ml-3">Conteúdo para Redes Sociais</span>
      </h3>
      <div className="flex justify-center mb-4 rounded-xl bg-gray-900/50 p-1 border border-white/10 w-max mx-auto">
        {socialPlatforms.map(platform => (
          <button 
            key={platform.id}
            onClick={() => setActiveTab(platform.id as any)}
            className={`px-5 py-2 text-xs font-bold rounded-lg transition-colors ${activeTab === platform.id ? 'bg-violet-600 text-white shadow-lg' : 'text-gray-400 hover:bg-gray-800/50 hover:text-white'}`}
          >
            {platform.name}
          </button>
        ))}
      </div>
      <div className="bg-black/20 p-6 rounded-2xl border border-white/5">
        {activeContent.title && <h4 className="font-bold text-white mb-2 text-lg">{activeContent.title}</h4>}
        <p className="text-gray-300 text-sm whitespace-pre-wrap mb-4 leading-relaxed">{activeContent.caption}</p>
        <div className="flex flex-wrap gap-2 mb-6">
          {activeContent.hashtags.map(tag => (
            <span key={tag} className="px-3 py-1 bg-cyan-500/10 text-cyan-400 text-xs font-bold rounded-full">#{tag}</span>
          ))}
        </div>
        <div className="bg-gray-900/50 p-4 rounded-xl border border-gray-700">
          <p className="text-xs text-violet-300 font-bold mb-1 uppercase tracking-wider">Dica de Estratégia:</p>
          <p className="text-xs text-gray-400 italic">{activeContent.strategyTip}</p>
        </div>
      </div>
    </div>
  );
};

const VideoDisplay: React.FC<VideoDisplayProps> = ({
  videos, onGenerate, onRetryFailed, isGenerating, isMerging, mergeStage,
  mergedVideoUrl, mergedVideoExtension, totalCost, videoStyle, setVideoStyle,
  aspectRatio, setAspectRatio, useCharacterReference, setUseCharacterReference,
  hasInfluencerImage, socialContent,
}) => {
  const [isConfirming, setIsConfirming] = useState(false);
  const allVideosDone = videos.length > 0 && videos.every(v => v.status === 'done');
  const failedCount = videos.filter(v => v.status === 'error').length;
  const retryCost = failedCount * VIDEO_CHUNK_GENERATION_COST;

  return (
    <div className="glass-panel p-8 rounded-3xl border border-white/10 flex flex-col h-full animate-fade-in-up shadow-2xl" style={{animationDelay: '0.1s'}}>
      <div className="flex justify-between items-end mb-8 border-b border-white/5 pb-6">
         <div>
             <div className="inline-block mb-2 px-3 py-1 rounded bg-violet-500/10 border border-violet-500/30 text-violet-400 text-[10px] font-bold uppercase tracking-widest">
                Fase 2: Produção
             </div>
             <h2 className="text-3xl font-black text-white tracking-tight">Renderização Veo</h2>
         </div>
         <div className="text-right">
            <div className="text-[10px] font-mono text-gray-500 uppercase tracking-wider">Status do Sistema</div>
            <div className="flex items-center justify-end mt-1 space-x-2">
                <div className={`w-2 h-2 rounded-full ${isGenerating || isMerging ? 'bg-yellow-400 animate-ping' : 'bg-green-500'}`}></div>
                <span className="text-xs font-bold text-gray-300">{isGenerating ? 'PROCESSANDO' : isMerging ? 'UNINDO' : 'PRONTO'}</span>
            </div>
         </div>
      </div>
      
      <div className={`grid ${aspectRatio === '16:9' ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-2 sm:grid-cols-3'} gap-6 flex-grow mb-8 overflow-y-auto max-h-[600px] pr-2 custom-scrollbar`}>
        {videos.map((video, index) => (
          <VideoChunkCard key={video.id} chunk={video} index={index} aspectRatio={aspectRatio} />
        ))}
      </div>
      
      <div className="bg-gray-900/60 p-6 rounded-2xl border border-white/5 mt-auto backdrop-blur-xl relative overflow-hidden">
        {mergedVideoUrl ? (
            <>
              <FinalVideoPlayer url={mergedVideoUrl} aspectRatio={aspectRatio} extension={mergedVideoExtension} />
              {socialContent && <SocialContentDisplay content={socialContent} />}
            </>
        ) : isMerging ? (
            <MergingLoader stage={mergeStage} />
        ) : (
            <>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8">
                    <StyleSelector
                        selectedStyle={videoStyle}
                        onSelectStyle={setVideoStyle}
                        disabled={isGenerating || allVideosDone || isConfirming}
                    />
                    <AspectRatioSelector
                        selectedRatio={aspectRatio}
                        onSelectRatio={setAspectRatio}
                        disabled={isGenerating || allVideosDone || isConfirming}
                    />
                </div>

                <CharacterReferenceToggle
                    enabled={useCharacterReference}
                    onToggle={setUseCharacterReference}
                    hasInfluencerImage={hasInfluencerImage}
                    disabled={isGenerating || allVideosDone || isConfirming}
                />

                {failedCount > 0 && !isGenerating && (
                    <button
                        onClick={onRetryFailed}
                        className="w-full mb-4 py-4 rounded-xl font-bold text-white bg-gradient-to-r from-amber-600 to-orange-600 hover:shadow-[0_0_20px_rgba(217,119,6,0.4)] transition-all hover:-translate-y-0.5 uppercase tracking-wider text-sm"
                    >
                        Tentar novamente {failedCount} cena{failedCount > 1 ? 's' : ''} ({retryCost} créditos)
                    </button>
                )}
                {isConfirming ? (
                  <div className="text-center p-6 bg-black/40 rounded-2xl border border-cyan-500/30 animate-fade-in-up shadow-2xl">
                      <h4 className="text-white font-bold text-lg mb-2">Confirmar Produção?</h4>
                      <p className="mb-6 text-gray-400 text-sm">Esta ação consumirá <span className="text-cyan-400 font-bold text-lg font-mono mx-1">{totalCost}</span> créditos da sua conta.</p>
                      <div className="flex justify-center gap-4">
                          <button
                              onClick={() => setIsConfirming(false)}
                              className="px-6 py-3 rounded-xl text-sm font-bold text-gray-400 hover:bg-gray-800 hover:text-white transition-colors"
                          >
                              Cancelar
                          </button>
                          <button
                              onClick={() => {
                                  onGenerate();
                                  setIsConfirming(false);
                              }}
                              className="px-8 py-3 rounded-xl text-sm font-bold text-white bg-gradient-to-r from-cyan-600 to-cyan-500 hover:shadow-[0_0_20px_rgba(6,182,212,0.4)] transition-all hover:-translate-y-0.5"
                          >
                              Confirmar
                          </button>
                      </div>
                  </div>
                ) : (
                    <button
                    onClick={() => setIsConfirming(true)}
                    disabled={isGenerating || allVideosDone}
                    className={`w-full flex items-center justify-center space-x-3 py-5 rounded-xl font-bold text-white transition-all duration-300 group relative overflow-hidden
                        ${isGenerating || allVideosDone ? 'bg-gray-800 cursor-not-allowed opacity-60' : 'bg-gradient-to-r from-cyan-600 via-blue-600 to-violet-600 hover:scale-[1.02] shadow-xl'}
                    `}
                    >
                    <div className="absolute inset-0 bg-white/10 opacity-0 group-hover:opacity-100 transition-opacity"></div>
                    {isGenerating ? (
                        <>
                        <Loader />
                        <span className="animate-pulse">Renderizando Cenas...</span>
                        </>
                    ) : allVideosDone ? (
                        <span>Produção Concluída</span>
                    ) : (
                        <>
                        <VideoIcon />
                        <span className="uppercase tracking-wider">Iniciar Renderização ({totalCost} Créditos)</span>
                        </>
                    )}
                    </button>
                )}
            </>
        )}
      </div>
    </div>
  );
};

export default VideoDisplay;