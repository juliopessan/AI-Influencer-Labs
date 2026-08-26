/**
 * Stitches the rendered scene clips into a single file.
 *
 * There is no server-side encoder in this app, so the clips are played back
 * through two ping-ponging <video> elements, composited onto a canvas with a
 * cross-dissolve, and captured with MediaRecorder. Audio follows the same path
 * through a pair of gain nodes so the narration crossfades with the picture.
 */

export interface MergeOptions {
  /** Cross-dissolve length between clips, in milliseconds. */
  transitionMs: number;
  fps?: number;
  onProgress?: (stage: string) => void;
  signal?: AbortSignal;
}

export interface MergeResult {
  blob: Blob;
  /** Container actually produced, so the caller can pick the right extension. */
  mimeType: string;
}

const RECORDER_CANDIDATES = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
  'video/mp4;codecs=avc1.42E01E,mp4a.40.2',
  'video/mp4',
];

/** Picks the first container this browser can actually record. */
function pickRecorderMimeType(): string | undefined {
  if (typeof MediaRecorder === 'undefined') return undefined;
  return RECORDER_CANDIDATES.find((type) => MediaRecorder.isTypeSupported(type));
}

function isMergeSupported(): boolean {
  return (
    typeof MediaRecorder !== 'undefined' &&
    typeof HTMLCanvasElement !== 'undefined' &&
    typeof HTMLCanvasElement.prototype.captureStream === 'function'
  );
}

function loadVideo(element: HTMLVideoElement, url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const onReady = () => {
      cleanup();
      resolve();
    };
    const onError = () => {
      cleanup();
      reject(new Error('Não foi possível carregar um dos clipes gerados.'));
    };
    const cleanup = () => {
      element.removeEventListener('canplaythrough', onReady);
      element.removeEventListener('error', onError);
    };

    element.addEventListener('canplaythrough', onReady);
    element.addEventListener('error', onError);
    element.src = url;
    element.load();
  });
}

