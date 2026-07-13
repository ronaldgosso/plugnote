/**
 * Real-time audio visualizer using the Web Audio API AnalyserNode.
 * Reads frequency-domain data from the audio element and paints
 * gradient bars onto a canvas element in a requestAnimationFrame loop.
 */

export interface Visualizer {
  analyser: AnalyserNode;
  context: AudioContext;
  cleanup: () => void;
}

/**
 * Attaches an AnalyserNode to the given HTMLAudioElement.
 * Returns a Visualizer handle, or null if the browser doesn't support it.
 *
 * NOTE: The AudioContext is started on user gesture (play button click),
 * so it will never be blocked by autoplay policies.
 */
export function createVisualizer(audio: HTMLAudioElement): Visualizer | null {
  try {
    const context = new AudioContext();
    const analyser = context.createAnalyser();
    // fftSize 64 → 32 frequency bins; fast enough for 60fps animation
    analyser.fftSize = 64;
    // Smooth out fast transients so bars don't flicker
    analyser.smoothingTimeConstant = 0.78;

    const source = context.createMediaElementSource(audio);
    source.connect(analyser);
    analyser.connect(context.destination);

    return {
      analyser,
      context,
      cleanup: () => {
        try {
          source.disconnect();
          analyser.disconnect();
          context.close();
        } catch (_) { /* ignore disconnect-after-close errors */ }
      },
    };
  } catch (err) {
    console.error("[Visualizer] Failed to create AudioContext:", err);
    return null;
  }
}

/**
 * Starts a requestAnimationFrame draw loop that reads the AnalyserNode
 * frequency data and paints violet→pink gradient bars on the canvas.
 *
 * @param analyser  The AnalyserNode from createVisualizer()
 * @param canvas    The target <canvas> element
 * @param rafRef    A ref object whose `.current` stores the RAF handle so the
 *                  caller can cancel the loop: cancelAnimationFrame(rafRef.current!)
 */
export function drawVisualizer(
  analyser: AnalyserNode,
  canvas: HTMLCanvasElement,
  rafRef: React.MutableRefObject<number | null>
): void {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const bufferLength = analyser.frequencyBinCount; // = fftSize / 2 = 32
  const dataArray = new Uint8Array(bufferLength);

  const render = () => {
    rafRef.current = requestAnimationFrame(render);
    analyser.getByteFrequencyData(dataArray);

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Each bar occupies equal width; leave 1px gap between bars
    const barW = Math.floor((canvas.width / bufferLength) * 1.8);
    const gap = 1;
    let x = 0;

    for (let i = 0; i < bufferLength; i++) {
      // Normalize to [0, 1] and apply a gentle curve so quiet audio is still visible
      const normalized = Math.pow(dataArray[i] / 255, 0.85);
      const barH = Math.max(2, normalized * canvas.height);

      const gradient = ctx.createLinearGradient(0, canvas.height, 0, canvas.height - barH);
      gradient.addColorStop(0, "rgba(109, 40, 217, 0.95)");   // deep violet base
      gradient.addColorStop(0.5, "rgba(139, 92, 246, 0.85)"); // violet mid
      gradient.addColorStop(1, "rgba(236, 72, 153, 0.75)");   // pink top

      ctx.fillStyle = gradient;

      // Rounded top corners on the bars
      const radius = Math.min(2, barW / 2);
      ctx.beginPath();
      ctx.moveTo(x + radius, canvas.height - barH);
      ctx.lineTo(x + barW - radius, canvas.height - barH);
      ctx.quadraticCurveTo(x + barW, canvas.height - barH, x + barW, canvas.height - barH + radius);
      ctx.lineTo(x + barW, canvas.height);
      ctx.lineTo(x, canvas.height);
      ctx.lineTo(x, canvas.height - barH + radius);
      ctx.quadraticCurveTo(x, canvas.height - barH, x + radius, canvas.height - barH);
      ctx.closePath();
      ctx.fill();

      x += barW + gap;
    }
  };

  render();
}
