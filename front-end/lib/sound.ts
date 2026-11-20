const tones = {
  call: [[0, 880], [0.2, 1175]],
  "order-new": [[0, 660], [0.2, 880]],
  "order-ready": [[0, 784], [0.2, 1047], [0.4, 1319]],
  "order-overdue": [[0, 784], [0.2, 523], [0.4, 784]],
} as const;

let context: AudioContext | undefined;

export function unlockAlert() {
  try {
    context ??= new AudioContext();
    void context.resume().catch(() => {});
  } catch {
    // Sem áudio disponível.
  }
}

export function playAlert(...kinds: (keyof typeof tones)[]) {
  if (context?.state !== "running") return;
  const clock = context.currentTime;
  for (const [index, kind] of (kinds.length ? kinds : ["call"] as const).entries()) {
    for (const [start, hz] of tones[kind]) {
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.frequency.value = hz;
      gain.gain.value = 0.15;
      osc.connect(gain).connect(context.destination);
      const at = clock + index * 0.65 + start;
      osc.start(at);
      osc.stop(at + 0.15);
    }
  }
}
