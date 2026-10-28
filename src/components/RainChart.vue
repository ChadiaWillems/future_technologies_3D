<script setup lang="ts">
import { computed, ref } from 'vue'
import { weatherData } from '../liveController'
import { formatLocal, sampleWeather } from '../liveData'
import { history, live, manualClock, water } from '../waterState'

// Barrel level (blue line and area) and rainfall (bars) over time. The orange line is the moment being shown.
// With real data the chart covers all of the data: hover to read values, click to jump to that moment.
// In manual mode it shows the last 12 simulated hours (1 hour = 6 seconds).
const WIDTH = 330
const HEIGHT = 175
const LEFT = 44
const RIGHT = 10
const TOP = 24
const BOTTOM = 24
const plotWidth = WIDTH - LEFT - RIGHT
const plotHeight = HEIGHT - TOP - BOTTOM
const baseline = TOP + plotHeight

const HOUR = 3_600_000
const POINT_EVERY = 10 * 60_000
const MANUAL_WINDOW = 12 * HOUR

const isLive = computed(() => live.enabled && live.status === 'ready' && weatherData.value !== null)

const range = computed(() => {
  if (isLive.value) { return { start: live.start, end: live.end } }
  const end = Math.max(manualClock.time, MANUAL_WINDOW)
  return { start: end - MANUAL_WINDOW, end }
})
const span = computed(() => range.value.end - range.value.start)

const x = (t: number) => LEFT + ((t - range.value.start) / span.value) * plotWidth
const y = (liters: number) => baseline - (Math.min(Math.max(liters, 0), water.capacity) / water.capacity) * plotHeight

// Rain bars: real data has one value per hour; in manual mode the rain is read from the recorded points
const rainBars = computed(() => {
  const data = weatherData.value
  if (isLive.value && data) {
    const rain = data.values.precipitation
    return data.times.map((t, i) => ({ t: t - HOUR, length: HOUR, rain: rain[i] }))
  }
  return history.points.map(p => ({ t: p.t - POINT_EVERY, length: POINT_EVERY, rain: p.rain }))
})
const maxRain = computed(() => Math.max(2, ...rainBars.value.map(bar => bar.rain)))
const bars = computed(() => rainBars.value
  .map((bar) => {
    const height = (bar.rain / maxRain.value) * plotHeight * 0.45
    return { x: x(bar.t), width: Math.max(0.8, (bar.length / span.value) * plotWidth), y: baseline - height, height }
  })
  .filter(bar => bar.height > 0.4))

// The line is drawn in pieces: a gap in the history (a jump in time) starts a new piece
const segments = computed(() => {
  const result: { t: number, liters: number }[][] = []
  history.points.forEach((point) => {
    if (!result.length || point.gap) { result.push([]) }
    result[result.length - 1].push(point)
  })
  return result
})
const levelPath = computed(() => segments.value
  .map(piece => piece.map((p, i) => `${i ? 'L' : 'M'}${x(p.t).toFixed(1)},${y(p.liters).toFixed(1)}`).join(''))
  .join(''))
const areaPath = computed(() => segments.value
  .filter(piece => piece.length > 1)
  .map(piece => `M${x(piece[0].t).toFixed(1)},${baseline}${piece.map(p => `L${x(p.t).toFixed(1)},${y(p.liters).toFixed(1)}`).join('')}L${x(piece[piece.length - 1].t).toFixed(1)},${baseline}Z`)
  .join(''))

// Moments when the barrel was full
const fullDots = computed(() => history.points
  .filter(point => point.liters >= water.capacity - 0.5)
  .map(point => ({ x: x(point.t), y: y(point.liters) })))

// Labels under the chart: days for real data, simulated hours in manual mode
const ticks = computed(() => {
  const data = weatherData.value
  const result: { x: number, label: string }[] = []
  if (isLive.value && data) {
    const offset = data.utcOffsetSeconds * 1000
    const first = Math.ceil((range.value.start + offset) / (24 * HOUR)) * 24 * HOUR - offset
    for (let t = first; t <= range.value.end; t += 24 * HOUR) {
      const label = new Intl.DateTimeFormat('nl-BE', { timeZone: 'UTC', weekday: 'short', day: 'numeric', month: 'short' }).format(new Date(t + offset))
      result.push({ x: x(t), label })
    }
    return result
  }
  for (let t = Math.ceil(range.value.start / (2 * HOUR)) * 2 * HOUR; t <= range.value.end; t += 2 * HOUR) {
    result.push({ x: x(t), label: `${Math.round(t / HOUR)} u` })
  }
  return result
})

