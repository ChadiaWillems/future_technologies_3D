<script setup lang="ts">
import { useLoop, useTres } from '@tresjs/core/webgpu'
import { Color, Fog, Object3D } from 'three'
import { computed, ref, watch } from 'vue'
import { weatherData } from '../liveController'
import { formatLocal, radiationSinceMidnight, sampleWeather, skyAt } from '../liveData'
import { createSky, createSolarTexture, createTextures } from '../textures'
import { BARREL_LITERS, env, live, water } from '../waterState'

const tex = createTextures()
const sky = createSky()
const solarTex = createSolarTexture()

// The house is built at its original size in a group, then scaled up by H
const H = 1.25
const CENTER_X = -3

// Rain falls inside this area under the cloud (house is centered at x = -3, z = 0)
const RAIN_SIZE = 7
const CLOUD_BOTTOM = 7
const DROP_COUNT = 280

// Roof is a 4-sided pyramid (scaled by H)
const ROOF_BASE = 2 * H
const ROOF_HEIGHT = 2 * H
const ROOF_HALF = (3 / Math.SQRT2) * H
const SLIDE_SPEED = 1.5

// Gutter is a square ring just outside the roof edge; water flows to the drain corner
const GUTTER_HALF = 2.25 * H
const GUTTER_Y = 1.95 * H
const GUTTER_SPEED = 2.5
const DRAIN_X = CENTER_X + GUTTER_HALF
const DRAIN_Z = GUTTER_HALF

// Rain barrel stands next to the house under the downspout (not scaled with the house)
const BARREL_SCALE = 1.5
const BARREL_X = DRAIN_X + 0.2
const BARREL_Z = DRAIN_Z + 0.1
const BARREL_RADIUS = 0.5 * BARREL_SCALE
const BARREL_RIM = BARREL_SCALE
const WATER_BASE = 0.04
const WATER_HEIGHT = 0.96
const FILL_PER_DROP = 0.004
const PUDDLE_PER_DROP = 0.002
const PIPE_SPEED = 5
const OVERFLOW_SPEED = 0.8
const OVERFLOW_FALL = 2

// Using the water (fractions of a full barrel)
const GARDEN_TAP_RATE = 0.05 // per second
const GARDEN_GAIN = 3 // garden health per fill taken
const SINK_RATE = 0.02 // per second
const FLUSH_COST = 0.03

// Garden tap sits on the barrel, pointing at the garden bed
const TAP_X = BARREL_X + 0.85
const TAP_Y = 0.3
const TAP_DROPS = 30
const TAP_FALL_TIME = 0.24

// Rain that lands on the roof ends up in the barrel (1 mm on 1 m² is 1 litre)
const ROOF_AREA = (2 * ROOF_HALF) ** 2
const RUNOFF = 0.8
const RAIN_THRESHOLD = 0.05 // mm per hour that counts as "raining"

// Solar panels on the south roof face: 5 panels of 0.75 x 0.7 (before scaling by H)
const PANEL_AREA = 5 * 0.75 * 0.7 * H * H
const PANEL_EFFICIENCY = 0.2
const ROOF_SLOPE = Math.atan(2 / (3 / Math.SQRT2))
const solarPanels = [
  { x: -0.8, z: 1.82 },
  { x: 0, z: 1.82 },
  { x: 0.8, z: 1.82 },
  { x: -0.4, z: 1.22 },
  { x: 0.4, z: 1.22 },
].map(({ x, z }) => {
  const surface = 2 + 2 * (1 - z / (3 / Math.SQRT2))
  // lift the panel 2 cm above the roof, along the roof's normal
  return { p: [x, surface + 0.02 * Math.cos(ROOF_SLOPE), z + 0.02 * Math.sin(ROOF_SLOPE)] as [number, number, number] }
})

const STAR_COUNT = 400

// True while real weather data is loaded and driving the scene
const liveOn = computed(() => live.enabled && live.status === 'ready' && weatherData.value !== null)

// Wind pushes the falling rain sideways (units per second)
let windVx = 0
let windVz = 0
const puddle = ref(0)
const cistern = ref(1) // water level in the toilet cistern, 0..1
const weather = ref(0) // 0 = sunny, 1 = rainy (eases toward the current weather)
const wet = ref(0) // how wet the surfaces are, 0..1 (dries slowly after the rain)

type DropState = 'falling' | 'sliding' | 'gutter' | 'pipe' | 'overflow'

// Plain data for each drop; the meshes in the template follow these values
const dropData = Array.from({ length: DROP_COUNT }, () => ({
  x: CENTER_X + (Math.random() - 0.5) * RAIN_SIZE,
  y: Math.random() * CLOUD_BOTTOM,
  z: (Math.random() - 0.5) * RAIN_SIZE,
  speed: 6 + Math.random() * 3,
  state: 'falling' as DropState,
  axis: 'z' as 'x' | 'z',
  sign: 1,
  angle: 0,
  radius: 0,
}))
const drops = ref<any[]>([])

const tapDropData = Array.from({ length: TAP_DROPS }, () => ({ t: Math.random() * TAP_FALL_TIME }))
const tapDrops = ref<any[]>([])

// Height where a drop should stop: on the roof if it is above it, otherwise the ground
function surfaceHeight(x: number, z: number) {
  const distance = Math.max(Math.abs(x - CENTER_X), Math.abs(z))
  if (distance > ROOF_HALF) { return 0 }
  return ROOF_BASE + ROOF_HEIGHT * (1 - distance / ROOF_HALF)
}

function respawn(drop: typeof dropData[number]) {
  drop.state = 'falling'
  drop.x = CENTER_X + (Math.random() - 0.5) * RAIN_SIZE
  drop.z = (Math.random() - 0.5) * RAIN_SIZE
  drop.y = CLOUD_BOTTOM
}

const clamp = (value: number, limit: number) => Math.min(Math.max(value, -limit), limit)

// Objects are made of several meshes, so one click can fire more than once.
// Ignore the extra events so one click only counts once.
function onceOnClick(action: () => void) {
  let last = 0
  return () => {
    const now = performance.now()
    if (now - last < 200) { return }
    last = now
    action()
  }
}

const toggleRain = onceOnClick(() => {
  if (live.enabled) { return } // in real-data mode the weather comes from Open-Meteo
  water.raining = !water.raining
})
const toggleGardenTap = onceOnClick(() => { water.gardenTap = water.gardenTap ? false : water.fill > 0 })
const toggleSinkTap = onceOnClick(() => {
  if (!water.cutaway) { return }
  water.sinkTap = water.sinkTap ? false : water.fill > 0
})
const flush = onceOnClick(() => {
  if (!water.cutaway || water.fill <= 0) { return }
  drain(FLUSH_COST)
  water.flushT = 1.5
  cistern.value = 0.1
})

function setCursor(cursor: string) {
  document.body.style.cursor = cursor
}

// Take water out of the barrel; returns how much was actually available
function drain(amount: number) {
  const taken = Math.min(water.fill, amount)
  water.fill -= taken
  water.used += taken * BARREL_LITERS
  return taken
}

