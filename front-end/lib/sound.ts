// Alerta sonoro do balcão (DEC-10): dois bipes curtos. O navegador só libera o som depois de um clique na página;
// se estiver bloqueado, falha em silêncio.
let context: AudioContext | undefined;

export function playAlert() {
  try {
    context ??= new AudioContext();
    void context.resume();
    for (const [start, hz] of [[0, 880], [0.2, 1175]]) {
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.frequency.value = hz;
      gain.gain.value = 0.15;
      osc.connect(gain).connect(context.destination);
      osc.start(context.currentTime + start);
      osc.stop(context.currentTime + start + 0.15);
    }
  } catch {
    // sem áudio disponível
  }
}
