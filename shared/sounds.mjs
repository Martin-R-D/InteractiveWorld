// Fixed local synthesis notes: delay, start Hz, end Hz, duration, gain, optional waveform.
export const SOUNDS = Object.freeze({
  'pen-click': [
    [0, 1800, 700,.035,.18],
    [.055, 1100, 400,.045,.13]],
  'switch-click': [[0, 1100, 250,.045,.16]],
  squeak:[[0,700,1800,.12,.12],[.12,1800,650,.15,.1]],
 bell: [[0,1400,1400,.65,.12],[0,2100,2100,.4,.05]],
 tap:[[0,420,120,.075,.16]],
 rattle:[[0,1700,500,.035,.1],[.07,1200,400,.035,.1],[.14,1900,700,.035,.1]],
 knock:[[0,220,90,.09,.16],[.14,220,90,.09,.14]],
 pop:[[0,550,80,.09,.16]],
 boing:[[0,170,650,.12,.12,'triangle'],[.12,650,130,.3,.1,'triangle']],
 chime:[[0,1047,1047,.5,.1],[.1,1319,1319,.5,.08],[.2,1568,1568,.55,.06]],
 beep:[[0,880,880,.12,.1]],
 buzz:[[0,120,125,.35,.045, 'sawtooth']],
  tick: [[0, 2400, 900,.018,.11]],
  clink:[[0,2600,2600,.18,.09],[0,3700,3700,.12,.04]],
 thud:[[0,110, 35,.16,.16]],
  pluck: [
    [0, 440, 430,.28,.14, 'triangle'],
    [0, 880, 860,.12,.04]],
  drum: [
    [0, 180, 50,.16,.17],
    [0, 360, 80,.05,.06]],
  horn: [
    [0, 350, 350,.3,.055, 'sawtooth'],
    [0, 440, 440,.3,.04, 'sawtooth']],
  whistle: [
    [0, 1300, 2100,.18,.09],
    [.18, 2100, 1700,.2,.07]],
  drip: [
    [0, 900, 1900,.055,.1],
    [.055, 1900, 650,.1,.07]],
  hoofbeats: [
    [0, 240, 90,.065,.14],
    [.1, 330, 130,.055,.12],
    [.3, 240, 90,.065,.14],
    [.4, 330, 130,.055,.12]]
});

export const SOUND_USES = Object.freeze({
  'pen-click': 'retractable pens and small push mechanisms',
  'switch-click': 'lamp switches, buttons and latches',
  squeak: 'rubber ducks and squeeze toys',
  bell: 'bicycle bells and small handbells',
  tap: 'light taps on solid objects',
  rattle: 'shakers, keys and loose small parts',
  knock: 'wooden doors, boxes and furniture',
  pop: 'toy bubbles, suction cups and popping lids',
  boing: 'springs, bouncing toys and elastic objects',
  chime: 'wind chimes and musical ornaments',
  beep: 'electronic buttons, timers and toy robots',
  buzz: 'short electric razor, toothbrush or toy motor activation',
  tick: 'clock ticks and small mechanical steps',
  clink: 'glass, ceramic mugs, coins and metal utensils touching',
  thud: 'soft heavy impacts, cushions and landing objects',
  pluck: 'guitar strings, rubber bands and string instruments',
  drum: 'drums and tapping hollow containers',
  horn: 'toy horns and vehicle horns',
  whistle: 'whistles and toy trains',
  drip: 'a single water drop from a tap or bottle',
  hoofbeats: 'a short stylized walking action for horse figures; not a neigh'
});
export const SOUND_IDS = Object.freeze(Object.keys(SOUNDS));