function updateDrop(drop: typeof dropData[number], delta: number) {
  if (drop.state === 'falling') {
    drop.y -= drop.speed * delta
    drop.x += windVx * delta
    drop.z += windVz * delta
    const surface = surfaceHeight(drop.x, drop.z)
    if (drop.y >= surface) { return }
    if (surface === 0) {
      respawn(drop)
      return
    }
    // Hit the roof: slide down the face it landed on
    const dx = drop.x - CENTER_X
    drop.axis = Math.abs(drop.z) >= Math.abs(dx) ? 'z' : 'x'
    drop.sign = (drop.axis === 'z' ? drop.z : dx) >= 0 ? 1 : -1
    drop.state = 'sliding'
    drop.y = surface
  }
  else if (drop.state === 'sliding') {
    drop[drop.axis] += drop.sign * SLIDE_SPEED * delta
    const offset = drop.axis === 'z' ? drop.z : drop.x - CENTER_X
    if (Math.abs(offset) >= ROOF_HALF) {
      // Over the edge: land in the gutter on that side
      drop.state = 'gutter'
      drop.y = GUTTER_Y
      if (drop.axis === 'z') {
        drop.z = drop.sign * GUTTER_HALF
        drop.x = CENTER_X + clamp(drop.x - CENTER_X, GUTTER_HALF)
      }
      else {
        drop.x = CENTER_X + drop.sign * GUTTER_HALF
        drop.z = clamp(drop.z, GUTTER_HALF)
      }
    }
    else {
      drop.y = surfaceHeight(drop.x, drop.z)
    }
  }
  else if (drop.state === 'gutter') {
    // Flow around the ring toward the drain corner (front right)
    const step = GUTTER_SPEED * delta
    const u = drop.x - CENTER_X
    const eps = 0.001
    if (u >= GUTTER_HALF - eps && drop.z < GUTTER_HALF - eps) {
      drop.z = Math.min(drop.z + step, GUTTER_HALF)
    }
    else if (u <= -GUTTER_HALF + eps && drop.z < GUTTER_HALF - eps) {
      drop.z = Math.min(drop.z + step, GUTTER_HALF)
    }
    else {
      drop.x = Math.min(drop.x + step, DRAIN_X)
    }
    if (drop.x >= DRAIN_X - eps && drop.z >= DRAIN_Z - eps) {
      drop.state = 'pipe'
      drop.x = DRAIN_X
      drop.z = DRAIN_Z
    }
  }
  else if (drop.state === 'pipe') {
    // Down the downspout into the barrel
    drop.y -= PIPE_SPEED * delta
    if (drop.y <= BARREL_SCALE * (WATER_BASE + WATER_HEIGHT * water.fill)) {
      if (water.fill < 1) {
        // with real data the barrel is filled from the measured rainfall instead (see updateEnvironment)
        if (!liveOn.value) { water.fill = Math.min(1, water.fill + FILL_PER_DROP) }
        respawn(drop)
      }
      else {
        // Barrel is full: the water spills over a random spot of the rim
        drop.state = 'overflow'
        drop.angle = Math.random() * Math.PI * 2
        drop.radius = BARREL_RADIUS - 0.15
        drop.y = BARREL_RIM + 0.02
      }
    }
  }
  else if (drop.state === 'overflow') {
    // Slide across the water surface, curl over the lip, then run down the outside wall
    const wallRadius = BARREL_SCALE * 0.45 + 0.05 * drop.y + 0.03
    if (drop.radius < wallRadius || drop.y > BARREL_RIM) {
      drop.radius = Math.min(drop.radius + OVERFLOW_SPEED * delta, wallRadius)
      if (drop.radius >= BARREL_RADIUS) { drop.y -= OVERFLOW_SPEED * delta }
    }
    else {
      drop.y -= OVERFLOW_FALL * delta
      drop.radius = BARREL_SCALE * 0.45 + 0.05 * drop.y + 0.03
    }
    drop.x = BARREL_X + Math.cos(drop.angle) * drop.radius
    drop.z = BARREL_Z + Math.sin(drop.angle) * drop.radius
    if (drop.y <= 0.02) {
      puddle.value = Math.min(1, puddle.value + PUDDLE_PER_DROP)
      respawn(drop)
    }
  }
}

const DEG = Math.PI / 180
const smooth = (edge0: number, edge1: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - edge0) / (edge1 - edge0)))
  return t * t * (3 - 2 * t)
}

// Fill `env` with what the scene should react to: real data when it is loaded, the old manual behaviour otherwise
function updateEnvironment(delta: number) {
  const data = weatherData.value
  if (liveOn.value && data) {
    const hours = live.playing ? delta / live.secondsPerHour : 0
    if (live.playing) {
      live.time += hours * 3_600_000
      if (live.time > live.end) { live.time = live.start }
    }
    const w = sampleWeather(data, live.time)
    const astro = skyAt(new Date(live.time), data.place)
    env.sunAltitude = astro.sunAltitude
    env.sunAzimuth = astro.sunAzimuth
    env.moonAltitude = astro.moonAltitude
    env.moonAzimuth = astro.moonAzimuth
    env.moonLit = astro.moonLit
    env.temperature = w.temperature
    env.precipitation = w.precipitation
    env.cloud = w.cloud
    env.wind = w.wind
    env.windDirection = w.windDirection
    env.radiation = w.radiation
    env.solarWatts = w.radiation * PANEL_AREA * PANEL_EFFICIENCY
    env.solarKWh = (radiationSinceMidnight(data, live.time) * PANEL_AREA * PANEL_EFFICIENCY) / 1000
    env.timeLabel = formatLocal(data, live.time)

    water.raining = w.precipitation >= RAIN_THRESHOLD
    // the measured rain on the roof runs into the barrel (only while the time-lapse is playing)
    water.fill = Math.min(1, water.fill + (w.precipitation * hours * ROOF_AREA * RUNOFF) / BARREL_LITERS)
  }
  else {
    env.sunAltitude = 35
    env.sunAzimuth = 146
    env.moonAltitude = -30
    env.temperature = 14
    env.precipitation = water.raining ? 3 : 0
    env.cloud = weather.value * 100
    env.wind = 2.5
    env.windDirection = 250
    env.radiation = 850 * Math.sin(35 * DEG) * (1 - 0.85 * weather.value)
    env.solarWatts = env.radiation * PANEL_AREA * PANEL_EFFICIENCY
    env.solarKWh = 0
    env.timeLabel = ''
  }
}

// Sky gradient colours (zenith, high, horizon) for night, day, golden hour and overcast
const SKY = {
  night: ['#030712', '#0a1330', '#17233f'],
  day: ['#2f74c8', '#86b9ea', '#cfe0ea'],
  golden: ['#46609e', '#e0a07c', '#f6c590'],
  overcast: ['#59636e', '#7d8791', '#8d98a3'],
}
function skyColor(stop: 0 | 1 | 2, daylight: number, golden: number, overcast: number) {
  const color = new Color(SKY.night[stop]).lerp(new Color(SKY.day[stop]), daylight)
  color.lerp(new Color(SKY.golden[stop]), golden)
  const grey = new Color(SKY.overcast[stop]).multiplyScalar(0.12 + 0.88 * daylight)
  return color.lerp(grey, overcast)
}

// Fog hides the edge of the world; its colour follows the horizon of the sky
const { scene } = useTres()
const horizonColor = new Color('#cfe0ea')
watch(scene, (s) => {
  if (s && !s.fog) { s.fog = new Fog(horizonColor.clone(), 40, 120) }
}, { immediate: true })

