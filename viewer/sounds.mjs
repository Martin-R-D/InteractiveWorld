// Fixed local effects: generated scene code never receives audio capabilities.
export const SOUNDS = Object.freeze({
  'pen-click': [
    [0, 1800, 700,.035,.18],
    [.055, 1100, 400,.045,.13]],
  'switch-click': [[0, 1100, 250,.045,.16]],
  squeak:[[0,700,1800,.12,.12],[.12,1800,650,.15,.1]],
 bell:[[0,1400,1400,.65,.12],[0,2100,2100,.4,.05]],
 tap:[[0,420, 120,.075,.16]],
  rattle: [
    [0, 1700, 500,.035,.1],
    [.07, 1200, 400,.035,.1],
    [.14, 1900, 700,.035,.1]]
});
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
        for (const [delay, start, end, duration, volume] of SOUNDS[id]) {
          const oscillator = context.createOscillator(),
            gain = context.createGain(),
            at = now + delay;
          oscillator.type = id === 'squeak' ? 'triangle' : 'sine';
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
