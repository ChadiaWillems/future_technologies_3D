import { shallowRef } from 'vue'
import { fetchWeather, PLACES } from './liveData'
import type { WeatherData } from './liveData'
import { clearHistory, live, water } from './waterState'

export const weatherData = shallowRef<WeatherData | null>(null)

const clampTime = (t: number) => Math.min(Math.max(t, live.start), live.end)

// Load the data for a place and switch the scene over to it
export async function enableLive(placeIndex = live.placeIndex) {
  live.enabled = true
  live.status = 'loading'
  live.message = ''
  live.placeIndex = placeIndex
  try {
    const data = await fetchWeather(PLACES[placeIndex])
    // the user may have picked another place or switched back to manual while this was loading
    if (!live.enabled || live.placeIndex !== placeIndex) { return }
    weatherData.value = data
    live.start = data.times[0]
    live.end = data.times[data.times.length - 1]
    live.time = clampTime(Date.now())
    clearHistory()
    live.status = 'ready'
  }
  catch (error) {
    live.enabled = false
    live.status = 'error'
    live.message = `Could not load weather data (${error instanceof Error ? error.message : 'unknown error'}). Using manual mode.`
  }
}

export function disableLive() {
  live.enabled = false
  live.status = 'idle'
  water.raining = false
}

export function jumpToNow() {
  live.time = clampTime(Date.now())
}

// Start or stop rain by hand. In real-data mode this first switches to manual mode, so the click always does something.
export function toggleManualRain() {
  if (live.enabled) {
    disableLive()
    water.raining = true
    return
  }
  water.raining = !water.raining
}