let skyTimer = 1
function paintSky(delta: number) {
  skyTimer += delta
  if (skyTimer < 0.12) { return }
  skyTimer = 0
  const daylight = smooth(-8, 10, env.sunAltitude)
  const golden = Math.exp(-(((env.sunAltitude - 2) / 9) ** 2)) * (1 - 0.6 * weather.value)
  const overcast = weather.value * 0.95
  const zenith = skyColor(0, daylight, golden, overcast)
  const high = skyColor(1, daylight, golden, overcast)
  const horizon = skyColor(2, daylight, golden, overcast)
  sky.paint(`#${zenith.getHexString()}`, `#${high.getHexString()}`, `#${horizon.getHexString()}`)
  horizonColor.copy(horizon)
}

const trees = ref<any[]>([])
let clock = 0

const { onBeforeRender } = useLoop()

onBeforeRender(({ delta }) => {
  clock += delta
  updateEnvironment(delta)

  // Weather eases in and out; surfaces get wet while it rains and dry slowly afterwards
  const overcastTarget = liveOn.value
    ? Math.min(1, (env.cloud / 100) * 0.8 + (water.raining ? 0.25 : 0))
    : (water.raining ? 1 : 0)
  weather.value += (overcastTarget - weather.value) * Math.min(1, delta * 0.8)
  const rainTarget = water.raining ? 1 : 0
  wet.value += (rainTarget - wet.value) * Math.min(1, delta * (water.raining ? 0.3 : 0.05))

  paintSky(delta)
  const fog = scene.value?.fog as Fog | undefined
  if (fog) {
    fog.color.copy(horizonColor)
    fog.near = 40 - 25 * weather.value
    fog.far = 120 - 60 * weather.value
  }

  // Wind: the rain slants and the trees sway (the wind direction is where it comes FROM)
  const from = env.windDirection * DEG
  const drift = Math.min(env.wind, 18) * 0.25
  windVx = -Math.sin(from) * drift
  windVz = Math.cos(from) * drift
  const lean = Math.min(env.wind, 20) * 0.004
  trees.value.forEach((tree, i) => {
    const sway = 0.65 + 0.35 * Math.sin(clock * 1.4 + i * 2)
    tree.rotation.z = Math.sin(from) * lean * sway
    tree.rotation.x = Math.cos(from) * lean * sway
  })

  // Garden tap: gravity fed from the barrel, waters the garden while it is open
  if (water.gardenTap) {
    if (water.fill <= 0) { water.gardenTap = false }
    else { water.garden = Math.min(1, water.garden + drain(GARDEN_TAP_RATE * delta) * GARDEN_GAIN) }

    tapDropData.forEach((drop, i) => {
      drop.t += delta
      if (drop.t > TAP_FALL_TIME) { drop.t -= TAP_FALL_TIME }
      tapDrops.value[i]?.position.set(TAP_X + 3 * drop.t, TAP_Y - 5 * drop.t * drop.t, BARREL_Z)
    })
  }

  // Indoor tap and toilet: the pump pushes water from the barrel into the house
  if (water.sinkTap) {
    if (water.fill <= 0) { water.sinkTap = false }
    else { drain(SINK_RATE * delta) }
  }
  water.flushT = Math.max(0, water.flushT - delta)
  cistern.value = Math.min(1, cistern.value + 0.3 * delta)

  // The garden dries out (faster in strong sun when real data is used), and rain waters it
  const drying = liveOn.value ? 0.003 + 0.012 * Math.min(1, env.radiation / 800) : 0.004
  water.garden = Math.max(0, water.garden - drying * delta)
  if (water.raining) {
    const watering = liveOn.value ? 0.012 * Math.min(env.precipitation, 5) : 0.02
    water.garden = Math.min(1, water.garden + watering * delta)
  }

  if (!water.raining) { return }

  // Light rain shows fewer drops than a downpour
  const active = liveOn.value ? Math.round(DROP_COUNT * Math.min(1, Math.max(0.1, env.precipitation / 3))) : DROP_COUNT
  dropData.forEach((drop, i) => {
    const mesh = drops.value[i]
    if (!mesh) { return }
    if (i >= active) {
      mesh.visible = false
      return
    }
    mesh.visible = true
    updateDrop(drop, delta)
    mesh.position.set(drop.x, drop.y, drop.z)
    // Falling rain is a long thin streak leaning with the wind; on the roof and in the gutter it is a small bead;
    // the overflow is drawn wider so it reads as a film running down the barrel
    if (drop.state === 'overflow') { mesh.scale.set(5, 0.45, 5); mesh.rotation.set(0, 0, 0) }
    else if (drop.state === 'sliding' || drop.state === 'gutter') { mesh.scale.set(1.8, 0.18, 1.8); mesh.rotation.set(0, 0, 0) }
    else if (drop.state === 'pipe') { mesh.scale.set(1.2, 0.5, 1.2); mesh.rotation.set(0, 0, 0) }
    else {
      mesh.scale.set(1, 1, 1)
      mesh.rotation.set(-windVz / drop.speed, 0, windVx / drop.speed)
    }
  })
})

const pumpOn = computed(() => water.sinkTap || water.flushT > 0)

// Light and sky follow the sun (SunCalc) and the weather
const sunDirection = computed<[number, number, number]>(() => {
  const altitude = env.sunAltitude * DEG
  const azimuth = env.sunAzimuth * DEG
  // the scene's north is -z and east is +x, so the sun at noon (south) lights the front of the house
  return [Math.cos(altitude) * Math.sin(azimuth), Math.sin(altitude), -Math.cos(altitude) * Math.cos(azimuth)]
})
const moonDirection = computed<[number, number, number]>(() => {
  const altitude = env.moonAltitude * DEG
  const azimuth = env.moonAzimuth * DEG
  return [Math.cos(altitude) * Math.sin(azimuth), Math.sin(altitude), -Math.cos(altitude) * Math.cos(azimuth)]
})
const scaled = (direction: [number, number, number], length: number) => direction.map(v => v * length) as [number, number, number]
const sunPosition = computed(() => scaled(sunDirection.value, 40))
const sunDiscPosition = computed(() => scaled(sunDirection.value, 380))
const moonPosition = computed(() => scaled(moonDirection.value, 370))

const daylight = computed(() => smooth(-8, 10, env.sunAltitude))
const sunIntensity = computed(() => 2.8 * smooth(0, 10, env.sunAltitude) * (1 - 0.68 * weather.value))
const skyLightIntensity = computed(() => (0.2 + 0.6 * daylight.value) * (1 - 0.12 * weather.value))
const moonIntensity = computed(() => 0.45 * env.moonLit * smooth(0, 10, env.moonAltitude) * (1 - daylight.value) * (1 - 0.6 * weather.value))
const sunColor = computed(() => `#${new Color('#ff9a55').lerp(new Color('#fff1d6'), smooth(0, 25, env.sunAltitude)).getHexString()}`)
const hemiSkyColor = computed(() => `#${new Color('#2a3b78').lerp(new Color('#cfe6ff'), daylight.value).getHexString()}`)
const hemiGroundColor = computed(() => `#${new Color('#141c12').lerp(new Color('#5c7a46'), daylight.value).getHexString()}`)
const sunDiscOpacity = computed(() => (1 - weather.value * 0.9) * smooth(-2, 1, env.sunAltitude))
const moonOpacity = computed(() => smooth(-2, 3, env.moonAltitude) * (1 - daylight.value * 0.95) * (1 - weather.value * 0.85))
const moonColor = computed(() => `#${new Color('#4a5060').lerp(new Color('#eef1f8'), 0.35 + 0.65 * env.moonLit).getHexString()}`)
const starOpacity = computed(() => (1 - daylight.value) * (1 - weather.value) * 0.9)
// windows light up when it gets dark
const nightGlow = computed(() => (1 - daylight.value) * 0.9)
const cloudScale = computed<[number, number, number]>(() => {
  const s = liveOn.value ? 0.9 + 0.8 * weather.value : 1.3
  return [s, s, s]
})

