# Influencer Labs — notas para agentes

SPA React 19 + Vite, 100% client-side, que gera campanhas UGC com Gemini e Veo.
Não há backend. Leia o [README](README.md) para o pipeline completo.

## Comandos

```sh
npm run lint        # oxlint
npm run typecheck   # tsc --noEmit (strict)
npm test            # vitest
npm run deadcode    # knip
npm run build       # typecheck + build
```

Antes de abrir PR, rode os quatro primeiros. O CI roda exatamente eles.

Hooks de git são opcionais: `npx lefthook install` liga lint/typecheck no
pre-commit e testes no pre-push.

## Invariantes

Coisas que já quebraram aqui e voltam a quebrar se forem desfeitas.

**A narração precisa chegar ao Veo.** O prompt de vídeo tem que terminar com
`She says in Brazilian Portuguese: "<narração>"`. Sem isso o vídeo sai mudo e
todo o roteiro vira decoração. Ver `optimizeVeoPrompt` e
`buildFallbackVeoPrompt` em `services/geminiService.ts`.

**Roteie por código, nunca por mensagem.** Todo erro passa por
`classifyFailure` (`services/failures.ts`) e vira um `FailureCode`. Não escreva
`if (msg.includes('quota'))` — adicione ou use um código. A distinção
QUOTA × RATE_LIMIT em particular decide se vale retentar.

**Nada de `class X extends Error` exportado no grafo do `@google/genai`.**
Rollup para de tree-shakear o SDK e o bundle cresce ~235 kB. Falhas são objetos
com `code`, por isso.

**Blob URLs são revogadas por efeito, não à mão.** `App.tsx` tem um efeito que
revoga toda URL rastreada que o estado não referencia mais. Não chame
`URL.revokeObjectURL` dentro de um state updater — o StrictMode invoca duas
vezes.

**O laço de render do merge é síncrono.** `services/videoMerger.ts` nunca dá
`await` dentro do `requestAnimationFrame`: isso congela o canvas capturado. O
próximo clipe é pré-carregado em paralelo e o laço só consulta a flag.

**Concorrência do Veo é limitada de propósito.** `VIDEO_RENDER_CONCURRENCY = 2`.
Disparar as 6 cenas juntas estoura a cota por minuto.

**Créditos são cobrados adiantado e estornados por cena que falha.** Se mexer em
`renderScenes`, mantenha as duas pontas.

**A UI é um workspace de etapas, não um wizard travado.** Toda etapa é sempre
navegável (`Stepper`); o que muda é o rodapé, que ou explica o bloqueio ou
nomeia a ação com o custo. Nunca desabilite um botão sem dizer por quê —
`blockedBy` em `App.tsx` existe para isso.

**Estilo vem dos tokens.** Cores, tipografia e raios vivem em `index.css` e
chegam ao Tailwind por `tailwind.config.js`. Não escreva hex direto no JSX, não
use texto abaixo de 13px (`text-xs` é o piso) e não crie um segundo acento.
Primitivas repetíveis ficam em `components/ui.tsx`.

## Convenções

- Comentários explicam *por quê*, não *o quê*. Se um trecho parece estranho,
  o comentário diz qual bug ele evita.
- Textos de UI em PT-BR. Prompts de modelo em PT-BR, exceto o corpo do prompt
  do Veo, que é em inglês (o modelo performa melhor) com a fala preservada em
  português.
- Supressão de lint precisa de justificativa na linha de cima.
- `any` só com motivo declarado.

## O que não fazer

- Não commitar `.env` (só `.env.example`).
- Não reintroduzir CDN em runtime. Tailwind é compilado no build; o app tem que
  funcionar offline depois de servido.
- Não mandar a API key em query string. Use header `x-goog-api-key`.
