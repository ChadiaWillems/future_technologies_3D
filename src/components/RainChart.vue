<script setup lang="ts">
import { computed } from 'vue'
import { weatherData } from '../liveController'
import { history, live, water } from '../waterState'

// Barrel level (line) and rainfall (bars) over the time of the data. The marker is the moment being shown.
const WIDTH = 240
const HEIGHT = 110
const LEFT = 28
const RIGHT = 6
const TOP = 10
const BOTTOM = 16
const plotWidth = WIDTH - LEFT - RIGHT
const plotHeight = HEIGHT - TOP - BOTTOM

const ready = computed(() => live.enabled && live.status === 'ready' && weatherData.value !== null)

const x = (t: number) => LEFT + ((t - live.start) / (live.end - live.start)) * plotWidth
const y = (liters: number) => TOP + plotHeight - (Math.min(liters, water.capacity) / water.capacity) * plotHeight

const rainBars = computed(() => {
  const data = weatherData.value
  if (!data) { return [] }
  const rain = data.values.precipitation
  const max = Math.max(2, ...rain)
  return data.times.map((t, i) => {
    const height = (rain[i] / max) * plotHeight * 0.4
    return { x: x(t - 3_600_000), width: plotWidth / data.times.length, y: TOP + plotHeight - height, height }
  }).filter(bar => bar.height > 0.3)
})

// The line is drawn in pieces: a gap in the history (a jump in time) starts a new piece
const levelPath = computed(() => {
  let path = ''
  history.points.forEach((point, i) => {
    path += `${i === 0 || point.gap ? 'M' : 'L'}${x(point.t).toFixed(1)},${y(point.liters).toFixed(1)}`
  })
  return path
})

// Moments when the barrel was full: a rain drop on the rim means it spilled over
const fullDots = computed(() => history.points
  .filter(point => point.liters >= water.capacity - 0.5)
  .map(point => ({ x: x(point.t), y: y(point.liters) })))

const days = computed(() => {
  const data = weatherData.value
  if (!data) { return [] }
  const offset = data.utcOffsetSeconds * 1000
  const result: { x: number, label: string }[] = []
  const first = Math.ceil((live.start + offset) / 86_400_000) * 86_400_000 - offset
  for (let t = first; t <= live.end; t += 86_400_000) {
    const label = new Intl.DateTimeFormat('nl-BE', { timeZone: 'UTC', weekday: 'short', day: 'numeric' }).format(new Date(t + offset))
    result.push({ x: x(t), label })
  }
  return result
})

const marker = computed(() => x(live.time))
</script>

<template>
  <div class="chart">
    <svg v-if="ready" :viewBox="`0 0 ${WIDTH} ${HEIGHT}`" role="img" aria-label="Grafiek van het waterniveau in de ton en de neerslag">
      <!-- rain as bars -->
      <rect
        v-for="(bar, i) in rainBars"
        :key="i"
        :x="bar.x"
        :y="bar.y"
        :width="bar.width"
        :height="bar.height"
        class="rain"
      />
      <!-- the barrel's capacity -->
      <line :x1="LEFT" :x2="WIDTH - RIGHT" :y1="TOP" :y2="TOP" class="cap" />
      <line :x1="LEFT" :x2="WIDTH - RIGHT" :y1="TOP + plotHeight" :y2="TOP + plotHeight" class="axis" />
      <text :x="LEFT - 3" :y="TOP + 3" class="label end">{{ water.capacity }} L</text>
      <text :x="LEFT - 3" :y="TOP + plotHeight + 3" class="label end">0</text>
      <!-- days -->
      <g v-for="day in days" :key="day.label">
        <line :x1="day.x" :x2="day.x" :y1="TOP" :y2="TOP + plotHeight" class="day" />
        <text :x="day.x + 2" :y="HEIGHT - 3" class="label">{{ day.label }}</text>
      </g>
      <!-- barrel level -->
      <path :d="levelPath" class="level" />
      <circle v-for="(dot, i) in fullDots" :key="i" :cx="dot.x" :cy="dot.y" r="1.6" class="full" />
      <!-- the moment being shown -->
      <line :x1="marker" :x2="marker" :y1="TOP" :y2="TOP + plotHeight" class="marker" />
    </svg>
    <p v-else class="empty">
      Zet "Echte data" aan om de grafiek te zien.
    </p>
    <p v-if="ready" class="legend">
      <span class="swatch level-swatch"></span> waterstand
      <span class="swatch rain-swatch"></span> regen
      <span class="swatch full-swatch"></span> vol
    </p>
  </div>
</template>

<style scoped>
.chart {
  margin-top: 10px;
}
svg {
  display: block;
  width: 100%;
  height: auto;
}
.rain {
  fill: #9ec9f2;
  opacity: 0.8;
}
.level {
  fill: none;
  stroke: #1f6fbf;
  stroke-width: 2;
  stroke-linejoin: round;
}
.full {
  fill: #d93a3a;
}
.cap {
  stroke: #8a97a6;
  stroke-width: 0.7;
  stroke-dasharray: 3 2;
}
.axis {
  stroke: #8a97a6;
  stroke-width: 0.7;
}
.day {
  stroke: #cfd6de;
  stroke-width: 0.6;
}
.marker {
  stroke: #e67e22;
  stroke-width: 1.4;
}
.label {
  font-size: 7px;
  fill: #52606d;
}
.label.end {
  text-anchor: end;
}
.empty {
  margin: 0;
  font-size: 11px;
  color: #52606d;
}
.legend {
  margin: 2px 0 0;
  font-size: 10px;
  color: #52606d;
}
.swatch {
  display: inline-block;
  width: 9px;
  height: 9px;
  margin: 0 3px 0 6px;
  border-radius: 2px;
  vertical-align: -1px;
}
.level-swatch {
  background: #1f6fbf;
}
.rain-swatch {
  background: #9ec9f2;
}
.full-swatch {
  background: #d93a3a;
  border-radius: 50%;
}
</style>
