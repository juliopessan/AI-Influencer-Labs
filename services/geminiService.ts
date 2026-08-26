
import {
  GoogleGenAI,
  Type,
  GenerateContentResponse,
  ApiError,
  VideoGenerationReferenceType,
} from "@google/genai";
import { ScriptChunk, VideoStyle, ScriptMode, AspectRatio, SocialContentGenerated, ImagePayload } from "../types";
import { MAX_CHUNKS, CHUNK_DURATION, VIDEO_POLL_INTERVAL_MS, VIDEO_POLL_TIMEOUT_MS } from "../constants";

// --- Client -----------------------------------------------------------------

/**
 * In AI Studio the key is injected at runtime; in a self-hosted build it comes
 * from GEMINI_API_KEY via vite's `define`. Resolved lazily so that a missing key
 * surfaces as a readable error instead of a crash at module load.
 */
export function resolveApiKey(): string | null {
  const key = process.env.API_KEY || process.env.GEMINI_API_KEY;
  return key && key.length > 0 ? key : null;
}

export function hasApiKey(): boolean {
  return resolveApiKey() !== null;
}

let cachedClient: { key: string; client: GoogleGenAI } | null = null;

function getClient(): GoogleGenAI {
  const key = resolveApiKey();
  if (!key) {
    throw new Error(
      "Nenhuma chave de API configurada. Defina GEMINI_API_KEY no arquivo .env ou conecte uma chave pelo AI Studio."
    );
  }
  // Reuse the client across calls; rebuild only if the key itself changed.
  if (!cachedClient || cachedClient.key !== key) {
    cachedClient = { key, client: new GoogleGenAI({ apiKey: key }) };
  }
  return cachedClient.client;
}

// --- Error handling ---------------------------------------------------------

const TRANSIENT_STATUS = new Set([429, 500, 502, 503, 504]);

/**
 * Extracts an HTTP status from the shapes involved: ApiError from the SDK, the
 * REST envelope `{ error: { code } }`, and the flat `{ code, message }` carried
 * on a failed long-running operation.
 */
function statusOf(error: unknown): number | null {
  if (error instanceof ApiError && typeof error.status === "number") return error.status;
  const anyErr = error as any;
  if (typeof anyErr?.status === "number") return anyErr.status;
  if (typeof anyErr?.error?.code === "number") return anyErr.error.code;
  if (typeof anyErr?.code === "number") return anyErr.code;
  return null;
}

function messageOf(error: unknown): string {
  const anyErr = error as any;
  if (anyErr?.error?.message) return String(anyErr.error.message);
  if (error instanceof Error) return error.message;
  if (typeof error === "string") return error;
  if (typeof anyErr?.message === "string") return anyErr.message;
  try {
    return JSON.stringify(error);
  } catch {
    return String(error);
  }
}

/**
 * A request is worth retrying when the status says so. Status is not always
 * available (network failures, errors re-thrown as plain strings), so fall back
 * to matching the codes the API embeds in its message.
 */
function isTransient(error: unknown): boolean {
  const status = statusOf(error);
  if (status !== null) return TRANSIENT_STATUS.has(status);

  const msg = messageOf(error);
  return /\b(429|500|502|503|504)\b|UNAVAILABLE|RESOURCE_EXHAUSTED|overloaded|Failed to fetch|NetworkError/i.test(msg);
}