// Stars: tiny shapes scattered on a big sphere above the horizon
const starMesh = ref<any>(null)
watch(starMesh, (mesh) => {
  if (!mesh) { return }
  const dummy = new Object3D()
  for (let i = 0; i < STAR_COUNT; i++) {
    const theta = Math.random() * Math.PI * 2
    const y = 0.02 + Math.random() * 0.98
    const radius = Math.sqrt(1 - y * y)
    dummy.position.set(Math.cos(theta) * radius * 450, y * 450, Math.sin(theta) * radius * 450)
    const size = 0.5 + Math.random() * 1.1
    dummy.scale.set(size, size, size)
    dummy.updateMatrix()
    mesh.setMatrixAt(i, dummy.matrix)
  }
  mesh.instanceMatrix.needsUpdate = true
  mesh.frustumCulled = false
}, { immediate: true })

const hex = (value: number) => Math.round(Math.max(0, Math.min(255, value))).toString(16).padStart(2, '0')
// Wet surfaces get darker (multiplied with their texture) and shinier
const wetTint = computed(() => {
  const v = 255 * (1 - 0.2 * wet.value)
  return `#${hex(v)}${hex(v)}${hex(v + 4)}`
})
const wetRough = (dry: number) => dry - 0.35 * wet.value

// Clouds are white on top and grey underneath, and darken when it rains
const cloudPuffs = [
  { p: [0, 0, 0], r: 1.1, shade: 0 },
  { p: [-1.2, -0.2, 0.2], r: 0.85, shade: 0.3 },
  { p: [1.2, -0.2, -0.1], r: 0.9, shade: 0.3 },
  { p: [0.3, 0.2, -0.9], r: 0.8, shade: 0.1 },
  { p: [-0.4, -0.35, 0.9], r: 0.7, shade: 0.5 },
  { p: [0.9, -0.4, 0.8], r: 0.65, shade: 0.5 },
  { p: [-2.1, -0.45, -0.1], r: 0.6, shade: 0.55 },
  { p: [2.1, -0.45, 0.1], r: 0.6, shade: 0.55 },
  { p: [-0.9, 0.25, -0.7], r: 0.7, shade: 0.1 },
]
function cloudColor(shade: number) {
  const v = 255 - shade * 45 - weather.value * (115 - shade * 15)
  return `#${hex(v)}${hex(v + 3)}${hex(v + 8)}`
}

// Garden: plants grow and turn green with water, and dry out without it
const FLOWER_COLORS = ['#e84a5f', '#f9c74f', '#f28cb1', '#ffffff', '#a06cd5']
const plants = Array.from({ length: 16 }, (_, i) => ({
  x: 1.9 + 0.6 * (i % 4),
  z: 2 + 0.6 * Math.floor(i / 4),
  color: FLOWER_COLORS[i % FLOWER_COLORS.length],
}))
const plantScale = computed<[number, number, number]>(() => {
  const s = 0.35 + 0.9 * water.garden
  return [s, s, s]
})
const leafColor = computed(() => `#${new Color('#9a8f4a').lerp(new Color('#3f9b3f'), water.garden).getHexString()}`)
// multiplied with the soil texture: light when dry, dark when watered
const soilColor = computed(() => `#${new Color('#e8d2b0').lerp(new Color('#7d6248'), water.garden).getHexString()}`)

// Fence along the front of the property, with a gap for the path
const fencePosts: number[] = []
for (let x = -7.5; x <= 4.51; x += 0.5) {
  if (Math.abs(x - CENTER_X) > 0.8) { fencePosts.push(x) }
}

// Thousands of grass blades scattered over the lawn, except where the house, path or garden are
const TUFT_COUNT = 14000
const tuftMesh = ref<any>(null)
function blocked(x: number, z: number) {
  if (Math.abs(x - CENTER_X) < 3.3 && Math.abs(z) < 3.3) { return true } // house
  if (x > -1.8 && x < 1 && z > 2.2 && z < 3.6) { return true } // barrel and pump
  if (x > 1.2 && x < 4.2 && z > 1.4 && z < 4.4) { return true } // garden bed
  if (Math.abs(x - CENTER_X) < 0.8 && z > 2.4 && z < 5.8) { return true } // path
  if (Math.abs(z - 5.6) < 0.15) { return true } // fence
  if (Math.hypot(x + 7, z - 1.5) < 0.6 || Math.hypot(x - 3.2, z + 3.5) < 0.7) { return true } // tree trunks
  return false
}
watch(tuftMesh, (mesh) => {
  if (!mesh) { return }
  const dummy = new Object3D()
  const color = new Color()
  let placed = 0
  while (placed < TUFT_COUNT) {
    const x = (Math.random() - 0.5) * 50
    const z = Math.random() * 40 - 22
    if (blocked(x, z)) { continue }
    const s = 0.5 + Math.random() * 0.8
    dummy.position.set(x, 0.14 * s, z)
    dummy.rotation.set((Math.random() - 0.5) * 0.4, Math.random() * Math.PI * 2, (Math.random() - 0.5) * 0.4)
    dummy.scale.set(s, s, s)
    dummy.updateMatrix()
    mesh.setMatrixAt(placed, dummy.matrix)
    color.setHSL(0.26 + (Math.random() - 0.5) * 0.05, 0.55 + Math.random() * 0.2, 0.14 + Math.random() * 0.14)
    mesh.setColorAt(placed, color)
    placed++
  }
  mesh.instanceMatrix.needsUpdate = true
  if (mesh.instanceColor) { mesh.instanceColor.needsUpdate = true }
  mesh.frustumCulled = false
}, { immediate: true })

const treeSpots = [
  { x: -7, z: 1.5, s: 1 },
  { x: 3.2, z: -3.5, s: 1.2 },
]

const ROCKS = [
  { p: [0.9, 0.1, 4.6], s: [0.3, 0.2, 0.25] },
  { p: [1.3, 0.08, 4.85], s: [0.18, 0.14, 0.16] },
  { p: [-6.2, 0.12, 2.6], s: [0.35, 0.25, 0.3] },
  { p: [-5.9, 0.07, 2.9], s: [0.18, 0.12, 0.15] },
  { p: [4.8, 0.1, 0.5], s: [0.32, 0.22, 0.28] },
  { p: [-1.0, 0.07, 4.2], s: [0.2, 0.14, 0.18] },
]
</script>

