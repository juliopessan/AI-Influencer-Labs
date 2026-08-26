
import { GoogleGenAI, Type, GenerateContentResponse } from "@google/genai";
import { ScriptChunk, VideoStyle, ScriptMode, AspectRatio, SocialContentGenerated } from "../types";
import { MAX_CHUNKS, CHUNK_DURATION } from "../constants";

const scriptSchema = {
  type: Type.OBJECT,
  properties: {
    script: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          scene: {
            type: Type.STRING,
            description: "Uma descrição vívida dos elementos visuais na cena.",
          },
          narration: {
            type: Type.STRING,
            description: "A narração em voz para esta cena.",
          },
        },
        required: ["scene", "narration"],
      },
    },
  },
  required: ["script"],
};

// Helper function for exponential backoff retries
async function retryWithBackoff<T>(fn: () => Promise<T>, retries = 5, baseDelay = 3000): Promise<T> {
    let lastError: any;
    for (let i = 0; i < retries; i++) {
        try {
            return await fn();
        } catch (error: any) {
            lastError = error;
            const msg = error?.message || JSON.stringify(error);
            // Retry on 503 (Overloaded) or 429 (Quota/Rate Limit) or 500 (Internal)
            const isTransient = msg.includes("503") || msg.includes("overloaded") || msg.includes("UNAVAILABLE") || msg.includes("429") || msg.includes("RESOURCE_EXHAUSTED") || msg.includes("Exhausted");
            
            if (!isTransient) throw error;
            
            if (i < retries - 1) {
                const delay = baseDelay * Math.pow(2, i) + (Math.random() * 1000);
                console.warn(`API Busy/Overloaded (${msg}). Retrying in ${Math.round(delay)}ms... (Attempt ${i + 1}/${retries})`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }
        }
    }
    throw lastError;
}

// New function to analyze influencer photo
export async function generateInfluencerPersona(
    image: { data: string; mimeType: string }
): Promise<string> {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });
    
    const prompt = `Você é um Engenheiro de Prompts Mestre, especializado em criar "blueprints" de personagens para IAs de vídeo e avatares. Sua tarefa é analisar a imagem de uma influenciadora e destilar sua essência em um prompt técnico e evocativo que servirá de base para criar sua versão digital.

**PROCESSO DE ANÁLISE (siga rigorosamente):**

**PASSO 1: Análise Visual Detalhada (siga este modelo ESTRITAMENTE)**
Descreva a imagem com precisão de um diretor de fotografia. Use o seguinte formato:

- **Sujeito:** Idade aparente, etnia, tom de pele, físico (ex: atlético, magro, etc.), detalhes visíveis (ex: definição nos ombros).
- **Rosto e Cabelo:** Descreva o cabelo (cor, estilo, textura), sorriso, expressão facial.
- **Acessórios:** Liste e descreva cada acessório (óculos, joias, etc.) com detalhes sobre material, formato e estilo.
- **Vestuário:** Descreva cada peça de roupa, incluindo estilo (ex: 'frente única'), tecido (ex: 'franzido'), cor e detalhes de hardware (ex: 'argola dourada').
- **Ambiente/Fundo:** Descreva o cenário (ex: 'jardim com gramado verde'), elementos visíveis e a atmosfera geral.
- **Iluminação e Estilo Fotográfico:** Tipo de luz (ex: 'luz solar direta e dura'), contraste, e ângulo da câmera (ex: 'selfie de cima para baixo', 'high angle').

**PASSO 2: Análise Comportamental e Energética**
Com base na análise visual, infira a personalidade projetada:

- **Vibe/Aura:** Qual a energia principal? (Ex: 'solar e contagiante', 'sofisticada e serena', 'energética e divertida').
- **Estilo de Comunicação:** Como ela se comunicaria? (Ex: 'comunicação calma e leve', 'sorriso fácil e aberto', 'postura confiante').

**PASSO 3: Construção do Master Prompt (SAÍDA FINAL)**
Sintetize TODAS as informações dos Passos 1 e 2 em um **único parágrafo denso**. Este é o seu entregável final. Formate-o como um prompt para uma IA de geração de imagem/vídeo, usando palavras-chave separadas por vírgulas e frases descritivas curtas. O objetivo é criar um "pacote" de informações que outra IA possa usar para recriar esta pessoa com alta fidelidade.

**Exemplo de Saída (estrutura do Master Prompt):**
"Uma influenciadora digital [adjetivo de vibe], [idade], caucasiana com pele [tom], físico [descrição]. Rosto [detalhes], cabelo [detalhes do cabelo]. Vestindo um [descrição do vestuário com detalhes]. Acessórios: [lista de acessórios]. Em um [cenário], com iluminação [tipo de iluminação], fotografia estilo [estilo fotográfico]. Sua comunicação é [estilo de comunicação], transmitindo confiança e autenticidade."

**Idioma:** A saída final (o Master Prompt) deve ser em **Português do Brasil (PT-BR)**. Responda APENAS com o Master Prompt final.`;

    const response = await retryWithBackoff<GenerateContentResponse>(() => ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: {
            parts: [
                { inlineData: image },
                { text: prompt }
            ]
        }
    }));

    return response.text?.trim() ?? "";
}