/** Turns any API failure into a message a non-technical user can act on. */
export function humanizeError(error: unknown): string {
  const status = statusOf(error);
  const msg = messageOf(error);

  if (status === 429 || /RESOURCE_EXHAUSTED/i.test(msg)) {
    return "Cota da API excedida. Verifique os limites do seu projeto no Google AI Studio.";
  }
  if (status === 503 || /overloaded|UNAVAILABLE/i.test(msg)) {
    return "O modelo está sobrecarregado no momento. Tente novamente em alguns instantes.";
  }
  if (status === 404 || /Requested entity was not found/i.test(msg)) {
    return "Modelo não encontrado. O Veo exige um projeto do Google Cloud com faturamento habilitado (Paid Tier).";
  }
  if (status === 403 || /PERMISSION_DENIED|API key not valid/i.test(msg)) {
    return "Chave de API inválida ou sem permissão para este modelo.";
  }
  if (status === 400 && /SAFETY|blocked/i.test(msg)) {
    return "O conteúdo foi bloqueado pelos filtros de segurança. Ajuste o roteiro ou as imagens e tente de novo.";
  }
  return msg || "Ocorreu um erro desconhecido ao falar com a API.";
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function retryWithBackoff<T>(fn: () => Promise<T>, retries = 5, baseDelay = 3000): Promise<T> {
  let lastError: unknown;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;
      if (!isTransient(error)) throw error;

      if (attempt < retries - 1) {
        const delay = baseDelay * 2 ** attempt + Math.random() * 1000;
        console.warn(
          `API indisponível (${messageOf(error)}). Nova tentativa em ${Math.round(delay)}ms (${attempt + 1}/${retries}).`
        );
        await sleep(delay);
      }
    }
  }
  throw lastError;
}

// --- Schemas ----------------------------------------------------------------

const scriptSchema = {
  type: Type.OBJECT,
  properties: {
    script: {
      type: Type.ARRAY,
      minItems: String(MAX_CHUNKS),
      maxItems: String(MAX_CHUNKS),
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
        propertyOrdering: ["scene", "narration"],
      },
    },
  },
  required: ["script"],
};

const socialPostSchema = {
  type: Type.OBJECT,
  properties: {
    platform: { type: Type.STRING },
    title: { type: Type.STRING, description: "Título curto. Obrigatório apenas para o YouTube." },
    caption: { type: Type.STRING },
    hashtags: { type: Type.ARRAY, items: { type: Type.STRING } },
    strategyTip: { type: Type.STRING },
  },
  required: ["platform", "caption", "hashtags", "strategyTip"],
};

const socialContentSchema = {
  type: Type.OBJECT,
  properties: {
    instagram: socialPostSchema,
    tiktok: socialPostSchema,
    youtube: socialPostSchema,
  },
  required: ["instagram", "tiktok", "youtube"],
};

// --- Style presets ----------------------------------------------------------

const stylePrompts: Record<VideoStyle, string> = {
  cinematic: "Cinematic shot, hyper-realistic, high detail, professional color grading, 8k, smooth motion",
  animation: "3D animation style, vibrant, high quality render, Pixar-like, expressive character",
  documentary: "Documentary style, handheld camera, natural lighting, realistic texture, sharp focus",
  vlog: "Vlog style, selfie camera angle, dynamic movement, authentic feel, personal perspective",
};

// --- Agents -----------------------------------------------------------------

/** Casting agent: turns a reference photo into a reusable character blueprint. */
export async function generateInfluencerPersona(image: ImagePayload): Promise<string> {
  const ai = getClient();

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

  const response = await retryWithBackoff<GenerateContentResponse>(() =>
    ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: { parts: [{ inlineData: image }, { text: prompt }] },
    })
  );

  const text = response.text?.trim();
  if (!text) throw new Error("A API não retornou a descrição da persona.");
  return text;
}

/** Strategist agent: reads the product (and logo) and writes the campaign brief. */
export async function generateCampaignBriefing(
  productImage: ImagePayload,
  logoImage: ImagePayload | null
): Promise<string> {
  const ai = getClient();

  const prompt = `Atue como um estrategista de marketing digital. Analise a imagem do produto fornecida${
    logoImage ? " e o logotipo da marca que a acompanha" : ""
  }.

Escreva um "Briefing de Campanha" curto e impactante (máximo 2 parágrafos).

O briefing deve identificar:
1. O que é o produto e seus principais benefícios visuais.
2. O público-alvo provável.
3. O tom de voz ideal para um vídeo UGC (User Generated Content).

Seja direto e criativo. Responda em Português do Brasil (PT-BR).`;

  // Label each image so the model does not confuse the logo with the product.
  const parts: Array<{ text: string } | { inlineData: ImagePayload }> = [
    { text: "Imagem do produto:" },
    { inlineData: productImage },
  ];
  if (logoImage) {
    parts.push({ text: "Logotipo da marca:" }, { inlineData: logoImage });
  }
  parts.push({ text: prompt });

  const response = await retryWithBackoff<GenerateContentResponse>(() =>
    ai.models.generateContent({ model: "gemini-2.5-flash", contents: { parts } })
  );

  const text = response.text?.trim();
  if (!text) throw new Error("A API não retornou o briefing da campanha.");
  return text;
}