const yTicks = computed(() => [0, 0.5, 1].map(f => ({ y: y(f * water.capacity), label: Math.round(f * water.capacity) })))

const markerTime = computed(() => isLive.value ? live.time : manualClock.time)
const marker = computed(() => x(markerTime.value))
const currentLiters = computed(() => Math.round(water.fill * water.capacity))
// keep the label of the marker inside the chart
const markerLabelRight = computed(() => marker.value > LEFT + plotWidth * 0.75)

// Hovering shows the values at that moment; with real data clicking jumps there
const hoverX = ref<number | null>(null)
const hoverTime = computed(() => hoverX.value === null ? null : range.value.start + ((hoverX.value - LEFT) / plotWidth) * span.value)

function toChartX(event: MouseEvent) {
  const box = (event.currentTarget as SVGElement).getBoundingClientRect()
  return ((event.clientX - box.left) / box.width) * WIDTH
}
function onMove(event: MouseEvent) {
  const px = toChartX(event)
  hoverX.value = px >= LEFT && px <= WIDTH - RIGHT ? px : null
}
function onClick() {
  if (isLive.value && hoverTime.value !== null) { live.time = Math.min(live.end, Math.max(live.start, hoverTime.value)) }
}

const readout = computed(() => {
  const t = hoverTime.value
  if (t === null) { return null }
  const near = history.points.find(p => Math.abs(p.t - t) < 30 * 60_000)
  const data = weatherData.value
  if (isLive.value && data) {
    return {
      time: formatLocal(data, t),
      rain: sampleWeather(data, t).precipitation.toFixed(1),
      level: near ? `${Math.round(near.liters)} L` : null,
    }
  }
  return {
    time: `${(t / HOUR).toFixed(1).replace('.', ',')} u na de start`,
    rain: (near?.rain ?? 0).toFixed(1),
    level: near ? `${Math.round(near.liters)} L` : null,
  }
})
</script>

<template>
  <div class="chart">
    <p class="readout">
      <template v-if="readout">
        <b>{{ readout.time }}</b>
        <span>regen {{ readout.rain }} mm/u</span>
        <span v-if="readout.level">ton {{ readout.level }}</span>
        <span v-else class="muted">ton nog niet gespeeld</span>
      </template>
      <span v-else class="muted">
        {{ isLive ? 'Beweeg over de grafiek of klik om naar een moment te springen.' : 'Handmatig: de laatste 12 uur (1 uur = 6 seconden). Beweeg over de grafiek om waarden te lezen.' }}
      </span>
    </p>

    <svg
      :class="{ jumpable: isLive }"
      :viewBox="`0 0 ${WIDTH} ${HEIGHT}`"
      role="img"
      aria-label="Grafiek van het waterniveau in de ton en de neerslag"
      @mousemove="onMove"
      @mouseleave="hoverX = null"
      @click="onClick"
    >
      <defs>
        <clipPath id="plot-area">
          <rect :x="LEFT" :y="TOP - 4" :width="plotWidth" :height="plotHeight + 4" />
        </clipPath>
      </defs>

      <!-- grid and axes -->
      <g v-for="tick in yTicks" :key="tick.label">
        <line :x1="LEFT" :x2="WIDTH - RIGHT" :y1="tick.y" :y2="tick.y" class="grid" />
        <text :x="LEFT - 5" :y="tick.y + 4" class="label end">{{ tick.label }} L</text>
      </g>
      <g v-for="tick in ticks" :key="tick.label">
        <line :x1="tick.x" :x2="tick.x" :y1="TOP" :y2="baseline + 4" class="day" />
        <text v-if="tick.x < WIDTH - RIGHT - 22" :x="tick.x + 4" :y="HEIGHT - 6" class="label day-label" :class="{ capital: isLive }">{{ tick.label }}</text>
      </g>

      <!-- rain as bars, then the barrel level on top -->
      <g clip-path="url(#plot-area)">
        <rect
          v-for="(bar, i) in bars"
          :key="i"
          :x="bar.x"
          :y="bar.y"
          :width="bar.width"
          :height="bar.height"
          class="rain"
        />
        <path :d="areaPath" class="area" />
        <path :d="levelPath" class="level" />
        <circle v-for="(dot, i) in fullDots" :key="i" :cx="dot.x" :cy="dot.y" r="3" class="full" />
      </g>

      <!-- hover guide -->
      <line v-if="hoverX !== null" :x1="hoverX" :x2="hoverX" :y1="TOP" :y2="baseline" class="hover" />

      <!-- the moment being shown, with the current level -->
      <line :x1="marker" :x2="marker" :y1="TOP - 4" :y2="baseline" class="marker" />
      <text :x="marker + (markerLabelRight ? -5 : 5)" :y="TOP - 8" class="label marker-label" :class="{ end: markerLabelRight }">
        nu {{ currentLiters }} L
      </text>
    </svg>

    <ul class="legend">
      <li><span class="swatch level-swatch"></span> waterstand in de ton</li>
      <li><span class="swatch rain-swatch"></span> regen (hoogste staaf {{ maxRain.toFixed(1) }} mm/u)</li>
      <li><span class="swatch full-swatch"></span> ton was vol (overloop)</li>
      <li><span class="swatch marker-swatch"></span> het moment dat je nu ziet</li>
    </ul>
  </div>
