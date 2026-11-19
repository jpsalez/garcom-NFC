/** Cadência por prazo fixo: não acumula o atraso de cada requestAnimationFrame. */
export function createRenderBudget(lowPower: boolean) {
  const ceiling = lowPower ? 0.35 : 0.5;
  const floor = lowPower ? 0.25 : 0.3;
  const interval = 1000 / (lowPower ? 30 : 60);
  let scale = ceiling;
  let nextPaint: number | null = null;
  let previous: number | null = null;
  let samples = 0, sampleTime = 0, calmTime = 0;

  return {
    get scale() { return scale; },
    tick(time: number) {
      if (previous !== null) {
        const delta = time - previous;
        // Ignora pausas e tarefas isoladas; adapta apenas após uma janela de frames.
        if (delta > 0 && delta < 250) { sampleTime += delta; samples++; }
      }
      previous = time;
      if (sampleTime >= 1200) {
        const average = sampleTime / samples;
        if (average > interval * 1.45) {
          scale = Math.max(floor, +(scale - 0.05).toFixed(2));
          calmTime = 0;
        } else if (average < interval * 1.1) {
          calmTime += sampleTime;
          if (calmTime >= 6000) {
            scale = Math.min(ceiling, +(scale + 0.05).toFixed(2));
            calmTime = 0;
          }
        } else calmTime = 0;
        samples = 0; sampleTime = 0;
      }
      if (nextPaint === null) { nextPaint = time + interval; return true; }
      if (time + 0.5 < nextPaint) return false;
      nextPaint += (Math.floor((Math.max(0, time - nextPaint) + 0.5) / interval) + 1) * interval;
      return true;
    },
    reset() {
      nextPaint = previous = null;
      samples = sampleTime = calmTime = 0;
    },
  };
}
