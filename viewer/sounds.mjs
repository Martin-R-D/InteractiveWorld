import { SOUNDS } from '../shared/sounds.mjs';
export { SOUNDS } from '../shared/sounds.mjs';
export function createSoundPlayer(
  makeContext = () => new (globalThis.AudioContext || globalThis.webkitAudioContext)()) {
  let context,
    muted = false,
    last = -Infinity;
  const voices = new Set();
  function stop() {
    for (const voice of voices) {
      try {
        voice.stop();
      } catch {}
    }
    voices.clear();
  }
  function unlock() {
    try {
      context ??= makeContext();
      if (context.state === 'suspended') context.resume().catch(() => {});
    } catch {}
  }
  return {
    unlock,
    stop,
    mute(value) {
      muted = value;
      if (muted) stop();
    },
    play(id) {
      if (muted || !Object.hasOwn(SOUNDS, id)) return;
      unlock();
      if (!context || context.state !== 'running') return;
      const now = context.currentTime;
      if (now - last <.08) return;
      last = now;
      stop();
      try {
        for (const [delay, start, end, duration, volume, waveform] of SOUNDS[id]) {
          const oscillator = context.createOscillator(),
            gain = context.createGain(),
            at = now + delay;
          oscillator.type = waveform ?? (id === 'squeak' ? 'triangle' : 'sine');
          oscillator.frequency.setValueAtTime(start, at);
          oscillator.frequency.exponentialRampToValueAtTime(end, at + duration);
          gain.gain.setValueAtTime(0, at);
          gain.gain.linearRampToValueAtTime(volume, at +.003);
          gain.gain.exponentialRampToValueAtTime(.0001, at + duration);
          oscillator.connect(gain);
          gain.connect(context.destination);
          voices.add(oscillator);
          oscillator.onended = () => {
            voices.delete(oscillator);
            oscillator.disconnect();
            gain.disconnect();
          };
          oscillator.start(at);
          oscillator.stop(at + duration +.01);
        }
      } catch {
        stop();
      }
    }};
}