// New function to generate briefing from product/logo
export async function generateCampaignBriefing(
    productImage: { data: string; mimeType: string },
    logoImage: { data: string; mimeType: string } | null
): Promise<string> {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });

    const prompt = `Atue como um estrategista de marketing digital. Analise a imagem do produto fornecida (e o logotipo, se houver).
    
    Escreva um "Briefing de Campanha" curto e impactante (máximo 2 parágrafos).
    
    O briefing deve identificar:
    1. O que é o produto e seus principais benefícios visuais.
    2. O público-alvo provável.
    3. O tom de voz ideal para um vídeo UGC (User Generated Content).
    
    Seja direto e criativo.`;

    const parts: any[] = [
        { inlineData: productImage },
        { text: prompt }
    ];

    if (logoImage) {
        parts.unshift({ inlineData: logoImage });
    }

    const response = await retryWithBackoff<GenerateContentResponse>(() => ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts: parts }
    }));

    return response.text?.trim() ?? "";
}

export async function generateScript(
  topic: string, 
  productImage: { data: string; mimeType: string },
  logoImage: { data: string; mimeType: string } | null,
  mode: ScriptMode,
  characterDescription: string,
  referenceUrl: string | null
): Promise<ScriptChunk[]> {
  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });
  
  let model: string;
  const config: {
    responseMimeType: string;
    responseSchema: typeof scriptSchema;
    thinkingConfig?: { thinkingBudget: number };
  } = {
    responseMimeType: "application/json",
    responseSchema: scriptSchema,
  };

  switch (mode) {
    case 'fast':
      model = 'gemini-flash-lite-latest';
      break;
    case 'complex':
      model = 'gemini-2.5-pro';
      config.thinkingConfig = { thinkingBudget: 32768 };
      break;
    case 'balanced':
    default:
      model = 'gemini-2.5-flash';
      break;
  }

  try {
    let prompt = `Você é um roteirista especialista em criar conteúdo UGC (User-Generated Content). Sua tarefa é criar um roteiro para um vídeo promocional.

**A Protagonista (Influencer):**
${characterDescription}

**O Contexto/Briefing da Campanha:**
${topic}

**Regras de Storytelling Linear (IMPORTANTE):**
O vídeo deve ter um arco narrativo contínuo, como um filme curto. NÃO crie cenas aleatórias.
Siga esta estrutura de ${MAX_CHUNKS} atos:
1. **O Gancho (Hook):** Algo visualmente impactante nos primeiros segundos para prender a atenção.
2. **O Problema/Contexto:** Apresentação da situação ou necessidade, introduzindo o produto sutilmente.
3. **A Experiência:** A Influencer usando o produto. Foco sensorial (textura, uso, sensação).
4. **O Clímax/Benefício:** O resultado transformador do uso do produto.
5. **Prova Social/Lifestyle:** O produto integrado ao estilo de vida aspiracional da influencer.
6. **Chamada para Ação (CTA):** Conclusão forte convidando para comprar ou saber mais.

**Consistência Visual:**
- A Influencer deve manter a MESMA roupa e aparência descrita na persona.
- O cenário deve ser consistente (ex: se começou na sala, mantenha na sala ou faça uma transição lógica).
`;

    if (referenceUrl) {
        prompt += `
**Referência de Estilo (IMPORTANTE):**
O usuário forneceu este link de referência: ${referenceUrl}.
Analise a estrutura típica de vídeos virais desta plataforma (TikTok/Reels).
- Use cortes rápidos e ganchos visuais nos primeiros 3 segundos.
- O tom deve ser extremamente autêntico e "nativo" da plataforma.
- Tente emular a estrutura de retenção típica de vídeos virais deste estilo.
`;
    }

    prompt += `
**Requisitos Técnicos:**
- O roteiro deve ser dividido em ${MAX_CHUNKS} cenas, cada uma com ${CHUNK_DURATION} segundos.
- **Idioma:** O roteiro e a narração DEVEM ser estritamente em **Português do Brasil (PT-BR)**.

Para cada cena, forneça:
1. 'scene': Uma descrição visual detalhada da cena, focando na ação da influencer e ângulos de câmera.
2. 'narration': A fala da Influencer (em PT-BR). Tom: ${mode === 'complex' ? 'sofisticado e detalhado' : 'energético e viral'}.

Sua saída final DEVE ser um objeto JSON com a chave 'script'. Responda APENAS com o JSON.`;

    const parts: ({ text: string } | { inlineData: { data: string; mimeType: string }})[] = [
      {
        inlineData: {
          data: productImage.data,
          mimeType: productImage.mimeType,
        },
      },
      { text: prompt },
    ];

    if (logoImage) {
      parts.unshift({
        inlineData: {
          data: logoImage.data,
          mimeType: logoImage.mimeType,
        },
      });
    }

    const response = await retryWithBackoff<GenerateContentResponse>(() => ai.models.generateContent({
      model: model,
      contents: { parts: parts },
      config: config,
    }));

    const jsonText = response.text?.trim();
    if (!jsonText) {
        throw new Error("A API não retornou texto no roteiro.");
    }
    const parsedResponse = JSON.parse(jsonText) as { script: any[] };
    
    if (!Array.isArray(parsedResponse.script)) {
        throw new Error("A API não retornou um objeto de roteiro válido.");
    }
    
    const scriptWithIds = parsedResponse.script.map((chunk, index) => ({
      ...chunk,
      id: `chunk-${index}-${Date.now()}`,
    }));

    return scriptWithIds;

  } catch (error) {
    console.error("Error generating script:", error);
    if (error instanceof Error) {
        throw error;
    }
    throw new Error("Falha ao gerar o roteiro devido a um erro desconhecido.");
  }
}

