import test from 'node:test';
import assert from 'node:assert/strict';
import { createSoundPlayer, SOUNDS } from '../viewer/sounds.mjs';
import { actionSchema } from '../shared/contract.mjs';
test('sound metadata is optional and accepts only the local catalog', () => {
  assert.ok(actionSchema.safeParse({ id: 'click', label: 'Click' }).success);
  for (const sound of Object.keys(SOUNDS))
    assert.ok(actionSchema.safeParse({ id: 'click', label: 'Click', sound }).success);
  for (const sound of ['https://example.com/audio.mp3', 'unknown', '', null])
    assert.equal(actionSchema.safeParse({ id: 'click', label: 'Click', sound }).success, false);
});
test('sounds are bounded, silent by default, throttled and stopped when muted', () => {
  let started = 0,
    stopped = 0;
  const param = {
    setValueAtTime() {},
    linearRampToValueAtTime() {},
    exponentialRampToValueAtTime() {}};
  const context = {
    state: 'running',
    currentTime: 1,
    destination: {},
    createGain: () => ({ gain: param, connect() {}, disconnect() {} }),
    createOscillator: () => ({
      frequency: param,
      connect() {},
      disconnect() {},
      start() {
        started++;
      },
      stop() {
        stopped++;
      }})};
  const player = createSoundPlayer(() => context);
  player.play();
  player.play('unknown');
  assert.equal(started, 0);
  player.play('pen-click');
  assert.equal(started, 2);
  player.play('pen-click');
  assert.equal(started, 2);
  player.mute(true);
  assert.ok(stopped >= 4);
  context.currentTime = 2;
  player.play('bell');
  assert.equal(started, 2);
  player.mute(false);
  player.play('bell');
  assert.equal(started, 4);
  for (const notes of Object.values(SOUNDS))
    for (const [delay, start, end, duration, volume] of notes) {
      assert.ok(delay + duration < 1);
      assert.ok(volume <=.18);
      assert.ok(start > 0 && end > 0);
    }
});
test('unavailable audio does not break object interactions', () => {
  const player = createSoundPlayer(() => {
    throw new Error('No audio');
  });
  assert.doesNotThrow(() => player.play('pen-click'));
});

test('every catalog effect schedules valid bounded audio and has selection guidance', async () => {
  const { SOUND_IDS, SOUND_USES } = await import('../shared/sounds.mjs');
  assert.equal(SOUND_IDS.length, 21);
  assert.deepEqual(Object.keys(SOUND_USES).sort(), [...SOUND_IDS].sort());
  for (const id of SOUND_IDS) {
    let starts = 0;
    const param = {
      setValueAtTime(v, t) {
        assert.ok(Number.isFinite(v) && t >= 0);
      },
      linearRampToValueAtTime(v, t) {
        assert.ok(Number.isFinite(v) && t >= 0);
      },
      exponentialRampToValueAtTime(v, t) {
        assert.ok(v > 0 && t >= 0);
      }};
    const context = {
      state: 'running',
      currentTime: 1,
      destination: {},
      createGain: () => ({ gain: param, connect() {}, disconnect() {} }),
      createOscillator: () => ({
        frequency: param,
        connect() {},
        disconnect() {},
        start() {
          assert.ok(['sine', 'triangle', 'sawtooth'].includes(this.type));
          starts++;
        },
        stop() {}})};
    createSoundPlayer(() => context).play(id);
    assert.equal(starts, SOUNDS[id].length, id);
    assert.ok(SOUNDS[id].length <= 4);
    assert.ok(SOUND_USES[id].length > 0);
  }
});
