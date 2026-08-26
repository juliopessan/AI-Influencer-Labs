# Influencer Labs

Estúdio de IA que transforma uma foto de influencer e uma foto de produto em uma
campanha UGC completa: persona digital, briefing, roteiro em 6 atos, clipes de
vídeo gerados pelo Veo, corte final montado no navegador e legendas prontas para
Instagram, TikTok e YouTube.

## Como rodar

```bash
npm install
cp .env.example .env      # preencha GEMINI_API_KEY
npm run dev               # http://localhost:3000
```

Outros comandos:

| Comando             | O que faz                                  |
| ------------------- | ------------------------------------------ |
| `npm run lint`      | Lint (oxlint)                              |
| `npm run typecheck` | Checagem de tipos (`tsc --noEmit`)         |
| `npm test`          | Testes unitários (vitest)                  |
| `npm run deadcode`  | Exports e dependências não usados (knip)   |
| `npm run build`     | Typecheck + build de produção em `dist/`   |
| `npm run preview`   | Serve o build de produção                  |

O CI (`.github/workflows/ci.yml`) roda lint, typecheck, testes, deadcode e
build em cada PR. Para os mesmos checks localmente antes do commit:
`npx lefthook install`.

### Chave de API

A chave é resolvida em duas fontes, nesta ordem:

1. `GEMINI_API_KEY` do `.env`, injetada no bundle pelo Vite.
2. O seletor de chave do Google AI Studio (`window.aistudio`), quando o app roda
   dentro do AI Studio.

> **Atenção:** este é um app 100% client-side. A chave injetada no build fica
> visível para quem abrir a aba de rede do navegador. Use uma chave restrita e,
> para produção real, coloque um backend na frente da API.

O Veo exige um projeto do Google Cloud com **faturamento habilitado**. Sem isso o
roteiro é gerado normalmente, mas a renderização falha com "modelo não
encontrado".

## O pipeline

Cada etapa é um "agente" com um modelo e um prompt próprios. Todos vivem em
[`services/geminiService.ts`](services/geminiService.ts).

| # | Agente               | Entrada                        | Saída                        | Modelo             |
| - | -------------------- | ------------------------------ | ---------------------------- | ------------------ |
| 1 | Casting              | Foto da influencer             | Blueprint da persona (PT-BR) | `gemini-2.5-flash` |
| 2 | Estrategista         | Foto do produto + logo         | Briefing de campanha         | `gemini-2.5-flash` |
| 3 | Diretor (vídeo)      | Vídeo de referência            | Diretrizes de estilo         | `gemini-omni-flash-preview` |
| 3b| Diretor (link)       | URL de referência              | Diretrizes de estilo         | `gemini-2.5-flash` |
| 4 | Roteirista           | Briefing + persona + estilo    | Roteiro de 6 cenas (JSON)    | conforme o modo¹   |
| 5 | Diretor de Vídeo     | Cena + narração + estilo       | Prompt otimizado para Veo    | `gemini-2.5-flash` |
| 6 | Renderizador         | Prompt + foto de referência    | Clipe de 8s (blob)           | `veo-3.1-generate-preview` |
| 7 | Social               | Roteiro completo               | Legendas por plataforma      | `gemini-2.5-flash` |

¹ `fast` → `gemini-2.5-flash-lite`, `balanced` → `gemini-2.5-flash`,
`complex` → `gemini-2.5-pro` com *thinking budget*.

O agente Social (7) roda em segundo plano, em paralelo com a renderização: uma
falha ali não bloqueia o vídeo.

### Decisões que valem explicação

**A narração entra no prompt do Veo.** O Veo 3.x sintetiza fala a partir do
prompt. O agente Diretor de Vídeo obriga o prompt a terminar com
`She says in Brazilian Portuguese: "..."`, mantendo o texto em PT-BR sem
tradução. Sem isso o roteiro é escrito, exibido e editado — e depois descartado,
porque nunca chega ao modelo.

**Consistência de personagem.** A foto da influencer é enviada ao Veo como
`referenceImages` do tipo `ASSET`, o que segura rosto e roupa entre as cenas. Nem
todo tier do modelo aceita esse campo; quando a API responde 400, o renderizador
repete a chamada só com texto em vez de falhar a cena. Dá para desligar pelo
toggle "Consistência de Personagem".

**O diretor assiste, quando pode.** O Gemini Omni aceita vídeo na entrada e
responde em texto, então enviar o arquivo de referência produz uma análise do
que está de fato no vídeo — duração dos planos, gancho, áudio, enquadramento,
cor. Sem o arquivo, o caminho por URL continua disponível, mas o modelo não abre
o link: ele deduz pela plataforma e pelo perfil. O vídeo vai inline como base64,
daí o teto de `MAX_REFERENCE_VIDEO_BYTES`, e não é salvo junto com o projeto.