export async function mergeVideoClips(urls: string[], options: MergeOptions): Promise<MergeResult> {
  const { transitionMs, fps = 30, onProgress, signal } = options;

  if (urls.length === 0) {
    throw new Error('Não há clipes para unir.');
  }
  if (!isMergeSupported()) {
    throw new Error('Seu navegador não suporta a união de vídeos (MediaRecorder). Baixe as cenas individualmente.');
  }

  const mimeType = pickRecorderMimeType();
  if (!mimeType) {
    throw new Error('Seu navegador não suporta nenhum formato de gravação compatível.');
  }

  const transitionSec = transitionMs / 1000;
  const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
  const videoA = document.createElement('video');
  const videoB = document.createElement('video');

  // Everything allocated below is torn down here, on success and on failure
  // alike — a leaked AudioContext keeps the tab's audio hardware awake.
  const dispose = () => {
    for (const element of [videoA, videoB]) {
      element.pause();
      element.removeAttribute('src');
      element.load();
    }
    if (audioContext.state !== 'closed') void audioContext.close();
  };

  try {
    await audioContext.resume();
    onProgress?.('Preparando linha do tempo');

    for (const element of [videoA, videoB]) {
      // Must stay unmuted: a muted element feeds silence into
      // createMediaElementSource. Nothing reaches the speakers because the graph
      // ends at the recorder destination, never at audioContext.destination.
      element.muted = false;
      element.volume = 1;
      element.playsInline = true;
      element.preload = 'auto';
    }

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Não foi possível obter o contexto do canvas.');

    await loadVideo(videoA, urls[0]);
    canvas.width = videoA.videoWidth || 1280;
    canvas.height = videoA.videoHeight || 720;

    const audioDestination = audioContext.createMediaStreamDestination();
    const gainA = audioContext.createGain();
    const gainB = audioContext.createGain();
    audioContext.createMediaElementSource(videoA).connect(gainA).connect(audioDestination);
    audioContext.createMediaElementSource(videoB).connect(gainB).connect(audioDestination);

    const canvasStream = canvas.captureStream(fps);
    const combinedStream = new MediaStream([
      ...canvasStream.getVideoTracks(),
      ...audioDestination.stream.getAudioTracks(),
    ]);

    const recorder = new MediaRecorder(combinedStream, { mimeType });
    const recordedChunks: Blob[] = [];
    recorder.addEventListener('dataavailable', (event) => {
      if (event.data.size > 0) recordedChunks.push(event.data);
    });

    const recording = new Promise<Blob>((resolve, reject) => {
      recorder.addEventListener('stop', () => resolve(new Blob(recordedChunks, { type: mimeType })), { once: true });
      recorder.addEventListener('error', () => reject(new Error('Falha na gravação do vídeo final.')), { once: true });
    });

    let activeVideo = videoA;
    let incomingVideo = videoB;
    let activeGain = gainA;
    let incomingGain = gainB;
    let currentIndex = 0;

    // Preloading runs ahead of playback so the render loop never has to await —
    // awaiting inside requestAnimationFrame freezes the captured canvas.
    let nextReady = false;
    let preloadError: Error | null = null;

    const preloadNext = () => {
      const nextIndex = currentIndex + 1;
      if (nextIndex >= urls.length) return;
      nextReady = false;
      loadVideo(incomingVideo, urls[nextIndex])
        .then(() => {
          nextReady = true;
        })
        .catch((error: Error) => {
          preloadError = error;
        });
    };

    activeGain.gain.setValueAtTime(1, audioContext.currentTime);
    incomingGain.gain.setValueAtTime(0, audioContext.currentTime);

    recorder.start();
    await activeVideo.play();
    preloadNext();
    onProgress?.(`Compondo cena 1 de ${urls.length}`);

    let transitionStartedAt: number | null = null;
    let finished = false;

    await new Promise<void>((resolve, reject) => {
      const fail = (error: Error) => {
        finished = true;
        if (recorder.state !== 'inactive') recorder.stop();
        reject(error);
      };

      const render = () => {
        if (finished) return;

        if (signal?.aborted) {
          fail(new Error('União de vídeos cancelada.'));
          return;
        }
        if (preloadError) {
          fail(preloadError);
          return;
        }

        ctx.globalAlpha = 1;
        ctx.drawImage(activeVideo, 0, 0, canvas.width, canvas.height);

        const hasNext = currentIndex + 1 < urls.length;
        const duration = activeVideo.duration;
        const timeLeft = Number.isFinite(duration) ? duration - activeVideo.currentTime : Number.POSITIVE_INFINITY;

        // Start the cross-dissolve once the outgoing clip is within a
        // transition of its end and the next clip is decoded and ready.
        if (transitionStartedAt === null && hasNext && nextReady && timeLeft <= transitionSec) {
          transitionStartedAt = performance.now();
          const now = audioContext.currentTime;
          activeGain.gain.cancelScheduledValues(now);
          incomingGain.gain.cancelScheduledValues(now);
          activeGain.gain.setValueAtTime(1, now);
          activeGain.gain.linearRampToValueAtTime(0, now + transitionSec);
          incomingGain.gain.setValueAtTime(0, now);
          incomingGain.gain.linearRampToValueAtTime(1, now + transitionSec);
          void incomingVideo.play().catch((error) => fail(error as Error));
        }

        if (transitionStartedAt !== null) {
          const elapsed = (performance.now() - transitionStartedAt) / 1000;
          ctx.globalAlpha = Math.min(1, Math.max(0, elapsed / transitionSec));
          ctx.drawImage(incomingVideo, 0, 0, canvas.width, canvas.height);
          ctx.globalAlpha = 1;
        }

        if (activeVideo.ended) {
          if (!hasNext) {
            finished = true;
            // Let the last composited frame reach the recorder before stopping.
            setTimeout(() => {
              if (recorder.state !== 'inactive') recorder.stop();
              resolve();
            }, 150);
            return;
          }

          // The next clip may still be decoding if the transition never fired.
          // Hold on the last drawn frame rather than cutting to black.
          if (!nextReady) {
            requestAnimationFrame(render);
            return;
          }

          const previousVideo = activeVideo;
          const previousGain = activeGain;
          activeVideo = incomingVideo;
          activeGain = incomingGain;
          incomingVideo = previousVideo;
          incomingGain = previousGain;

          currentIndex++;
          transitionStartedAt = null;

          incomingVideo.pause();
          incomingVideo.currentTime = 0;

          const now = audioContext.currentTime;
          activeGain.gain.cancelScheduledValues(now);
          incomingGain.gain.cancelScheduledValues(now);
          activeGain.gain.setValueAtTime(1, now);
          incomingGain.gain.setValueAtTime(0, now);

          // Normally the new active clip is already rolling from the
          // cross-dissolve; if the transition was skipped, start it now.
          if (activeVideo.paused) {
            void activeVideo.play().catch((error) => fail(error as Error));
          }

          onProgress?.(`Compondo cena ${currentIndex + 1} de ${urls.length}`);
          preloadNext();
        }

        requestAnimationFrame(render);
      };

      requestAnimationFrame(render);
    });

    onProgress?.('Finalizando');
    const blob = await recording;
    if (blob.size === 0) {
      throw new Error('O vídeo final ficou vazio. Tente novamente.');
    }
    return { blob, mimeType };
  } finally {
    dispose();
  }
}
