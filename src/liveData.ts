import { getMoonIllumination, getMoonPosition, getPosition } from 'suncalc'

// Hourly rainfall and cloud cover from Open-Meteo (https://open-meteo.com, free, no API key, CC BY 4.0)
// and the sun/moon position from SunCalc (only used to light the scene), both for one place on Earth.

export interface Place {
  name: string
  lat: number
  lon: number
}

export const PLACES: Place[] = [
  { name: 'Brugge', lat: 51.209, lon: 3.225 },
  { name: 'Kortrijk', lat: 50.828, lon: 3.265 },
  { name: 'Brussel', lat: 50.847, lon: 4.357 },
  { name: 'Reykjavik', lat: 64.147, lon: -21.943 },
  { name: 'Madrid', lat: 40.417, lon: -3.704 },
  { name: 'Tromsø', lat: 69.649, lon: 18.956 },
  { name: 'Singapore', lat: 1.352, lon: 103.82 },
]

const HOURLY = ['precipitation', 'cloud_cover'] as const
type Variable = typeof HOURLY[number]

export interface WeatherData {
  place: Place
  utcOffsetSeconds: number
  /** Start of every hour as a UTC timestamp in ms */
  times: number[]
  values: Record<Variable, number[]>
}

export interface WeatherSample {
  precipitation: number // mm per hour
  cloud: number // 0..100 %
}

const CACHE_MINUTES = 30

// One day back is enough context, and two days ahead is what the free forecast gives reliably
function url(place: Place) {
  const params = new URLSearchParams({
    latitude: String(place.lat),
    longitude: String(place.lon),
    hourly: HOURLY.join(','),
    past_days: '1',
    forecast_days: '2',
    timezone: 'auto',
  })
  return `https://api.open-meteo.com/v1/forecast?${params}`
}

function readCache(key: string): any | null {
  try {
    const raw = localStorage.getItem(key)
    if (!raw) { return null }
    const { savedAt, json } = JSON.parse(raw)
    return Date.now() - savedAt < CACHE_MINUTES * 60_000 ? json : null
  }
  catch { return null }
}

function writeCache(key: string, json: unknown) {
  try { localStorage.setItem(key, JSON.stringify({ savedAt: Date.now(), json })) }
  catch { /* storage can be unavailable (private window); not needed */ }
}

export async function fetchWeather(place: Place): Promise<WeatherData> {
  const key = `open-meteo:rain:${place.lat},${place.lon}`
  let json = readCache(key)
  if (!json) {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 10_000)
    try {
      const response = await fetch(url(place), { signal: controller.signal })
      if (!response.ok) { throw new Error(`Open-Meteo antwoordde met status ${response.status}`) }
      json = await response.json()
    }
    finally { clearTimeout(timeout) }
    writeCache(key, json)
  }

  const offset: number = json.utc_offset_seconds ?? 0
  // Open-Meteo gives local times without an offset ("2026-10-27T14:00"); turn them into real UTC timestamps
  const times: number[] = json.hourly.time.map((t: string) => Date.parse(`${t}:00Z`) - offset * 1000)
  const values = {} as Record<Variable, number[]>
  for (const name of HOURLY) {
    let last = 0
    values[name] = json.hourly[name].map((v: number | null) => {
      last = v ?? last // a missing value keeps the previous one
      return last
    })
  }
  return { place, utcOffsetSeconds: offset, times, values }
}

/** Rain and clouds at any moment, interpolated between the two surrounding hours. */
export function sampleWeather(data: WeatherData, t: number): WeatherSample {
  const { times, values } = data
  const last = times.length - 1
  const clamped = Math.min(Math.max(t, times[0]), times[last])
  let i = Math.min(last - 1, Math.max(0, Math.floor((clamped - times[0]) / 3_600_000)))
  while (i < last - 1 && times[i + 1] <= clamped) { i++ }
  const f = (clamped - times[i]) / (times[i + 1] - times[i])
  const mix = (name: Variable) => values[name][i] + (values[name][i + 1] - values[name][i]) * f
  return { precipitation: Math.max(0, mix('precipitation')), cloud: mix('cloud_cover') }
}

export interface SkyState {
  /** Sun height above the horizon in degrees (negative = below) */
  sunAltitude: number
  /** Degrees clockwise from north */
  sunAzimuth: number
  moonAltitude: number
  moonAzimuth: number
  /** 0..1 */
  moonLit: number
}

export function skyAt(date: Date, place: Place): SkyState {
  const sun = getPosition(date, place.lat, place.lon)
  const moon = getMoonPosition(date, place.lat, place.lon)
  return {
    sunAltitude: sun.altitude,
    sunAzimuth: sun.azimuth,
    moonAltitude: moon.altitude,
    moonAzimuth: moon.azimuth,
    moonLit: getMoonIllumination(date).fraction,
  }
}

/** Local clock text for a UTC timestamp at this place, like "di 27 okt 14:30". */
export function formatLocal(data: WeatherData, t: number) {
  const date = new Date(t + data.utcOffsetSeconds * 1000)
  return new Intl.DateTimeFormat('nl-BE', {
    timeZone: 'UTC',
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(date)
}