/**
 * Director agent: derives concrete editing guidance from a reference URL.
 * The model cannot open the link, so it reasons from the platform and handle in
 * the URL — this is style guidance, not a transcript of that specific video.
 */
export async function analyzeReferenceStyle(referenceUrl: string): Promise<string> {
  const ai = getClient();

  const prompt = `Atue como um diretor criativo especializado em vídeo social de formato curto.

O usuário indicou este link como referência de estilo: ${referenceUrl}

Você NÃO consegue abrir o link. Trabalhe a partir da plataforma e do perfil identificáveis na URL e do que é comprovadamente eficaz nesse formato.

Produza um guia de direção curto (máximo 6 linhas), uma diretriz por linha, cobrindo:
- Ritmo e duração média dos cortes
- Gancho visual dos primeiros 3 segundos
- Tratamento de áudio e narração
- Elementos gráficos na tela
- Enquadramento e movimento de câmera

Formato: texto puro, uma diretriz por linha, começando com "> ". Sem markdown, sem introdução. Idioma: Português do Brasil.`;

  const response = await retryWithBackoff<GenerateContentResponse>(() =>
    ai.models.generateContent({ model: "gemini-2.5-flash", contents: { parts: [{ text: prompt }] } })
  );

  const text = response.text?.trim();
  if (!text) throw new Error("A API não retornou a análise de estilo.");
  return text;
}

