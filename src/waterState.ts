import { reactive } from 'vue'

export const BARREL_LITERS = 300

// Shared by the 3D scene (Landscape.vue) and the on-screen meter (App.vue)
export const water = reactive({
  raining: false,
  fill: 0, // barrel level, 0..1
  used: 0, // liters taken out of the barrel so far
  garden: 0.35, // garden health, 0..1
  cutaway: false, // see-through house
  gardenTap: false,
  sinkTap: false,
  flushT: 0, // seconds left of the toilet flush (pump runs meanwhile)
})

// Real weather data (Open-Meteo) and the sun/moon (SunCalc) that drive the scene.
// "Manual" mode keeps the original behaviour: you click the cloud to make it rain.
export const live = reactive({
  enabled: false,
  status: 'idle' as 'idle' | 'loading' | 'ready' | 'error',
  message: '',
  placeIndex: 0,
  playing: true,
  secondsPerHour: 6, // time-lapse: how many real seconds one hour of the data lasts
  time: 0, // the moment being shown, as a UTC timestamp in ms
  start: 0,
  end: 0,
})

// What the scene reacts to right now (filled in every frame by Landscape.vue)
export const env = reactive({
  sunAltitude: 35, // degrees above the horizon
  sunAzimuth: 146, // degrees clockwise from north
  moonAltitude: -30,
  moonAzimuth: 0,
  moonLit: 0.5,
  temperature: 14, // °C
  precipitation: 0, // mm per hour
  cloud: 0, // %
  wind: 2.5, // m/s
  windDirection: 250, // degrees the wind comes from
  radiation: 0, // W/m²
  solarWatts: 0,
  solarKWh: 0, // since local midnight
  timeLabel: '',
})
