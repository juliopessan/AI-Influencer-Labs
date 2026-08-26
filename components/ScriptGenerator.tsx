
import React, { useState, useEffect } from 'react';
import { SCRIPT_GENERATION_COST } from '../constants';
import { Loader } from './Loader';
import { MagicWandIcon, BrainCircuitIcon, UploadIcon, UserIcon, DownloadIcon, LinkIcon } from './Icons';
import { ScriptMode } from '../types';
import { jsPDF } from 'jspdf';
import html2canvas from 'html2canvas';

interface ScriptGeneratorProps {
  // Influencer Step
  influencerImageFile: File | null;
  setInfluencerImageFile: (file: File | null) => void;
  onAnalyzeInfluencer: (file: File) => void;
  isAnalyzingInfluencer: boolean;
  characterDescription: string | null;

  // Campaign Step
  topic: string;
  setTopic: (topic: string) => void;
  productImageFile: File | null;
  setProductImageFile: (file: File | null) => void;
  logoImageFile: File | null;
  setLogoImageFile: (file: File | null) => void;
  onGenerateBriefing: () => void;
  isGeneratingBriefing: boolean;

  // Reference URL Step
  referenceUrl: string;
  setReferenceUrl: (url: string) => void;

  onGenerate: () => void;
  isLoading: boolean;
  scriptMode: ScriptMode;
  setScriptMode: (mode: ScriptMode) => void;
}

const ScriptModeSelector: React.FC<{
    selectedMode: ScriptMode;
    onSelectMode: (mode: ScriptMode) => void;
    disabled: boolean;
}> = ({ selectedMode, onSelectMode, disabled }) => {
    const modes = [
        { id: 'fast', name: 'Speed Run', description: 'Rápido. Para testes.', icon: <MagicWandIcon />, color: 'from-emerald-500/20 to-emerald-900/20', border: 'border-emerald-500/50', text: 'text-emerald-400' },
        { id: 'balanced', name: 'Balanced', description: 'Qualidade padrão.', icon: <MagicWandIcon />, color: 'from-cyan-500/20 to-cyan-900/20', border: 'border-cyan-500/50', text: 'text-cyan-400' },
        { id: 'complex', name: 'Creative Pro', description: 'IA profunda. Raciocínio.', icon: <BrainCircuitIcon />, color: 'from-violet-500/20 to-violet-900/20', border: 'border-violet-500/50', text: 'text-violet-400' }
    ] as const;

    return (
        <div className="my-8 animate-fade-in-up" style={{animationDelay: '0.2s'}}>
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-[0.1em] mb-4 flex items-center">
                <span className="w-8 h-[1px] bg-gray-700 mr-2"></span>
                Agente Roteirista (ScriptWriter)
                <span className="w-full h-[1px] bg-gray-700 ml-2"></span>
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {modes.map((mode) => {
                    const isSelected = selectedMode === mode.id;
                    return (
                        <button
                            key={mode.id}
                            onClick={() => onSelectMode(mode.id)}
                            disabled={disabled}
                            className={`relative p-4 text-left rounded-2xl transition-all duration-300 group overflow-hidden border
                            ${isSelected 
                                ? `bg-gradient-to-br ${mode.color} ${mode.border} shadow-[0_0_20px_rgba(0,0,0,0.3)] transform -translate-y-1` 
                                : 'bg-gray-900/40 border-gray-800 hover:border-gray-600 hover:bg-gray-800/60'
                            } disabled:opacity-50 disabled:cursor-not-allowed disabled:transform-none`}
                        >
                             {isSelected && <div className="absolute inset-0 bg-white/5 mix-blend-overlay"></div>}
                            <div className={`flex items-center mb-2 ${isSelected ? mode.text : 'text-gray-500 group-hover:text-gray-300'}`}>
                                {React.cloneElement(mode.icon, { className: 'h-5 w-5 mr-2' })}
                                <span className="font-bold text-md">{mode.name}</span>
                            </div>
                            <p className="text-xs text-gray-400 leading-relaxed">{mode.description}</p>
                            
                            {isSelected && (
                                <div className={`absolute bottom-0 left-0 h-1 bg-current w-full ${mode.text} opacity-50`}></div>
                            )}
                        </button>
                    );
                })}
            </div>
        </div>
    );
};