/** Screenwriter agent: builds the linear, N-act script. */
export async function generateScript(
  topic: string,
  productImage: ImagePayload,
  logoImage: ImagePayload | null,
  mode: ScriptMode,
  characterDescription: string,
  referenceUrl: string | null,
  styleAnalysis?: string | null
): Promise<ScriptChunk[]> {
  const ai = getClient();

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
    case "fast":
      model = "gemini-2.5-flash-lite";
      break;
    case "complex":
      model = "gemini-2.5-pro";
      config.thinkingConfig = { thinkingBudget: 32768 };
      break;
    case "balanced":
    default:
      model = "gemini-2.5-flash";
      break;
  }

  let prompt = `Você é um roteirista especialista em criar conteúdo UGC (User-Generated Content). Sua tarefa é criar um roteiro para um vídeo promocional.

**A Protagonista (Influencer):**
${characterDescription}

**O Contexto/Briefing da Campanha:**
${topic}

**Regras de Storytelling Linear (IMPORTANTE):**
O vídeo deve ter um arco narrativo contínuo, como um filme curto. NÃO crie cenas aleatórias.
Distribua a narrativa em exatamente ${MAX_CHUNKS} atos, nesta ordem:
1. **O Gancho (Hook):** Algo visualmente impactante nos primeiros segundos para prender a atenção.
2. **O Problema/Contexto:** Apresentação da situação ou necessidade, introduzindo o produto sutilmente.
3. **A Experiência:** A Influencer usando o produto. Foco sensorial (textura, uso, sensação).
4. **O Clímax/Benefício:** O resultado transformador do uso do produto.
5. **Prova Social/Lifestyle:** O produto integrado ao estilo de vida aspiracional da influencer.
6. **Chamada para Ação (CTA):** Conclusão forte convidando para comprar ou saber mais.
Se ${MAX_CHUNKS} for diferente de 6, comprima ou expanda os atos intermediários, mas mantenha sempre o gancho na primeira cena e o CTA na última.

**Consistência Visual:**
- A Influencer deve manter a MESMA roupa e aparência descrita na persona.
- O cenário deve ser consistente (ex: se começou na sala, mantenha na sala ou faça uma transição lógica).
`;

  if (referenceUrl) {
    prompt += `
**Referência de Estilo (IMPORTANTE):**
O usuário forneceu este link de referência: ${referenceUrl}.
- Use cortes rápidos e ganchos visuais nos primeiros 3 segundos.
- O tom deve ser extremamente autêntico e "nativo" da plataforma.
- Tente emular a estrutura de retenção típica de vídeos virais deste estilo.
`;
  }

  if (styleAnalysis) {
    prompt += `
**Direção de Estilo aprovada pelo usuário (siga à risca):**
${styleAnalysis}
`;
  }

  prompt += `
**Requisitos Técnicos:**
- O roteiro deve ter exatamente ${MAX_CHUNKS} cenas, cada uma com ${CHUNK_DURATION} segundos.
- A narração de cada cena precisa caber confortavelmente em ${CHUNK_DURATION} segundos de fala natural — no máximo cerca de ${Math.round(CHUNK_DURATION * 2.5)} palavras.
- **Idioma:** O roteiro e a narração DEVEM ser estritamente em **Português do Brasil (PT-BR)**.

Para cada cena, forneça:
1. 'scene': Uma descrição visual detalhada da cena, focando na ação da influencer e ângulos de câmera. NÃO inclua a fala aqui.
2. 'narration': A fala da Influencer, em PT-BR, exatamente como ela deve ser pronunciada. Tom: ${
    mode === "complex" ? "sofisticado e detalhado" : "energético e viral"
  }.

Sua saída final DEVE ser um objeto JSON com a chave 'script'. Responda APENAS com o JSON.`;

  const parts: Array<{ text: string } | { inlineData: ImagePayload }> = [
    { text: "Imagem do produto:" },
    { inlineData: productImage },
  ];
  if (logoImage) {
    parts.push({ text: "Logotipo da marca:" }, { inlineData: logoImage });
  }
  parts.push({ text: prompt });

  const response = await retryWithBackoff<GenerateContentResponse>(() =>
    ai.models.generateContent({ model, contents: { parts }, config })
  );

  const jsonText = response.text?.trim();
  if (!jsonText) {
    throw new Error("A API não retornou texto no roteiro.");
  }

  let parsed: { script?: unknown };
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    throw new Error("A API retornou um roteiro em formato inválido.");
  }

  if (!Array.isArray(parsed.script) || parsed.script.length === 0) {
    throw new Error("A API não retornou um objeto de roteiro válido.");
  }

  // The model occasionally overshoots the requested scene count; the credit cost
  // and the 6-act structure both assume MAX_CHUNKS, so clamp it here.
  const batchId = Date.now();
  return parsed.script.slice(0, MAX_CHUNKS).map((chunk: any, index: number) => ({
    id: `chunk-${index}-${batchId}`,
    scene: String(chunk?.scene ?? "").trim(),
    narration: String(chunk?.narration ?? "").trim(),
  }));
}

/** Social agent: derives platform-native copy from the finished script. */
export async function generateSocialContent(
  topic: string,
  script: ScriptChunk[],
  referenceUrl: string | null
): Promise<SocialContentGenerated> {
  const ai = getClient();

  const scriptContent = script
    .map((s, i) => `[Cena ${i + 1}]: ${s.scene}\n(Narração): ${s.narration}`)
    .join("\n\n");

  const prompt = `Você é um Social Media Manager profissional. Com base no roteiro do vídeo e no tema da campanha abaixo, gere conteúdo otimizado para Instagram, TikTok e YouTube.

**Tema da campanha:** ${topic}
${referenceUrl ? `**Referência de estilo:** ${referenceUrl}` : ""}

**Roteiro do vídeo:**
${scriptContent}

Regras:
- 'platform' deve ser exatamente "Instagram", "TikTok" ou "YouTube".
- 'hashtags' são palavras sem o caractere '#'.
- Preencha 'title' apenas para o YouTube.
- Conteúdo envolvente, pronto para viralizar, com emojis relevantes.
- Idioma: Português do Brasil (PT-BR).`;

  const response = await retryWithBackoff<GenerateContentResponse>(() =>
    ai.models.generateContent({
      model: "gemini-2.5-flash",
      contents: { parts: [{ text: prompt }] },
      config: { responseMimeType: "application/json", responseSchema: socialContentSchema },
    })
  );

  const jsonText = response.text?.trim();
  if (!jsonText) {
    throw new Error("A API não retornou conteúdo social.");
  }
  const parsed = JSON.parse(jsonText) as SocialContentGenerated;
  // Normalize so the UI can map over hashtags unconditionally.
  for (const post of [parsed.instagram, parsed.tiktok, parsed.youtube]) {
    if (post && !Array.isArray(post.hashtags)) post.hashtags = [];
  }
  return parsed;
}