// New function to optimize prompts for Veo
export async function optimizeVeoPrompt(
    scene: string,
    style: VideoStyle,
    characterDescription: string
): Promise<string> {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });
    
    const styleInstructions = stylePrompts[style] || stylePrompts.cinematic;

    const prompt = `Atue como um Engenheiro de Prompt especialista em Vídeo AI (Google Veo).
    Sua tarefa é converter uma descrição de cena em um prompt técnico e detalhado, otimizado para geração de vídeo de alta qualidade.

    **Entradas:**
    - Estilo Visual: ${styleInstructions}
    - Personagem: ${characterDescription}
    - Ação/Cena: ${scene}

    **Requisitos do Prompt:**
    1. Comece com o estilo visual principal.
    2. Descreva o personagem e a ação com precisão visual.
    3. Inclua detalhes de iluminação (ex: "golden hour", "soft studio lighting"), câmera (ex: "wide angle", "close up", "bokeh") e atmosfera.
    4. Use palavras-chave de alta fidelidade: "4k", "photorealistic", "highly detailed".
    5. O prompt deve ser em Inglês (o modelo Veo performa melhor em inglês).
    
    Retorne APENAS o texto do prompt, sem aspas ou explicações.`;

    const response = await retryWithBackoff<GenerateContentResponse>(() => ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts: [{ text: prompt }] }
    }));

    return response.text?.trim() ?? "";
}

// New function to generate social content
export async function generateSocialContent(
    topic: string, 
    script: ScriptChunk[], 
    referenceUrl: string | null
): Promise<SocialContentGenerated> {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });

    const scriptContent = script.map(s => `[Scene ${s.id}]: ${s.scene}\n(Narration): ${s.narration}`).join('\n\n');

    const prompt = `You are a professional Social Media Manager. Based on the video script and campaign topic below, generate optimized content for Instagram, TikTok, and YouTube.

    **Campaign Topic:** ${topic}
    ${referenceUrl ? `**Reference Style:** ${referenceUrl}` : ''}

    **Video Script:**
    ${scriptContent}

    **Output Requirement:**
    Return a JSON object adhering to this schema:
    {
      "instagram": { "platform": "Instagram", "caption": "string", "hashtags": ["string"], "strategyTip": "string" },
      "tiktok": { "platform": "TikTok", "caption": "string", "hashtags": ["string"], "strategyTip": "string" },
      "youtube": { "platform": "YouTube", "title": "string", "caption": "string", "hashtags": ["string"], "strategyTip": "string" }
    }
    
    The content should be engaging, viral-ready, and use relevant emojis. Language: Portuguese (PT-BR).`;

    const response = await retryWithBackoff<GenerateContentResponse>(() => ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: { parts: [{ text: prompt }] },
        config: { responseMimeType: "application/json" }
    }));

    const jsonText = response.text?.trim();
    if (!jsonText) {
        throw new Error("A API não retornou conteúdo social.");
    }
    return JSON.parse(jsonText) as SocialContentGenerated;
}

const stylePrompts: Record<VideoStyle, string> = {
    cinematic: "Cinematic shot, hyper-realistic, high detail, professional color grading, 8k, smooth motion",
    animation: "3D animation style, vibrant, high quality render, Pixar-like, expressive character",
    documentary: "Documentary style, handheld camera, natural lighting, realistic texture, sharp focus",
    vlog: "Vlog style, selfie camera angle, dynamic movement, authentic feel, personal perspective",
};

