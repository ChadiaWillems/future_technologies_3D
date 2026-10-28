import { shallowRef } from 'vue'
import { fetchWeather, samePlace, windowFor } from './liveData'
import type { Place, WeatherData } from './liveData'
import { clearHistory, live, manualClock, water } from './waterState'

export const weatherData = shallowRef<WeatherData | null>(null)

const clampTime = (t: number) => Math.min(Math.max(t, live.start), live.end)

// Load the data for a place and switch the scene over to it
export async function enableLive(place: Place = live.place) {
  live.enabled = true
  live.status = 'loading'
  live.message = ''
  live.place = place
  try {
    const data = await fetchWeather(place)
    // the user may have picked another place or switched back to manual while this was loading
    if (!live.enabled || !samePlace(live.place, place)) { return }
    weatherData.value = data
    const window = windowFor(data)
    live.start = window.start
    live.end = window.end
    live.time = clampTime(Date.now())
    live.following = true
    live.playing = false
    clearHistory()
    live.status = 'ready'
  }
  catch (error) {
    live.enabled = false
    live.status = 'error'
    live.message = `Could not load weather data (${error instanceof Error ? error.message : 'unknown error'}). Using manual mode.`
  }
}

/** Ask the browser for where you are. Only an explicit click calls this, and the browser asks permission. */
export function currentPosition(): Promise<Place> {
  return new Promise((resolve, reject) => {
    if (!('geolocation' in navigator)) {
      reject(new Error('Deze browser kan je locatie niet opvragen.'))
      return
    }
    navigator.geolocation.getCurrentPosition(
      position => resolve({ name: 'Mijn locatie', lat: position.coords.latitude, lon: position.coords.longitude }),
      () => reject(new Error('Je locatie is niet beschikbaar of de toestemming is geweigerd.')),
      { timeout: 10_000 },
    )
  })
}

export function disableLive() {
  live.enabled = false
  live.status = 'idle'
  water.raining = false
  // the manual chart starts over
  clearHistory()
  manualClock.time = 0
}

/** Back to the real, current time, which keeps following the clock */
export function followLive() {
  live.playing = false
  live.following = true
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