**Concorrência limitada.** A cota por minuto do Veo não absorve 6 renderizações
simultâneas. `VIDEO_RENDER_CONCURRENCY` (padrão 2) controla quantas cenas rodam
ao mesmo tempo.

**Falhas têm código, não texto.** Todo erro passa por `classifyFailure` em
[`services/failures.ts`](services/failures.ts) e vira um `code` estável
(`RATE_LIMIT`, `QUOTA`, `SERVER`, `EMPTY_RESPONSE`, …). Retry, mensagem ao
usuário e estorno de crédito decidem pelo código, nunca pelo texto da mensagem.
Isso separa dois casos que compartilham o mesmo HTTP 429: throttling por minuto,
que vale repetir, e saldo esgotado, que falha igual em toda tentativa. O backoff
é exponencial com teto e jitter simétrico, e respeita o `RetryInfo`/`Retry-After`
que a API devolve — se o provedor pedir mais que o teto, o app desiste e avisa em
vez de deixar o usuário esperando.

> O desenho dessa camada foi adaptado do
> [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness) (MIT),
> especificamente de `@deepseek-ai/dsh-llm`: a regra de rotear por código e não
> por mensagem, a política de backoff e a distinção entre cota terminal e
> throttling transitório. A configuração de lint, os hooks de git e a estrutura
> do CI vieram do mesmo repositório.

**Créditos.** O custo total é debitado antes de começar, para a confirmação
mostrar um valor exato, e devolvido por cena que falhar. Cenas com erro podem ser
refeitas isoladamente, pagando só por elas.

**Montagem no navegador.** Não há encoder no servidor. Os clipes tocam em dois
elementos `<video>` alternados, são compostos em um `<canvas>` com
*cross-dissolve* e gravados via `MediaRecorder`; o áudio segue o mesmo caminho
por dois `GainNode`. O contêiner de saída é escolhido por
`MediaRecorder.isTypeSupported` (WebM VP9 quando disponível, MP4 como fallback).
Ver [`services/videoMerger.ts`](services/videoMerger.ts).

## A interface

Um workspace de cinco etapas — Persona, Campanha, Roteiro, Produção, Entrega —
todas sempre navegáveis. Dá para voltar e trocar a foto do produto depois de ler
o roteiro sem perder nada; antes o formulário sumia por completo e a única volta
era `Novo Projeto`, que apagava o trabalho todo.

A barra fixa embaixo diz sempre uma de duas coisas: o que falta para avançar
("Envie a imagem do produto") ou o que a ação vai fazer, com o custo
("Renderizar 6 cenas · 30 créditos"). Botão desabilitado sem explicação era o
padrão anterior.

Os tokens visuais vivem em [`index.css`](index.css) e são expostos ao Tailwind
em [`tailwind.config.js`](tailwind.config.js). Um acento só (violeta),
superfícies opacas em vez de vidro empilhado, nada de texto abaixo de 13px e
nenhuma cor de texto abaixo de 4.5:1 de contraste.

## Estrutura

```
App.tsx                    Estado do projeto, pipeline e navegação por etapas
constants.ts               Custos, limites, timeouts e concorrência
types.ts                   Tipos compartilhados
services/geminiService.ts  Os 7 agentes e o laço de retry
services/failures.ts       Taxonomia de falhas, backoff e mensagens ao usuário
services/failures.spec.ts  Testes da taxonomia e da política de retry
services/videoMerger.ts    Montagem do corte final (canvas + MediaRecorder)
services/briefingPdf.ts    Export do briefing em PDF (carregado sob demanda)
utils/files.ts             Conversões de arquivo e limitador de concorrência
components/ui.tsx          Primitivas: Button, Panel, Field, Toggle, Badge…
components/Stepper.tsx     Navegação por etapas e a barra de ação fixa
components/ImageUpload.tsx Upload com label, foco visível e drag-and-drop
components/steps/          Uma etapa do fluxo por arquivo
```

## Limitações conhecidas

- **Créditos são locais.** `INITIAL_CREDITS` é apenas um contador em memória,
  persistido junto com o projeto. Não há cobrança nem servidor.
- **Os clipes não sobrevivem ao reload.** Salvar o projeto guarda textos e
  imagens no `localStorage`, mas vídeos são blobs em memória — ao recarregar, as
  cenas voltam para "pendente".
- **A análise por URL não abre o link.** O modelo não navega; ele infere as
  diretrizes a partir da plataforma e do perfil na URL. Para uma análise fiel,
  envie o arquivo de vídeo — aí o Omni assiste de verdade. O texto gerado é
  editável antes de entrar no roteiro nos dois casos.
- **A montagem roda em tempo real.** Unir 6 clipes de 8s leva cerca de 48s,
  porque a gravação acompanha a reprodução.