</template>

<style scoped>
.chart {
  margin-top: 4px;
}
svg {
  display: block;
  width: 100%;
  height: auto;
  cursor: default;
}
svg.jumpable {
  cursor: crosshair;
}
.readout {
  display: flex;
  flex-wrap: wrap;
  gap: 2px 10px;
  min-height: 32px;
  margin: 0 0 4px;
  font-size: 12px;
  line-height: 1.35;
  color: #1d2733;
}
.readout b {
  display: inline-block;
}
.readout b::first-letter {
  text-transform: uppercase;
}
.muted {
  color: #6b7785;
}
.grid {
  stroke: #dfe5ec;
  stroke-width: 1;
}
.day {
  stroke: #b8c2cd;
  stroke-width: 1;
}
.rain {
  fill: #6fb1f0;
  opacity: 0.55;
}
.area {
  fill: #1f6fbf;
  opacity: 0.18;
}
.level {
  fill: none;
  stroke: #1f6fbf;
  stroke-width: 3;
  stroke-linejoin: round;
  stroke-linecap: round;
}
.full {
  fill: #d93a3a;
  stroke: #fff;
  stroke-width: 1;
}
.hover {
  stroke: #52606d;
  stroke-width: 1;
  stroke-dasharray: 3 3;
}
.marker {
  stroke: #e67e22;
  stroke-width: 2;
}
.label {
  font-size: 11px;
  fill: #3e4c59;
}
.label.end {
  text-anchor: end;
}
.day-label {
  font-weight: 600;
}
.day-label.capital {
  text-transform: capitalize;
}
.marker-label {
  fill: #c25e0a;
  font-weight: 700;
}
.legend {
  display: grid;
  gap: 3px;
  margin: 8px 0 0;
  padding: 0;
  list-style: none;
  font-size: 11.5px;
  color: #3e4c59;
}
.swatch {
  display: inline-block;
  width: 12px;
  height: 10px;
  margin-right: 6px;
  border-radius: 2px;
  vertical-align: -1px;
}
.level-swatch {
  background: #1f6fbf;
  height: 4px;
  vertical-align: 2px;
}
.rain-swatch {
  background: #6fb1f0;
}
.full-swatch {
  width: 10px;
  background: #d93a3a;
  border-radius: 50%;
}
.marker-swatch {
  background: #e67e22;
  width: 3px;
  height: 12px;
  margin-right: 9px;
  margin-left: 4px;
}
</style>