<template>
  <!-- sky dome: its colours follow the sun and the weather -->
  <TresMesh :render-order="-3">
    <TresSphereGeometry :args="[500, 32, 16]" />
    <TresMeshBasicMaterial :map="sky.texture" :side="1" :fog="false" :tone-mapped="false" :depth-write="false" />
  </TresMesh>
  <TresInstancedMesh ref="starMesh" :args="[undefined, undefined, STAR_COUNT]" :render-order="-2">
    <TresOctahedronGeometry :args="[1.1, 0]" />
    <TresMeshBasicMaterial color="#ffffff" :fog="false" :tone-mapped="false" :depth-write="false" transparent :opacity="starOpacity" />
  </TresInstancedMesh>
  <TresMesh :position="sunDiscPosition" :render-order="-1">
    <TresSphereGeometry :args="[14, 24, 16]" />
    <TresMeshBasicMaterial color="#fff6dc" :fog="false" :tone-mapped="false" :depth-write="false" transparent :opacity="sunDiscOpacity" />
  </TresMesh>
  <TresMesh :position="sunDiscPosition" :render-order="-1">
    <TresSphereGeometry :args="[34, 24, 16]" />
    <TresMeshBasicMaterial color="#fff1c8" :fog="false" :tone-mapped="false" :depth-write="false" transparent :opacity="sunDiscOpacity * 0.18" />
  </TresMesh>
  <TresMesh :position="moonPosition" :render-order="-1">
    <TresSphereGeometry :args="[9, 24, 16]" />
    <TresMeshBasicMaterial :color="moonColor" :fog="false" :tone-mapped="false" :depth-write="false" transparent :opacity="moonOpacity" />
  </TresMesh>

  <!-- light: sky light, the sun (casts shadows) and a faint moon -->
  <TresHemisphereLight
    :color="hemiSkyColor"
    :ground-color="hemiGroundColor"
    :intensity="skyLightIntensity"
  />
  <TresDirectionalLight
    :color="sunColor"
    :position="sunPosition"
    :intensity="sunIntensity"
    cast-shadow
    :shadow-camera-left="-14"
    :shadow-camera-right="14"
    :shadow-camera-top="14"
    :shadow-camera-bottom="-14"
    :shadow-camera-far="120"
    :shadow-bias="-0.0004"
    :shadow-normal-bias="0.03"
    :shadow-mapSize-width="2048"
    :shadow-mapSize-height="2048"
  />
  <TresDirectionalLight color="#9db4ff" :position="moonPosition" :intensity="moonIntensity" />

  <!-- ground -->
  <TresMesh :rotation="[-Math.PI / 2, 0, 0]" :position="[0, -0.01, 0]" receive-shadow>
    <TresPlaneGeometry :args="[240, 240]" />
    <TresMeshStandardMaterial
      :map="tex.grass"
      :bump-map="tex.grass"
      :bump-scale="0.8"
      :color="wetTint"
      :roughness="wetRough(1)"
    />
  </TresMesh>

  <!-- grass blades -->
  <TresInstancedMesh ref="tuftMesh" :args="[undefined, undefined, TUFT_COUNT]">
    <TresConeGeometry :args="[0.025, 0.28, 3]" />
    <TresMeshStandardMaterial :roughness="0.9" />
  </TresInstancedMesh>

  <!-- stepping stones path from the front door to the gate -->
  <TresMesh :position="[-3, 0.012, 4.3]" receive-shadow>
    <TresBoxGeometry :args="[1, 0.024, 2.8]" />
    <TresMeshStandardMaterial :map="tex.stone" :bump-map="tex.stone" :bump-scale="1.2" :color="wetTint" :roughness="wetRough(0.9)" />
  </TresMesh>

  <!-- the house, built at the original size and scaled up -->
  <TresGroup :position="[CENTER_X, 0, 0]" :scale="[H, H, H]">
    <!-- walls (see-through when you look inside) -->
    <TresMesh :position="[0, 1, 0]" cast-shadow receive-shadow>
      <TresBoxGeometry :args="[3, 2, 4]" />
      <TresMeshStandardMaterial
        :map="tex.plaster"
        :bump-map="tex.plaster"
        :bump-scale="0.8"
        :roughness="0.95"
        transparent
        :opacity="water.cutaway ? 0.18 : 1"
        :depth-write="!water.cutaway"
      />
    </TresMesh>

    <!-- plinth around the bottom of the walls (its top is the floor inside) -->
    <TresMesh :position="[0, 0.1, 0]" receive-shadow>
      <TresBoxGeometry :args="[3.1, 0.2, 4.1]" />
      <TresMeshStandardMaterial :map="tex.stone" :bump-map="tex.stone" :bump-scale="1" color="#a9a49b" :roughness="0.95" />
    </TresMesh>
    <TresMesh :position="[0, 0.21, 0]" receive-shadow>
      <TresBoxGeometry :args="[2.9, 0.02, 3.9]" />
      <TresMeshStandardMaterial :map="tex.wood" color="#e6c8a0" :roughness="0.6" />
    </TresMesh>

    <!-- roof -->
    <TresMesh :position="[0, 3, 0]" :rotation="[0, Math.PI / 4, 0]" cast-shadow receive-shadow>
      <TresConeGeometry :args="[3, 2, 4]" />
      <TresMeshStandardMaterial
        :map="tex.roof"
        :bump-map="tex.roof"
        :bump-scale="1.5"
        :color="wetTint"
        :roughness="wetRough(0.85)"
        flat-shading
        transparent
        :opacity="water.cutaway ? 0.15 : 1"
        :depth-write="!water.cutaway"
      />
    </TresMesh>

    <!-- solar panels on the south face of the roof: their output follows the real solar radiation -->
    <TresGroup
      v-for="(panel, i) in solarPanels"
      :key="i"
      :position="panel.p"
      :rotation="[ROOF_SLOPE, 0, 0]"
    >
      <TresMesh cast-shadow>
        <TresBoxGeometry :args="[0.77, 0.03, 0.72]" />
        <TresMeshStandardMaterial color="#c4cad2" :metalness="0.6" :roughness="0.4" />
      </TresMesh>
      <TresMesh :position="[0, 0.02, 0]">
        <TresBoxGeometry :args="[0.71, 0.015, 0.66]" />
        <TresMeshPhysicalMaterial :map="solarTex" :roughness="0.15" :metalness="0.5" :clearcoat="1" />
      </TresMesh>
    </TresGroup>

    <!-- chimney -->
    <TresMesh :position="[-1, 3.4, -0.8]" cast-shadow>
      <TresBoxGeometry :args="[0.5, 1.4, 0.5]" />
      <TresMeshStandardMaterial :map="tex.brick" :bump-map="tex.brick" :bump-scale="1.5" :roughness="0.95" />
    </TresMesh>
    <TresMesh :position="[-1, 4.12, -0.8]" cast-shadow>
      <TresBoxGeometry :args="[0.64, 0.1, 0.64]" />
      <TresMeshStandardMaterial color="#8a8a8a" :roughness="0.9" />
    </TresMesh>

    <!-- front door with frame, step and knob -->
    <TresMesh :position="[0, 0.9, 2.01]">
      <TresBoxGeometry :args="[1.0, 1.65, 0.04]" />
      <TresMeshStandardMaterial color="#f3eee6" :roughness="0.6" />
    </TresMesh>
    <TresMesh :position="[0, 0.85, 2.04]" cast-shadow>
      <TresBoxGeometry :args="[0.8, 1.5, 0.06]" />
      <TresMeshStandardMaterial :map="tex.wood" :bump-map="tex.wood" color="#7a5538" :roughness="0.55" />
    </TresMesh>
    <TresMesh :position="[0.25, 0.85, 2.09]">
      <TresSphereGeometry :args="[0.04, 16, 8]" />
      <TresMeshStandardMaterial color="#d4af37" :metalness="0.8" :roughness="0.25" />
    </TresMesh>
    <TresMesh :position="[0, 0.05, 2.35]" receive-shadow>
      <TresBoxGeometry :args="[1.1, 0.1, 0.5]" />
      <TresMeshStandardMaterial :map="tex.stone" :bump-map="tex.stone" color="#b5b0a6" :roughness="0.9" />
    </TresMesh>

    <!-- windows: white frame, glass and a sill, on the front, back and both sides -->
    <TresGroup
      v-for="(w, i) in [
        { p: [-0.9, 1.2, 2.02],
          r: 0 },
        { p: [0.9, 1.2, 2.02],
          r: 0 },
        { p: [0, 1.2, -2.02],
          r: Math.PI },
        { p: [1.52, 1.2, 0.8],
          r: Math.PI / 2 },
        { p: [1.52, 1.2, -0.8],
          r: Math.PI / 2 },
        { p: [-1.52, 1.2, 0.8],
          r: -Math.PI / 2 },
        { p: [-1.52, 1.2, -0.8],
          r: -Math.PI / 2 },
      ]"
      :key="i"
      :position="w.p"
      :rotation="[0, w.r, 0]"
    >
      <TresMesh>
        <TresBoxGeometry :args="[0.8, 0.8, 0.05]" />
        <TresMeshStandardMaterial color="#f5f2ec" :roughness="0.5" />
      </TresMesh>
      <TresMesh :position="[0, 0, 0.02]">
        <TresBoxGeometry :args="[0.66, 0.66, 0.04]" />
        <TresMeshPhysicalMaterial color="#9cc7e0" :metalness="0.1" :roughness="0.05" :clearcoat="1" emissive="#ffc860" :emissive-intensity="nightGlow" />
      </TresMesh>
      <TresMesh :position="[0, 0, 0.045]">
        <TresBoxGeometry :args="[0.04, 0.66, 0.02]" />
        <TresMeshStandardMaterial color="#f5f2ec" :roughness="0.5" />
      </TresMesh>
      <TresMesh :position="[0, 0, 0.045]">
        <TresBoxGeometry :args="[0.66, 0.04, 0.02]" />
        <TresMeshStandardMaterial color="#f5f2ec" :roughness="0.5" />
      </TresMesh>
      <TresMesh :position="[0, -0.43, 0.08]" cast-shadow>
        <TresBoxGeometry :args="[0.98, 0.06, 0.18]" />
        <TresMeshStandardMaterial :map="tex.stone" color="#c9c4ba" :roughness="0.9" />
      </TresMesh>
    </TresGroup>

    <!-- gutter: a ring around the whole roof edge -->
    <TresMesh :position="[0, 1.95, 2.25]" cast-shadow>
      <TresBoxGeometry :args="[4.8, 0.15, 0.3]" />
      <TresMeshStandardMaterial color="#b8bec6" :metalness="0.7" :roughness="0.4" />
    </TresMesh>
    <TresMesh :position="[0, 1.95, -2.25]" cast-shadow>
      <TresBoxGeometry :args="[4.8, 0.15, 0.3]" />
      <TresMeshStandardMaterial color="#b8bec6" :metalness="0.7" :roughness="0.4" />
    </TresMesh>
    <TresMesh :position="[2.25, 1.95, 0]" cast-shadow>
      <TresBoxGeometry :args="[0.3, 0.15, 4.2]" />
      <TresMeshStandardMaterial color="#b8bec6" :metalness="0.7" :roughness="0.4" />
    </TresMesh>
    <TresMesh :position="[-2.25, 1.95, 0]" cast-shadow>
      <TresBoxGeometry :args="[0.3, 0.15, 4.2]" />
      <TresMeshStandardMaterial color="#b8bec6" :metalness="0.7" :roughness="0.4" />
    </TresMesh>

    <!-- inside the house: floor level is y = 0.22 -->
    <!-- water pipe from outside, along the right wall, then along the back wall to the sink -->
    <TresMesh :position="[1.32, 0.26, 0.2]" :rotation="[Math.PI / 2, 0, 0]">
      <TresCylinderGeometry :args="[0.035, 0.035, 3.6, 12]" />
      <TresMeshStandardMaterial color="#6b8fb3" :roughness="0.5" />
    </TresMesh>
    <TresMesh :position="[0.26, 0.26, -1.6]" :rotation="[0, 0, Math.PI / 2]">
      <TresCylinderGeometry :args="[0.035, 0.035, 2.12, 12]" />
      <TresMeshStandardMaterial color="#6b8fb3" :roughness="0.5" />
    </TresMesh>
    <TresMesh :position="[1.32, 0.38, 1.1]">
      <TresCylinderGeometry :args="[0.035, 0.035, 0.24, 12]" />
      <TresMeshStandardMaterial color="#6b8fb3" :roughness="0.5" />
    </TresMesh>

    <!-- toilet: click it (when looking inside) to flush -->
    <TresGroup
      :position="[0, 0, 0]"
      @click="flush"
      @pointerenter="water.cutaway && setCursor('pointer')"
      @pointerleave="setCursor('auto')"
    >
      <TresMesh :position="[1.0, 0.37, 1.1]">
        <TresCylinderGeometry :args="[0.22, 0.14, 0.3, 24]" />
        <TresMeshPhysicalMaterial color="#f6f6f6" :roughness="0.15" :clearcoat="1" />
      </TresMesh>
      <TresMesh :position="[1.0, 0.53, 1.1]">
        <TresCylinderGeometry :args="[0.2, 0.2, 0.03, 24]" />
        <TresMeshPhysicalMaterial color="#e4e4e4" :roughness="0.15" :clearcoat="1" />
      </TresMesh>
      <!-- cistern: see-through box with a water level that drops when flushed -->
      <TresMesh :position="[1.35, 0.75, 1.1]">
        <TresBoxGeometry :args="[0.25, 0.5, 0.5]" />
        <TresMeshStandardMaterial color="#ffffff" transparent :opacity="0.4" :depth-write="false" />
      </TresMesh>
      <TresMesh :position="[1.35, 0.52 + 0.2 * cistern, 1.1]" :scale="[1, Math.max(cistern, 0.01), 1]">
        <TresBoxGeometry :args="[0.21, 0.4, 0.46]" />
        <TresMeshStandardMaterial color="#3b8fd9" :roughness="0.1" />
      </TresMesh>
    </TresGroup>

    <!-- kitchen cabinet with sink and tap: click the tap (when looking inside) to open it -->
    <TresMesh :position="[-0.8, 0.57, -1.7]">
      <TresBoxGeometry :args="[0.8, 0.7, 0.5]" />
      <TresMeshStandardMaterial :map="tex.wood" color="#d9b78e" :roughness="0.6" />
    </TresMesh>
    <TresMesh :position="[-0.8, 0.94, -1.7]">
      <TresBoxGeometry :args="[0.84, 0.04, 0.54]" />
      <TresMeshStandardMaterial color="#e6e6e6" :roughness="0.3" />
    </TresMesh>
    <TresMesh :position="[-0.8, 0.965, -1.62]">
      <TresBoxGeometry :args="[0.4, 0.02, 0.26]" />
      <TresMeshStandardMaterial color="#aeb8c2" :metalness="0.8" :roughness="0.25" />
    </TresMesh>
    <TresGroup
      :position="[-0.8, 0, -1.85]"
      @click="toggleSinkTap"
      @pointerenter="water.cutaway && setCursor('pointer')"
      @pointerleave="setCursor('auto')"
    >
      <TresMesh :position="[0, 1.07, 0]">
        <TresCylinderGeometry :args="[0.03, 0.03, 0.2, 12]" />
        <TresMeshStandardMaterial color="#d4d9de" :metalness="0.9" :roughness="0.2" />
      </TresMesh>
      <TresMesh :position="[0, 1.17, 0.1]" :rotation="[Math.PI / 2, 0, 0]">
        <TresCylinderGeometry :args="[0.025, 0.025, 0.2, 12]" />
        <TresMeshStandardMaterial color="#d4d9de" :metalness="0.9" :roughness="0.2" />
      </TresMesh>
      <TresMesh :position="[0.07, 1.1, 0]">
        <TresBoxGeometry :args="[0.08, 0.04, 0.04]" />
        <TresMeshStandardMaterial :color="water.sinkTap ? '#2e8b57' : '#c0392b'" />
      </TresMesh>
      <!-- bigger invisible target so the small tap is easy to click -->
      <TresMesh :position="[0, 1.1, 0.05]">
        <TresSphereGeometry :args="[0.22, 12, 8]" />
        <TresMeshBasicMaterial transparent :opacity="0" :depth-write="false" />
      </TresMesh>
    </TresGroup>
    <!-- water from the sink tap -->
    <TresMesh :position="[-0.8, 1.06, -1.65]" :visible="water.sinkTap">
      <TresCylinderGeometry :args="[0.012, 0.012, 0.2, 8]" />
      <TresMeshStandardMaterial color="#4a90e2" transparent :opacity="0.8" />
    </TresMesh>
  </TresGroup>

  <!-- pipe from the barrel to the house, with the pump on it (outside, not scaled) -->
  <TresMesh :position="[-1.025, 0.25, BARREL_Z]" :rotation="[0, 0, Math.PI / 2]">
    <TresCylinderGeometry :args="[0.035, 0.035, 0.65, 12]" />
    <TresMeshStandardMaterial color="#6b8fb3" :roughness="0.5" />
  </TresMesh>
  <TresMesh :position="[-1.35, 0.25, 2.68]" :rotation="[Math.PI / 2, 0, 0]">
    <TresCylinderGeometry :args="[0.035, 0.035, 0.4625, 12]" />
    <TresMeshStandardMaterial color="#6b8fb3" :roughness="0.5" />
  </TresMesh>
  <TresMesh :position="[-1.0, 0.2, BARREL_Z]" cast-shadow>
    <TresBoxGeometry :args="[0.32, 0.26, 0.28]" />
    <TresMeshStandardMaterial color="#2c6e7f" :metalness="0.4" :roughness="0.45" />
  </TresMesh>
  <TresMesh :position="[-1.0, 0.39, BARREL_Z]">
    <TresSphereGeometry :args="[0.05, 12, 8]" />
    <TresMeshBasicMaterial :color="pumpOn ? '#2ecc71' : '#7f8c8d'" />
  </TresMesh>

  <!-- downspout from the front right corner of the gutter down to the barrel -->
  <TresMesh :position="[DRAIN_X, 1.945, DRAIN_Z]" cast-shadow>
    <TresCylinderGeometry :args="[0.12, 0.12, 0.79, 32]" />
    <TresMeshStandardMaterial color="#b8bec6" :metalness="0.7" :roughness="0.4" />
  </TresMesh>

  <!-- rain barrel under the downspout: open top, water level rises as it fills -->
  <TresGroup :position="[BARREL_X, 0, BARREL_Z]" :scale="[BARREL_SCALE, BARREL_SCALE, BARREL_SCALE]">
    <TresMesh :position="[0, 0.5, 0]" cast-shadow receive-shadow>
      <TresCylinderGeometry :args="[0.5, 0.45, 1, 32, 1, true]" />
      <TresMeshStandardMaterial :map="tex.barrel" :bump-map="tex.barrel" :bump-scale="1" :side="2" :roughness="0.75" />
    </TresMesh>
    <TresMesh :position="[0, 0.02, 0]" :rotation="[-Math.PI / 2, 0, 0]">
      <TresCircleGeometry :args="[0.45, 32]" />
      <TresMeshStandardMaterial color="#4a2f16" />
    </TresMesh>
    <TresMesh :position="[0, 0.25, 0]" :rotation="[Math.PI / 2, 0, 0]">
      <TresTorusGeometry :args="[0.48, 0.02, 8, 32]" />
      <TresMeshStandardMaterial color="#3d3d3f" :metalness="0.85" :roughness="0.45" />
    </TresMesh>
    <TresMesh :position="[0, 0.75, 0]" :rotation="[Math.PI / 2, 0, 0]">
      <TresTorusGeometry :args="[0.5, 0.02, 8, 32]" />
      <TresMeshStandardMaterial color="#3d3d3f" :metalness="0.85" :roughness="0.45" />
    </TresMesh>
    <TresMesh
      :position="[0, WATER_BASE + (WATER_HEIGHT / 2) * Math.max(water.fill, 0.001), 0]"
      :scale="[1, Math.max(water.fill, 0.001), 1]"
    >
      <TresCylinderGeometry :args="[0.44, 0.44, WATER_HEIGHT, 32]" />
      <TresMeshPhysicalMaterial color="#2f7fc4" transparent :opacity="0.88" :roughness="0.03" :clearcoat="1" />
    </TresMesh>
  </TresGroup>

  <!-- garden tap on the barrel (not scaled): click to water the garden -->
  <TresGroup
    :position="[BARREL_X + 0.77, TAP_Y, BARREL_Z]"
    :scale="[1.6, 1.6, 1.6]"
    @click="toggleGardenTap"
    @pointerenter="setCursor('pointer')"
    @pointerleave="setCursor('auto')"
  >
    <TresMesh :rotation="[0, 0, Math.PI / 2]">
      <TresCylinderGeometry :args="[0.045, 0.045, 0.16, 12]" />
      <TresMeshStandardMaterial color="#c8a15a" :metalness="0.9" :roughness="0.3" />
    </TresMesh>
    <TresMesh :position="[-0.01, 0.08, 0]">
      <TresBoxGeometry :args="[0.06, 0.08, 0.16]" />
      <TresMeshStandardMaterial :color="water.gardenTap ? '#2e8b57' : '#c0392b'" :roughness="0.4" />
    </TresMesh>
    <TresMesh :position="[0.03, 0.03, 0]">
      <TresSphereGeometry :args="[0.2, 12, 8]" />
      <TresMeshBasicMaterial transparent :opacity="0" :depth-write="false" />
    </TresMesh>
  </TresGroup>

  <!-- water from the garden tap, arcing onto the garden bed -->
  <TresGroup :visible="water.gardenTap">
    <TresMesh v-for="i in TAP_DROPS" :key="i" ref="tapDrops">
      <TresCylinderGeometry :args="[0.055, 0.045, 0.22, 8]" />
      <TresMeshPhysicalMaterial color="#6fb1f0" transparent :opacity="0.7" :roughness="0.05" />
    </TresMesh>
  </TresGroup>

  <!-- puddle: grows on the ground around the barrel while it overflows -->
  <TresMesh
    :visible="puddle > 0"
    :position="[BARREL_X, 0.015, BARREL_Z]"
    :rotation="[-Math.PI / 2, 0, 0]"
    :scale="[0.8 + puddle * 0.9, 0.8 + puddle * 0.9, 1]"
    receive-shadow
  >
    <TresCircleGeometry :args="[1, 48]" />
    <TresMeshPhysicalMaterial color="#3a78a8" transparent :opacity="0.7" :roughness="0.02" :clearcoat="1" />
  </TresMesh>

  <!-- garden bed: wooden frame, soil and plants that grow with water -->
  <TresMesh :position="[2.7, 0.11, 1.65]" cast-shadow receive-shadow>
    <TresBoxGeometry :args="[2.6, 0.22, 0.1]" />
    <TresMeshStandardMaterial :map="tex.wood" :bump-map="tex.wood" color="#d9b78e" :roughness="0.8" />
  </TresMesh>
  <TresMesh :position="[2.7, 0.11, 4.15]" cast-shadow receive-shadow>
    <TresBoxGeometry :args="[2.6, 0.22, 0.1]" />
    <TresMeshStandardMaterial :map="tex.wood" :bump-map="tex.wood" color="#d9b78e" :roughness="0.8" />
  </TresMesh>
  <TresMesh :position="[1.45, 0.11, 2.9]" cast-shadow receive-shadow>
    <TresBoxGeometry :args="[0.1, 0.22, 2.6]" />
    <TresMeshStandardMaterial :map="tex.wood" :bump-map="tex.wood" color="#d9b78e" :roughness="0.8" />
  </TresMesh>
  <TresMesh :position="[3.95, 0.11, 2.9]" cast-shadow receive-shadow>
    <TresBoxGeometry :args="[0.1, 0.22, 2.6]" />
    <TresMeshStandardMaterial :map="tex.wood" :bump-map="tex.wood" color="#d9b78e" :roughness="0.8" />
  </TresMesh>
  <TresMesh :position="[2.7, 0.06, 2.9]" receive-shadow>
    <TresBoxGeometry :args="[2.4, 0.12, 2.4]" />
    <TresMeshStandardMaterial :map="tex.soil" :bump-map="tex.soil" :bump-scale="1.5" :color="soilColor" :roughness="1" />
  </TresMesh>
  <TresGroup
    v-for="(p, i) in plants"
    :key="i"
    :position="[p.x, 0.12, p.z]"
    :scale="plantScale"
  >
    <TresMesh :position="[0, 0.25, 0]" cast-shadow>
      <TresCylinderGeometry :args="[0.02, 0.025, 0.5, 6]" />
      <TresMeshStandardMaterial :color="leafColor" :roughness="0.8" />
    </TresMesh>
    <TresMesh :position="[0, 0.18, 0]" :scale="[1, 0.4, 1]" cast-shadow>
      <TresSphereGeometry :args="[0.16, 12, 8]" />
      <TresMeshStandardMaterial :color="leafColor" :roughness="0.8" />
    </TresMesh>
    <TresMesh :position="[0, 0.55, 0]" :visible="water.garden > 0.45" cast-shadow>
      <TresSphereGeometry :args="[0.11, 12, 8]" />
      <TresMeshStandardMaterial :color="p.color" :roughness="0.7" />
    </TresMesh>
  </TresGroup>

  <!-- bushes along the front of the house -->
  <TresMesh
    v-for="(x, i) in [-4.4, -3.85, -2.1]"
    :key="i"
    :position="[x, 0.3, 2.85]"
    cast-shadow
  >
    <TresSphereGeometry :args="[0.35, 24, 16]" />
    <TresMeshStandardMaterial :map="tex.leaves" :bump-map="tex.leaves" :bump-scale="1.5" :roughness="0.9" />
  </TresMesh>

  <!-- rocks -->
  <TresMesh
    v-for="(rock, i) in ROCKS"
    :key="i"
    :position="rock.p"
    :scale="rock.s"
    cast-shadow
    receive-shadow
  >
    <TresDodecahedronGeometry :args="[1, 1]" />
    <TresMeshStandardMaterial :map="tex.stone" :bump-map="tex.stone" :bump-scale="2" color="#9d9a94" :roughness="0.95" flat-shading />
  </TresMesh>

  <!-- trees -->
  <TresGroup
    v-for="(t, i) in treeSpots"
    :key="i"
    ref="trees"
    :position="[t.x, 0, t.z]"
    :scale="[t.s, t.s, t.s]"
  >
    <TresMesh :position="[0, 0.9, 0]" cast-shadow>
      <TresCylinderGeometry :args="[0.16, 0.28, 1.8, 12]" />
      <TresMeshStandardMaterial :map="tex.bark" :bump-map="tex.bark" :bump-scale="2" :roughness="1" />
    </TresMesh>
    <TresMesh
      v-for="(puff, k) in [
        { p: [0, 2.4, 0],
          r: 1.1 },
        { p: [0.7, 2.9, 0.3],
          r: 0.85 },
        { p: [-0.7, 2.8, -0.2],
          r: 0.8 },
        { p: [0.1, 3.4, -0.3],
          r: 0.7 },
        { p: [-0.2, 2.2, 0.8],
          r: 0.7 },
      ]"
      :key="k"
      :position="puff.p"
      cast-shadow
    >
      <TresSphereGeometry :args="[puff.r, 24, 16]" />
      <TresMeshStandardMaterial :map="tex.leaves" :bump-map="tex.leaves" :bump-scale="3" :roughness="0.9" />
    </TresMesh>
  </TresGroup>

  <!-- fence along the front, with a gap for the path -->
  <TresMesh
    v-for="x in fencePosts"
    :key="x"
    :position="[x, 0.45, 5.6]"
    cast-shadow
  >
    <TresBoxGeometry :args="[0.08, 0.9, 0.08]" />
    <TresMeshStandardMaterial color="#f1ece1" :roughness="0.6" />
  </TresMesh>
  <TresMesh
    v-for="(rail, i) in [
      { x: -5.65,
        w: 3.8,
        y: 0.3 },
      { x: -5.65,
        w: 3.8,
        y: 0.65 },
      { x: 1.2,
        w: 6.6,
        y: 0.3 },
      { x: 1.2,
        w: 6.6,
        y: 0.65 },
    ]"
    :key="i"
    :position="[rail.x, rail.y, 5.6]"
    cast-shadow
  >
    <TresBoxGeometry :args="[rail.w, 0.06, 0.04]" />
    <TresMeshStandardMaterial color="#f1ece1" :roughness="0.6" />
  </TresMesh>

  <!-- cloud: many puffs grouped together, click it to toggle the rain -->
  <TresGroup
    :position="[-3, 7.8, 0]"
    :scale="cloudScale"
    :visible="!liveOn || env.cloud > 8 || water.raining"
    @click="toggleRain"
    @pointerenter="setCursor('pointer')"
    @pointerleave="setCursor('auto')"
  >
    <TresMesh
      v-for="(puff, i) in cloudPuffs"
      :key="i"
      :position="puff.p"
    >
      <TresSphereGeometry :args="[puff.r, 32, 20]" />
      <TresMeshStandardMaterial :color="cloudColor(puff.shade)" :roughness="1" />
    </TresMesh>
  </TresGroup>

  <!-- rain drops: only visible while it is raining -->
  <TresGroup :visible="water.raining">
    <TresMesh
      v-for="(drop, i) in dropData"
      :key="i"
      ref="drops"
      :position="[drop.x, drop.y, drop.z]"
    >
      <TresCylinderGeometry :args="[0.012, 0.012, 0.45, 6]" />
      <TresMeshBasicMaterial color="#a9cdf2" transparent :opacity="0.6" />
    </TresMesh>
  </TresGroup>
</template>
