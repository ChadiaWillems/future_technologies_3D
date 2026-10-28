import { reactive, watch } from 'vue'
import { PLACES } from './liveData'
import type { Place } from './liveData'

/** Default size of the rain barrel in litres */
export const BARREL_LITERS = 300

// Shared by the 3D scene (Landscape.vue) and the on-screen panels (App.vue)
export const water = reactive({
  raining: false,
  capacity: BARREL_LITERS, // barrel size in litres (slider)
  fill: 0, // barrel level as a share of the capacity, 0..1
  used: 0, // litres taken out of the barrel by taps, toilet and household use
  overflowed: 0, // litres that did not fit and ran over the rim
  usage: 0, // steady household use in litres per hour (slider)
  garden: 0.35, // garden health, 0..1
  cutaway: false, // see-through house
  gardenTap: false,
  sinkTap: false,
  draining: false, // the drain valve is open: the barrel is being emptied onto the ground
  flushT: 0, // seconds left of the toilet flush (pump runs meanwhile)
})

// A bigger or smaller barrel holds the same water it held before; what no longer fits spills over
watch(() => water.capacity, (capacity, previous) => {
  const liters = water.fill * previous
  water.overflowed += Math.max(0, liters - capacity)
  water.fill = Math.min(1, liters / capacity)
})

// Real rainfall data (Open-Meteo) that drives the scene.
// "Manual" mode keeps the original behaviour: you click the cloud to make it rain.
export const live = reactive({
  enabled: false,
  status: 'idle' as 'idle' | 'loading' | 'ready' | 'error',
  message: '',
  place: PLACES[0] as Place, // any place on Earth: a preset, a search result or your own location
  following: true, // the time follows the real clock (live) until you set another moment
  playing: false, // time-lapse (1 hour of data = 6 seconds): only after "speel af"
  secondsPerHour: 6, // time-lapse: how many real seconds one hour of the data lasts
  time: 0, // the moment being shown, as a UTC timestamp in ms
  start: 0,
  end: 0,
})

// What the scene reacts to right now (filled in every frame by Landscape.vue)
export const env = reactive({
  sunAltitude: 35, // degrees above the horizon (only lights the scene)
  sunAzimuth: 146, // degrees clockwise from north
  moonAltitude: -30,
  moonAzimuth: 0,
  moonLit: 0.5,
  precipitation: 0, // mm per hour
  cloud: 0, // %
  inflow: 0, // litres per hour that the roof sends to the barrel
  timeLabel: '',
})

// Barrel level and rainfall over the simulated time, for the chart. A point with `gap` starts a new line segment.
export interface LevelPoint {
  t: number
  liters: number
  /** mm per hour at that moment */
  rain: number
  gap?: boolean
}
export const history = reactive({ points: [] as LevelPoint[] })

// In manual mode there is no data to follow, so the simulated time simply counts up from the start (in ms)
export const manualClock = reactive({ time: 0 })

const POINT_EVERY = 10 * 60_000
const MAX_POINTS = 1500
export function recordLevel(t: number, liters: number, rain: number) {
  const points = history.points
  const last = points[points.length - 1]
  if (!last) {
    points.push({ t, liters, rain })
    return
  }
  // time went backwards (scrubbed back, or the data looped): forget the part that is replaced
  if (t < last.t) {
    while (points.length && points[points.length - 1].t >= t) { points.pop() }
    points.push({ t, liters, rain, gap: true })
    return
  }
  if (t - last.t < POINT_EVERY) { return }
  // jumped far ahead: do not draw a line across the part that was skipped
  points.push({ t, liters, rain, gap: t - last.t > 3 * 3_600_000 })
  if (points.length > MAX_POINTS) { points.shift() }
}
export function clearHistory() {
  history.points.length = 0
}