/**
 * Video director agent: expands a scene into a Veo-ready prompt.
 *
 * The narration is embedded as spoken dialogue — Veo 3.x renders speech from the
 * prompt, so leaving it out silences the influencer in the final cut.
 */
export async function optimizeVeoPrompt(
  chunk: ScriptChunk,
  style: VideoStyle,
  characterDescription: string
): Promise<string> {
  const ai = getClient();
  const styleInstructions = stylePrompts[style] ?? stylePrompts.cinematic;

  const prompt = `Atue como um Engenheiro de Prompt especialista em Vídeo AI (Google Veo).
Sua tarefa é converter uma descrição de cena em um prompt técnico e detalhado, otimizado para geração de vídeo de alta qualidade com áudio.

**Entradas:**
- Estilo Visual: ${styleInstructions}
- Personagem: ${characterDescription}
- Ação/Cena: ${chunk.scene}
- Fala da personagem (PT-BR, não traduza): ${chunk.narration}

**Requisitos do Prompt:**
1. Comece com o estilo visual principal.
2. Descreva o personagem e a ação com precisão visual.
3. Inclua detalhes de iluminação (ex: "golden hour", "soft studio lighting"), câmera (ex: "wide angle", "close up", "bokeh") e atmosfera.
4. Use palavras-chave de alta fidelidade: "4k", "photorealistic", "highly detailed".
5. O corpo do prompt deve ser em Inglês (o modelo Veo performa melhor em inglês).
6. **Obrigatório:** termine com a fala, exatamente neste formato e mantendo o texto em Português do Brasil, palavra por palavra, sem traduzir e sem reescrever:
   She says in Brazilian Portuguese: "${chunk.narration}"
7. Acrescente ao final: "Audio: clear natural voice, no subtitles, no on-screen text."

Retorne APENAS o texto do prompt, sem aspas envolventes e sem explicações.`;

  const response = await retryWithBackoff<GenerateContentResponse>(() =>
    ai.models.generateContent({ model: "gemini-2.5-flash", contents: { parts: [{ text: prompt }] } })
  );

  const optimized = response.text?.trim();
  return optimized && optimized.length > 0 ? optimized : buildFallbackVeoPrompt(chunk, style, characterDescription);
}

/** Deterministic prompt used when the director agent is unavailable. */
function buildFallbackVeoPrompt(chunk: ScriptChunk, style: VideoStyle, characterDescription: string): string {
  const styleInstructions = stylePrompts[style] ?? stylePrompts.cinematic;
  return `Style: ${styleInstructions}
Character: ${characterDescription}
Action/Scene: ${chunk.scene}
Details: 4k, photorealistic, consistent lighting, high fidelity, smooth motion.
She says in Brazilian Portuguese: "${chunk.narration}"
Audio: clear natural voice, no subtitles, no on-screen text.`;
}

// --- Renderer ---------------------------------------------------------------

export interface VideoRenderOptions {
  style: VideoStyle;
  aspectRatio: AspectRatio;
  characterDescription: string;
  optimizedPrompt?: string;
  /** Reference photo used to keep the influencer's face stable across scenes. */
  characterImage?: ImagePayload | null;
  signal?: AbortSignal;
  onProgress?: (message: string) => void;
}

function assertNotAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new Error("Renderização cancelada.");
}

/**
 * Renders a single scene with Veo and returns an object URL for the clip.
 * Callers own the returned URL and must revoke it.
 */