const ScriptGenerator: React.FC<ScriptGeneratorProps> = ({ 
    influencerImageFile, setInfluencerImageFile, onAnalyzeInfluencer, isAnalyzingInfluencer, characterDescription,
    topic, setTopic, 
    productImageFile, setProductImageFile,
    logoImageFile, setLogoImageFile,
    onGenerateBriefing, isGeneratingBriefing,
    referenceUrl, setReferenceUrl,
    onGenerate, isLoading, 
    scriptMode, setScriptMode 
}) => {
  const [productPreview, setProductPreview] = useState<string | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [influencerPreview, setInfluencerPreview] = useState<string | null>(null);
  const [isCheckingUrl, setIsCheckingUrl] = useState(false);
  const [urlValid, setUrlValid] = useState(false);
  const [styleAnalysis, setStyleAnalysis] = useState<string>('');

  const handleImageChange = (
      e: React.ChangeEvent<HTMLInputElement>,
      setImageFile: (file: File | null) => void,
      setPreview: (preview: string | null) => void,
      callback?: (file: File) => void
  ) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      if (file.size > 4 * 1024 * 1024) { 
        alert("Arquivo muito grande. Máximo 4MB.");
        e.target.value = ''; 
        return;
      }
      setImageFile(file);
      const reader = new FileReader();
      reader.onloadend = () => {
        setPreview(reader.result as string);
        if (callback) callback(file);
      };
      reader.readAsDataURL(file);
    } else {
      setImageFile(null);
      setPreview(null);
    }
  };
  
  useEffect(() => {
    if (productImageFile && !productPreview) {
        const reader = new FileReader();
        reader.onloadend = () => setProductPreview(reader.result as string);
        reader.readAsDataURL(productImageFile);
    }
    if (logoImageFile && !logoPreview) {
        const reader = new FileReader();
        reader.onloadend = () => setLogoPreview(reader.result as string);
        reader.readAsDataURL(logoImageFile);
    }
    if (influencerImageFile && !influencerPreview) {
        const reader = new FileReader();
        reader.onloadend = () => setInfluencerPreview(reader.result as string);
        reader.readAsDataURL(influencerImageFile);
    }
  }, [productImageFile, logoImageFile, influencerImageFile, productPreview, logoPreview, influencerPreview]);

  // Helper to parse Markdown to semantic HTML string with inline styles
  const formatMarkdownToHTML = (text: string) => {
    if (!text) return '';
    return text
        .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
        .replace(/\*\*(.*?)\*\*/g, '<strong style="color: #000000; font-weight: 700;">$1</strong>')
        .replace(/\*(.*?)\*/g, '<em style="color: #475569;">$1</em>')
        // Fix Lists
        .replace(/^[\*\-]\s+(.*)$/gm, '<div style="margin-left: 15px; margin-bottom: 6px; display: flex; align-items: flex-start;"><span style="color: #00a1e0; margin-right: 8px; font-weight: bold; font-size: 14px;">•</span><span style="flex: 1; color: #444444; line-height: 1.5;">$1</span></div>')
        // Headers
        .replace(/^##\s+(.*)$/gm, '<h3 style="font-size: 14px; font-weight: 700; color: #1a1f36; margin-top: 15px; margin-bottom: 8px; border-left: 3px solid #00a1e0; padding-left: 8px;">$1</h3>')
        .replace(/^###\s+(.*)$/gm, '<h4 style="font-size: 12px; font-weight: 600; color: #334155; margin-top: 10px; margin-bottom: 5px;">$1</h4>')
        .replace(/\n\n/g, '<div style="height: 10px;"></div>')
        .replace(/\n/g, '<br/>');
  };

  const handleDownloadPDF = async () => {
    if (!topic) return;
    
    if (typeof window !== 'undefined' && !(window as any).html2canvas) {
        (window as any).html2canvas = html2canvas;
    }

    try {
        const doc = new jsPDF('p', 'pt', 'a4');
        const pdfWidth = 595.28;
        const pdfHeight = 841.89; // A4 height points
        const date = new Date().toLocaleDateString('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });

        const tempContainer = document.createElement('div');
        tempContainer.id = 'pdf-generator-container';
        
        // Setup Container (Matches A4 aspect ratio 1:1)
        tempContainer.style.width = '595px'; 
        tempContainer.style.position = 'fixed';
        tempContainer.style.top = '0';
        tempContainer.style.left = '-9999px';
        tempContainer.style.backgroundColor = '#ffffff';
        tempContainer.style.fontFamily = '"Helvetica Neue", Helvetica, Arial, sans-serif';
        tempContainer.style.boxSizing = 'border-box';
        
        // Brand Colors
        const brandBlue = '#00a1e0'; // Salesforce-like Cyan
        const brandDark = '#1a1f36'; // Navy
        const brandGradient = 'linear-gradient(135deg, #090947 0%, #1a237e 100%)';

        // Styles
        const pageContainerStyle = "width: 595px; min-height: 842px; position: relative; overflow: hidden; background: white;";
        const coverPageStyle = `width: 595px; height: 842px; background: ${brandGradient}; color: white; position: relative; display: flex; flex-direction: column; justify-content: center; padding: 60px; box-sizing: border-box;`;
        const contentPageStyle = "width: 595px; min-height: 842px; background: white; padding: 50px; padding-top: 40px; box-sizing: border-box; position: relative;";
        
        const h1TitleStyle = "font-size: 42px; font-weight: 800; line-height: 1.1; margin-bottom: 20px; color: white;";
        const h2SectionStyle = `font-size: 28px; font-weight: 700; color: ${brandBlue}; margin-bottom: 20px; letter-spacing: -0.5px;`;
        const bodyTextStyle = "font-size: 11px; color: #444; line-height: 1.6; text-align: justify;";
        
        const footerGraphic = `
            <div style="position: absolute; bottom: 0; left: 0; right: 0; height: 60px; pointer-events: none; overflow: hidden;">
                <svg viewBox="0 0 1440 320" preserveAspectRatio="none" style="height: 100%; width: 100%;">
                   <path fill="#f1f5f9" fill-opacity="1" d="M0,224L48,213.3C96,203,192,181,288,181.3C384,181,480,203,576,224C672,245,768,267,864,261.3C960,256,1056,224,1152,197.3C1248,171,1344,149,1392,138.7L1440,128L1440,320L1392,320C1344,320,1248,320,1152,320C1056,320,960,320,864,320C768,320,672,320,576,320C480,320,384,320,288,320C192,320,96,320,48,320L0,320Z"></path>
                </svg>
            </div>
        `;

        tempContainer.innerHTML = `
            <div>
                <!-- PAGE 1: COVER -->
                <div style="${coverPageStyle}">
                    <div style="position: absolute; top: 50px; right: 50px;">
                        ${logoPreview ? `<img src="${logoPreview}" style="height: 40px; background: white; padding: 5px; border-radius: 4px;" />` : `<div style="font-weight: 800; font-size: 20px;">Influencer<span style="color:${brandBlue}">Labs</span></div>`}
                    </div>
                    
                    <div style="margin-bottom: auto; margin-top: 100px;">
                        <h1 style="${h1TitleStyle}">
                            Índice Global de<br/>
                            <span style="color: ${brandBlue}">Preparação Criativa</span><br/>
                            para Campanhas IA
                        </h1>
                        <p style="font-size: 14px; font-weight: 300; margin-top: 20px; opacity: 0.9; max-width: 400px; line-height: 1.5;">
                            Um relatório executivo gerado por Inteligência Artificial para otimizar a criação de conteúdo e maximizar o impacto da marca.
                        </p>
                    </div>

                    <div style="margin-top: 40px; border-top: 1px solid rgba(255,255,255,0.2); padding-top: 20px;">
                         <p style="font-size: 10px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; color: ${brandBlue}; margin-bottom: 5px;">Data do Relatório</p>
                         <p style="font-size: 12px;">${date}</p>
                    </div>

                    <!-- Decorative Circle/Graphic Bottom Right -->
                    <div style="position: absolute; bottom: -50px; right: -50px; width: 250px; height: 250px; background: radial-gradient(circle, ${brandBlue} 0%, transparent 70%); opacity: 0.4; border-radius: 50%;"></div>
                </div>

                <!-- PAGE 2: CONTENT -->
                <div style="${contentPageStyle}">
                    
                    <!-- Header Strip -->
                    <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 2px solid ${brandBlue}; padding-bottom: 15px; margin-bottom: 40px;">
                        <span style="color: ${brandDark}; font-weight: 700; font-size: 14px;">InfluencerLabs AI</span>
                        <span style="color: #94a3b8; font-size: 10px; text-transform: uppercase;">Relatório Executivo</span>
                    </div>

                    <!-- Section: Strategy -->
                    <div style="margin-bottom: 40px;">
                        <h2 style="${h2SectionStyle}">
                            1. Estratégia & Contexto
                        </h2>
                        <div style="${bodyTextStyle} background: #f8fafc; padding: 20px; border-radius: 0 15px 15px 15px; border-left: 4px solid ${brandBlue};">
                            ${formatMarkdownToHTML(topic)}
                        </div>
                    </div>

                    <!-- Section: Persona -->
                    ${characterDescription ? `
                    <div style="margin-bottom: 40px;">
                        <h2 style="${h2SectionStyle}">
                            2. Persona da Influencer
                        </h2>
                        <div style="display: flex; gap: 20px; align-items: flex-start;">
                             ${influencerPreview ? `
                                <div style="flex-shrink: 0; width: 120px; height: 120px; border-radius: 20px; overflow: hidden; box-shadow: 0 10px 20px rgba(0,0,0,0.1);">
                                    <img src="${influencerPreview}" style="width: 100%; height: 100%; object-fit: cover;" />
                                </div>
                             ` : ''}
                             <div style="flex: 1;">
                                <div style="font-size: 16px; font-weight: 700; color: ${brandDark}; margin-bottom: 10px;">Perfil Analítico</div>
                                <div style="${bodyTextStyle} color: #64748b;">
                                    ${characterDescription}
                                </div>
                             </div>
                        </div>
                    </div>
                    ` : ''}

                    <!-- Section: Style & Social -->
                    ${referenceUrl || styleAnalysis ? `
                    <div style="margin-bottom: 40px;">
                        <h2 style="${h2SectionStyle}">
                            3. Referência & Estilo
                        </h2>
                         <div style="background: ${brandDark}; color: white; padding: 25px; border-radius: 15px; position: relative; overflow: hidden;">
                             <div style="position: absolute; top: -10px; right: -10px; width: 60px; height: 60px; background: ${brandBlue}; border-radius: 50%; opacity: 0.2;"></div>
                             
                             ${referenceUrl ? `
                             <div style="margin-bottom: 15px; font-size: 10px; opacity: 0.8;">
                                 <strong style="text-transform: uppercase; color: ${brandBlue};">URL Fonte:</strong><br/>
                                 ${referenceUrl}
                             </div>
                             ` : ''}

                             ${styleAnalysis ? `
                             <div style="font-family: 'Courier New', monospace; font-size: 10px; line-height: 1.5; border-left: 2px solid ${brandBlue}; padding-left: 10px;">
                                 ${styleAnalysis.replace(/\n/g, '<br/>')}
                             </div>
                             ` : ''}
                         </div>
                    </div>
                    ` : ''}

                    ${footerGraphic}
                    
                    <div style="position: absolute; bottom: 20px; right: 50px; font-size: 10px; color: #94a3b8;">
                        Página 02
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(tempContainer);
        await new Promise(resolve => setTimeout(resolve, 800)); // Ensure render

        await doc.html(tempContainer, {
            callback: (doc) => {
                doc.save('InfluencerLabs_Briefing_Executivo.pdf');
                document.body.removeChild(tempContainer);
            },
            x: 0,
            y: 0,
            width: pdfWidth,
            windowWidth: 595,
            autoPaging: 'text',
            html2canvas: {
                scale: 2, // High res text
                useCORS: true,
                logging: false,
                backgroundColor: '#ffffff'
            }
        });

    } catch (error) {
        console.error("Erro ao gerar PDF:", error);
        alert("Erro ao gerar PDF.");
    }
  };

  const handleCheckUrl = () => {
      if(!referenceUrl) return;
      setIsCheckingUrl(true);
      setStyleAnalysis('');
      // Simulation of analysis
      setTimeout(() => {
          setIsCheckingUrl(false);
          setUrlValid(true);
          setStyleAnalysis("ANÁLISE DE TENDÊNCIA VIRAL:\n> Ritmo: Edição dinâmica (Cortes a cada 1.5s)\n> Hook Visual: Transição 'Antes/Depois' nos primeiros 3s\n> Áudio: Trending Audio com narração sobreposta (Voiceover)\n> Elementos: Texto flutuante impactante e legenda colorida.");
      }, 1500);
  }

  return (
    <div className="max-w-5xl mx-auto glass-panel p-8 rounded-3xl animate-fade-in-up border-t border-white/10">
      <div className="text-center mb-10">
        <div className="inline-block mb-4 px-4 py-1 rounded-full bg-cyan-500/10 border border-cyan-500/30 text-cyan-400 text-xs font-bold uppercase tracking-widest">
            Estúdio Criativo
        </div>
        <h2 className="text-4xl md:text-5xl font-black text-white mb-4 tracking-tight">
            Design da Campanha
        </h2>
        <p className="text-gray-400 max-w-xl mx-auto text-lg font-light">Defina sua estrela, seus produtos e deixe a IA criar a mágica.</p>
      </div>
      
      <div className="space-y-12">
        {/* STEP 1: Influencer Identity */}
        <div className="border-b border-white/5 pb-8">
            <div className="flex items-center mb-6">
                <span className="bg-cyan-600 text-white w-8 h-8 rounded-full flex items-center justify-center font-bold mr-3 text-sm shadow-[0_0_10px_rgba(6,182,212,0.4)]">1</span>
                <h3 className="text-xl font-bold text-white">Identidade da Influencer (Agente Casting)</h3>
            </div>
            
            <div className="flex flex-col md:flex-row gap-8 items-start">
                 {/* Influencer Upload */}
                <div className="w-full md:w-1/3 group relative">
                    <div className="absolute -inset-0.5 bg-gradient-to-br from-pink-500 to-rose-600 rounded-2xl opacity-30 group-hover:opacity-100 transition duration-500 blur"></div>
                    <div className={`relative h-64 bg-gray-900 rounded-2xl p-1 overflow-hidden transition-all duration-300 ${influencerPreview ? 'border-pink-500/50' : 'border-gray-800'}`}>
                         <div className="h-full w-full bg-gray-900/80 backdrop-blur-sm rounded-xl overflow-hidden relative flex flex-col">
                             <input type="file" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-30" onChange={(e) => handleImageChange(e, setInfluencerImageFile, setInfluencerPreview, onAnalyzeInfluencer)} accept="image/png, image/jpeg, image/webp" disabled={isLoading || isAnalyzingInfluencer}/>
                             
                             {influencerPreview ? (
                                <img src={influencerPreview} alt="Influencer" className="w-full h-full object-cover" />
                             ) : (
                                <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500 group-hover:text-pink-400 transition-colors">
                                    <div className="p-4 rounded-full bg-gray-800/80 border border-white/5 mb-3 group-hover:scale-110 transition-transform">
                                        <UserIcon />
                                    </div>
                                    <p className="font-medium text-sm">Upload Foto</p>
                                </div>
                             )}
                             
                             {isAnalyzingInfluencer && (
                                 <div className="absolute inset-0 bg-black/80 backdrop-blur-sm flex flex-col items-center justify-center z-40">
                                     <Loader />
                                     <span className="text-pink-400 text-xs font-bold mt-3 animate-pulse">ANALISANDO PERSONA...</span>
                                 </div>
                             )}
                         </div>
                    </div>
                </div>

                {/* Generated Description */}
                <div className="w-full md:w-2/3 relative">
                    <div className="absolute -inset-0.5 bg-gradient-to-r from-gray-800 to-gray-700 rounded-2xl opacity-50 blur-sm"></div>
                    <div className="relative h-64 bg-black/40 p-6 rounded-2xl border border-white/10 flex flex-col">
                         <h4 className="text-xs font-bold text-gray-500 uppercase tracking-widest mb-3 flex items-center justify-between">
                             <span>Perfil Gerado por IA</span>
                             {characterDescription && <span className="text-green-400 flex items-center text-[10px]"><span className="w-2 h-2 bg-green-500 rounded-full mr-1"></span> ATIVO</span>}
                         </h4>
                         {characterDescription ? (
                             <div className="flex-grow overflow-y-auto custom-scrollbar">
                                 <p className="text-gray-300 leading-relaxed font-light italic">"{characterDescription}"</p>
                             </div>
                         ) : (
                             <div className="flex-grow flex items-center justify-center text-gray-600 text-sm italic text-center px-8">
                                 Faça o upload da foto para gerar a persona digital da sua influencer.
                             </div>
                         )}
                    </div>
                </div>
            </div>
        </div>

        {/* STEP 2: Assets & Briefing */}
        <div className="border-b border-white/5 pb-8">
            <div className="flex items-center mb-6">
                <span className="bg-violet-600 text-white w-8 h-8 rounded-full flex items-center justify-center font-bold mr-3 text-sm shadow-[0_0_10px_rgba(124,58,237,0.4)]">2</span>
                <h3 className="text-xl font-bold text-white">Produto & Contexto (Agente Estrategista)</h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mb-8">
                {/* Product Upload */}
                <div className="group relative">
                  <div className="absolute -inset-0.5 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-2xl opacity-30 group-hover:opacity-100 transition duration-500 blur"></div>
                  <div className={`relative h-full bg-gray-900 rounded-2xl p-1 overflow-hidden transition-all duration-300 ${productPreview ? 'border-cyan-500/50' : 'border-gray-800'}`}>
                     <div className="h-full w-full bg-gray-900/80 backdrop-blur-sm rounded-xl overflow-hidden relative aspect-video flex flex-col">
                        <div className="absolute top-4 left-4 z-20 pointer-events-none">
                             <span className="px-2 py-1 bg-black/60 backdrop-blur border border-white/10 rounded text-[10px] font-bold uppercase text-white tracking-wider">
                                Produto Principal *
                             </span>
                        </div>
                        <input type="file" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-30" onChange={(e) => handleImageChange(e, setProductImageFile, setProductPreview)} accept="image/png, image/jpeg, image/webp" disabled={isLoading}/>
                        {productPreview ? (
                            <img src={productPreview} alt="Preview" className="w-full h-full object-cover" />
                        ) : (
                            <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-500 group-hover:text-cyan-400 transition-colors">
                                <div className="p-4 rounded-full bg-gray-800/80 border border-white/5 mb-3 group-hover:scale-110 transition-transform">
                                    <UploadIcon />
                                </div>
                                <p className="font-medium text-sm">Upload Produto</p>
                            </div>
                        )}
                     </div>
                  </div>
                </div>

                {/* Logo Upload */}
                <div className="group relative">
                   <div className="absolute -inset-0.5 bg-gradient-to-r from-violet-500 to-purple-600 rounded-2xl opacity-20 group-hover:opacity-70 transition duration-500 blur"></div>
                   <div className={`relative h-full bg-gray-900 rounded-2xl p-1 overflow-hidden transition-all duration-300`}>
                     <div className="h-full w-full bg-gray-900/80 backdrop-blur-sm rounded-xl overflow-hidden relative aspect-video flex flex-col">
                        <div className="absolute top-4 left-4 z-20 pointer-events-none">
                             <span className="px-2 py-1 bg-black/60 backdrop-blur border border-white/10 rounded text-[10px] font-bold uppercase text-gray-300 tracking-wider">
                                Logo da Marca
                             </span>
                        </div>
                        <input type="file" className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-30" onChange={(e) => handleImageChange(e, setLogoImageFile, setLogoPreview)} accept="image/png, image/jpeg, image/webp" disabled={isLoading}/>
                        {logoPreview ? (
                             <div className="w-full h-full flex items-center justify-center p-8 bg-[radial-gradient(ellipse_at_center,_var(--tw-gradient-stops))] from-gray-800 to-gray-900">
                                <img src={logoPreview} alt="Logo" className="max-w-full max-h-full object-contain drop-shadow-2xl" />
                            </div>
                          ) : (
                            <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-600 group-hover:text-violet-400 transition-colors">
                                 <div className="p-4 rounded-full bg-gray-800/80 border border-white/5 mb-3 group-hover:scale-110 transition-transform">
                                     <UploadIcon />
                                </div>
                                <p className="font-medium text-sm">Upload Logo</p>
                            </div>
                          )}
                      </div>
                  </div>
                </div>
            </div>

            <div className="animate-fade-in-up" style={{animationDelay: '0.1s'}}>
                <div className="flex justify-between items-center mb-3 ml-1">
                    <label htmlFor="instructions" className="text-xs font-bold text-gray-400 uppercase tracking-[0.1em]">
                        Briefing & Contexto
                    </label>
                    <div className="flex gap-2">
                        <button 
                            onClick={handleDownloadPDF}
                            disabled={!topic || isLoading}
                            className="text-[10px] flex items-center bg-gray-800 hover:bg-gray-700 border border-white/10 text-gray-300 px-3 py-1 rounded-full transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                            title="Baixar Briefing em PDF"
                        >
                            <DownloadIcon />
                            <span className="ml-1 font-bold">PDF CLIENTE</span>
                        </button>
                        <button 
                            onClick={onGenerateBriefing}
                            disabled={!productImageFile || isGeneratingBriefing || isLoading}
                            className="text-[10px] flex items-center bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/30 text-cyan-400 px-3 py-1 rounded-full transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isGeneratingBriefing ? (
                                <Loader /> 
                            ) : (
                                <>
                                    <MagicWandIcon />
                                    <span className="ml-1 font-bold">GERAR BRIEFING AUTO</span>
                                </>
                            )}
                        </button>
                    </div>
                </div>
                <div className="relative group">
                    <div className="absolute -inset-0.5 bg-gradient-to-r from-cyan-500 to-violet-500 rounded-xl opacity-0 group-focus-within:opacity-50 transition duration-500 blur"></div>
                    <textarea
                    id="instructions"
                    value={topic}
                    onChange={(e) => setTopic(e.target.value)}
                    placeholder={!productImageFile ? "Faça o upload das imagens acima para gerar o briefing automaticamente..." : "Descreva o produto ou clique em 'Gerar Briefing Auto'..."}
                    className="relative w-full h-32 p-5 glass-input rounded-xl text-gray-200 focus:outline-none transition-all resize-none font-light text-lg placeholder-gray-600"
                    disabled={isLoading || isGeneratingBriefing}
                    />
                </div>
            </div>
        </div>
        
        {/* STEP 3: Style Reference */}
        <div>
            <div className="flex items-center mb-6">
                <span className="bg-fuchsia-500 text-white w-8 h-8 rounded-full flex items-center justify-center font-bold mr-3 text-sm shadow-[0_0_10px_rgba(217,70,239,0.4)]">3</span>
                <h3 className="text-xl font-bold text-white">Referência de Estilo (Agente Diretor)</h3>
            </div>
            
            <div className="bg-gray-900/40 p-6 rounded-2xl border border-white/5 relative overflow-hidden">
                <div className="flex flex-col md:flex-row gap-4">
                    <div className="flex-grow relative group">
                         <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-gray-500">
                            <LinkIcon />
                        </div>
                        <input 
                            type="text" 
                            value={referenceUrl}
                            onChange={(e) => {
                                setReferenceUrl(e.target.value);
                                setUrlValid(false);
                                setStyleAnalysis('');
                            }}
                            placeholder="Cole uma URL do TikTok, Reels ou YouTube Shorts..."
                            className="w-full pl-10 pr-4 py-3 glass-input rounded-xl text-sm text-gray-300 focus:text-white transition-all border-transparent focus:border-fuchsia-500/50"
                        />
                    </div>
                    <button 
                        onClick={handleCheckUrl}
                        disabled={!referenceUrl || isCheckingUrl || urlValid}
                        className={`px-6 py-3 rounded-xl font-bold text-xs uppercase tracking-wider transition-all duration-300 flex items-center justify-center min-w-[140px]
                            ${urlValid 
                                ? 'bg-green-500/20 text-green-400 border border-green-500/50 cursor-default' 
                                : 'bg-fuchsia-600 hover:bg-fuchsia-500 text-white shadow-lg hover:shadow-fuchsia-500/30'
                            } disabled:opacity-50 disabled:cursor-not-allowed`}
                    >
                        {isCheckingUrl ? (
                            <Loader />
                        ) : urlValid ? (
                            <>CONFIRMADO ✓</>
                        ) : (
                            "ANALISAR URL"
                        )}
                    </button>
                </div>
                {urlValid && (
                    <div className="mt-4 animate-fade-in-up">
                         <div className="flex justify-between items-center mb-2 ml-1">
                             <label className="text-[10px] font-bold text-fuchsia-400 uppercase tracking-[0.1em] flex items-center">
                                <span className="w-1 h-3 bg-fuchsia-500 rounded mr-2"></span>
                                Análise de Estilo (IA)
                             </label>
                         </div>
                         <textarea 
                             value={styleAnalysis}
                             onChange={(e) => setStyleAnalysis(e.target.value)}
                             className="w-full h-28 p-4 bg-black/30 border border-fuchsia-500/20 rounded-xl text-xs font-mono text-fuchsia-100 focus:border-fuchsia-500/50 focus:outline-none transition-colors leading-relaxed"
                         />
                    </div>
                )}
            </div>
        </div>

        <ScriptModeSelector
            selectedMode={scriptMode}
            onSelectMode={setScriptMode}
            disabled={isLoading}
        />

        <button
          onClick={onGenerate}
          disabled={isLoading || !productImageFile || !characterDescription}
          className={`w-full relative overflow-hidden rounded-2xl py-5 font-bold text-lg text-white shadow-2xl transition-all duration-300 group
            ${isLoading || !productImageFile || !characterDescription ? 'bg-gray-800 cursor-not-allowed opacity-50 grayscale' : 'bg-gradient-to-r from-cyan-600 via-violet-600 to-fuchsia-600 hover:scale-[1.01]'}
          `}
        >
          {!isLoading && <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform duration-500 ease-out"></div>}
          <div className="relative z-10 flex items-center justify-center space-x-3">
            {isLoading ? (
              <>
                <Loader />
                <span className="text-cyan-200 animate-pulse">Processando Criativo...</span>
              </>
            ) : (
              <>
                <MagicWandIcon />
                <span>CRIAR CAMPANHA <span className="bg-black/20 px-2 py-1 rounded text-xs ml-2 font-mono border border-white/10">-{SCRIPT_GENERATION_COST} CR</span></span>
              </>
            )}
          </div>
        </button>
      </div>
    </div>
  );
};

export default ScriptGenerator;