export async function generateVideoForChunk(
    chunk: ScriptChunk, 
    style: VideoStyle, 
    aspectRatio: AspectRatio, 
    characterDescription: string,
    optimizedPrompt?: string
): Promise<string> {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY! });
    try {
        let fullPrompt = optimizedPrompt;
        
        if (!fullPrompt) {
            const styleInstructions = stylePrompts[style] || stylePrompts.cinematic;
            fullPrompt = `Video generation.
Style: ${styleInstructions}
Character: ${characterDescription}
Action/Scene: ${chunk.scene}
Details: 4k, photorealistic, consistent lighting, high fidelity, smooth motion.`;
        }
        
        // Use retryWithBackoff for the initial generation request
        let operation = await retryWithBackoff(async () => {
             return await ai.models.generateVideos({
                model: 'veo-3.1-generate-preview', // Use standard model for better stability
                prompt: fullPrompt!,
                config: {
                    numberOfVideos: 1,
                    resolution: '720p',
                    aspectRatio: aspectRatio
                }
            });
        });

        // Initial delay to ensure operation is registered before polling
        await new Promise(resolve => setTimeout(resolve, 5000));

        while (!operation.done) {
            await new Promise(resolve => setTimeout(resolve, 10000));
            
            try {
                // Fix: Pass the operation object correctly, using the property name required by the SDK
                operation = await ai.operations.getVideosOperation({ operation: operation });
            } catch (pollError: any) {
                 const msg = pollError?.message || "";
                 // If the polling itself fails due to overload, wait and continue instead of crashing
                 if (msg.includes("503") || msg.includes("overloaded") || msg.includes("UNAVAILABLE")) {
                     console.warn("Polling encountered overload. Waiting before next attempt...");
                     continue;
                 }
                 throw pollError;
            }
        }
        
        const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;

        if (!downloadLink) {
            throw new Error("A geração do vídeo foi bem-sucedida, mas nenhum link para download foi fornecido.");
        }

        // Use separator logic to handle URIs that might already have parameters
        const separator = downloadLink.includes('?') ? '&' : '?';
        
        // Retry download as well if it fails due to transient network issues
        const videoResponse = await retryWithBackoff(async () => {
            const res = await fetch(`${downloadLink}${separator}key=${process.env.API_KEY}`);
            if (!res.ok) {
                 if (res.status === 429 || res.status >= 500) {
                     throw new Error(`Download failed: ${res.statusText} (Status ${res.status})`);
                 }
            }
            return res;
        });

        if (!videoResponse.ok) {
             let errorMsg = videoResponse.statusText;
             try {
                 const errorBody = await videoResponse.json();
                 if (errorBody.error && errorBody.error.message) {
                     errorMsg = errorBody.error.message;
                 }
             } catch (e) {
                 // ignore json parse error
             }

             if (videoResponse.status === 429) {
                 throw new Error("Cota da API excedida ao baixar o vídeo.");
            }
            throw new Error(`Falha ao baixar o vídeo: ${errorMsg}`);
        }
        const videoBlob = await videoResponse.blob();
        return URL.createObjectURL(videoBlob);

    } catch (error: any) {
        console.error("Error generating video:", error);
        
        let errorMessage = "Falha ao gerar o vídeo para a cena.";

        // Handle Google API Error Object format
        if (error.error && error.error.message) {
             errorMessage = error.error.message;
        } else if (error instanceof Error) {
             errorMessage = error.message;
        } else if (error.message) {
             errorMessage = error.message;
        } else {
            // Fallback for raw JSON error objects that might be converted to string
            const errorStr = String(error);
            if (errorStr.includes("Requested entity was not found")) {
                errorMessage = "O modelo Veo não foi encontrado ou a operação expirou. Verifique se sua API Key tem acesso ao modelo (Billing/Paid Tier).";
            } else {
                errorMessage = errorStr;
            }
        }

        if (errorMessage.includes("RESOURCE_EXHAUSTED") || errorMessage.includes("Cota da API excedida")) {
             throw new Error("Cota da API excedida. Verifique seu painel do Google AI Studio.");
        }
        
        if (errorMessage.includes("overloaded") || errorMessage.includes("503")) {
            throw new Error("O modelo Veo está sobrecarregado no momento. Tente novamente em alguns instantes.");
        }

        if (errorMessage.includes("Requested entity was not found") || errorMessage.includes("404")) {
            throw new Error("Modelo Veo 3.1 não disponível ou não encontrado. Verifique se seu Projeto Google Cloud tem faturamento habilitado e acesso ao modelo.");
        }
        
        throw new Error(errorMessage);
    }
}