export async function generateVideoForChunk(chunk: ScriptChunk, options: VideoRenderOptions): Promise<string> {
  const { style, aspectRatio, characterDescription, optimizedPrompt, characterImage, signal, onProgress } = options;
  const ai = getClient();
  const apiKey = resolveApiKey()!;

  const fullPrompt = optimizedPrompt || buildFallbackVeoPrompt(chunk, style, characterDescription);

  const startGeneration = (withReference: boolean) =>
    retryWithBackoff(() =>
      ai.models.generateVideos({
        model: "veo-3.1-generate-preview",
        prompt: fullPrompt,
        config: {
          numberOfVideos: 1,
          resolution: "720p",
          aspectRatio,
          ...(withReference && characterImage
            ? {
                referenceImages: [
                  {
                    image: { imageBytes: characterImage.data, mimeType: characterImage.mimeType },
                    referenceType: VideoGenerationReferenceType.ASSET,
                  },
                ],
              }
            : {}),
        },
      })
    );

  assertNotAborted(signal);
  onProgress?.("Enviando cena para o Veo");

  let operation;
  try {
    operation = await startGeneration(Boolean(characterImage));
  } catch (error) {
    // Reference images are not available on every model tier or region. Rather
    // than failing the scene, fall back to the text-only prompt.
    if (characterImage && statusOf(error) === 400) {
      console.warn("Referência de personagem rejeitada pelo modelo; renderizando somente com texto.");
      onProgress?.("Referência de personagem indisponível, usando apenas texto");
      operation = await startGeneration(false);
    } else {
      throw error;
    }
  }

  onProgress?.("Renderizando");

  const deadline = Date.now() + VIDEO_POLL_TIMEOUT_MS;
  let consecutivePollFailures = 0;

  while (!operation.done) {
    if (Date.now() > deadline) {
      throw new Error(
        `A renderização excedeu o tempo limite de ${Math.round(VIDEO_POLL_TIMEOUT_MS / 60000)} minutos.`
      );
    }
    await sleep(VIDEO_POLL_INTERVAL_MS);
    assertNotAborted(signal);

    try {
      operation = await ai.operations.getVideosOperation({ operation });
      consecutivePollFailures = 0;
    } catch (pollError) {
      if (!isTransient(pollError)) throw pollError;
      // A transient poll failure does not mean the job died — keep waiting, but
      // give up if the API stays unreachable.
      if (++consecutivePollFailures >= 6) {
        throw new Error("Não foi possível acompanhar o progresso da renderização. Tente novamente.");
      }
      console.warn(`Falha ao consultar a operação (${consecutivePollFailures}/6). Continuando.`);
    }
  }

  if (operation.error) {
    throw new Error(humanizeError(operation.error));
  }

  const downloadLink = operation.response?.generatedVideos?.[0]?.video?.uri;
  if (!downloadLink) {
    throw new Error("A geração do vídeo terminou, mas nenhum link para download foi fornecido.");
  }

  onProgress?.("Baixando clipe");

  // Authenticate via header so the key never lands in a URL (and therefore never
  // in browser history, referrers or logs).
  const videoResponse = await retryWithBackoff(async () => {
    const res = await fetch(downloadLink, {
      headers: { "x-goog-api-key": apiKey },
      signal,
    });
    if (!res.ok && (res.status === 429 || res.status >= 500)) {
      throw new ApiError({ message: `Download falhou: ${res.statusText}`, status: res.status });
    }
    return res;
  });

  if (!videoResponse.ok) {
    let detail = videoResponse.statusText;
    try {
      const body = await videoResponse.json();
      if (body?.error?.message) detail = body.error.message;
    } catch {
      // Body was not JSON; the status text is the best we have.
    }
    throw new Error(humanizeError({ status: videoResponse.status, error: { message: detail } }));
  }

  const videoBlob = await videoResponse.blob();
  if (videoBlob.size === 0) {
    throw new Error("O clipe baixado está vazio. Tente renderizar a cena novamente.");
  }
  return URL.createObjectURL(videoBlob);
}
