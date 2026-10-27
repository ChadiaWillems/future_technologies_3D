<script setup lang="ts">
import { TresCanvas } from '@tresjs/core/webgpu'
import { OrbitControls } from '@tresjs/cientos/webgpu'
import { computed, onMounted } from 'vue'
import Landscape from './components/Landscape.vue'
import { disableLive, enableLive, jumpToNow } from './liveController'
import { PLACES } from './liveData'
import { BARREL_LITERS, env, live, water } from './waterState'

const percent = computed(() => Math.round(water.fill * 100))
const liters = computed(() => Math.round(water.fill * BARREL_LITERS))
const used = computed(() => Math.round(water.used))
const gardenPercent = computed(() => Math.round(water.garden * 100))

const liveReady = computed(() => live.enabled && live.status === 'ready')

// Start with real data; the page falls back to manual mode if the weather service can't be reached
onMounted(() => { enableLive() })

function changePlace(event: Event) {
  enableLive(Number((event.target as HTMLSelectElement).value))
}
</script>

<template>
  <TresCanvas
    window-size
    shadows
  >
    <TresPerspectiveCamera :args="[45, 1, 0.1, 1000]" :position="[10, 9, 19]" />
    <OrbitControls
      :target="[-1.5, 2.5, 2.5]"
      :max-polar-angle="Math.PI / 2 - 0.03"
      :min-distance="3"
      :max-distance="60"
    />
    <Landscape />
  </TresCanvas>

  <!-- real data: Open-Meteo weather and the SunCalc sun -->
  <div class="hud hud-right">
    <div class="panel">
      <h3>Real rainfall</h3>
      <div class="buttons">
        <button :class="{ active: !live.enabled }" @click="disableLive()">
          Manual
        </button>
        <button :class="{ active: live.enabled }" @click="enableLive()">
          Real data
        </button>
      </div>

      <template v-if="live.enabled">
        <select class="place" :value="live.placeIndex" @change="changePlace">
          <option v-for="(place, i) in PLACES" :key="place.name" :value="i">
            {{ place.name }}
          </option>
        </select>
        <p v-if="live.status === 'loading'" class="hint">
          Loading weather data…
        </p>
      </template>
      <p v-if="live.status === 'error'" class="hint error">
        {{ live.message }}
      </p>

      <template v-if="liveReady">
        <div class="clock">
          {{ env.timeLabel }}
        </div>
        <input
          v-model.number="live.time"
          class="slider"
          type="range"
          :min="live.start"
          :max="live.end"
          :step="900000"
        />
        <div class="buttons">
          <button @click="live.playing = !live.playing">
            {{ live.playing ? 'Pause' : 'Play' }}
          </button>
          <button @click="jumpToNow()">
            Now
          </button>
          <select v-model.number="live.secondsPerHour">
            <option :value="2">
              1 h = 2 s
            </option>
            <option :value="6">
              1 h = 6 s
            </option>
            <option :value="15">
              1 h = 15 s
            </option>
            <option :value="3600">
              Real time
            </option>
          </select>
        </div>

        <div class="row">
          <span>Rain</span><span>{{ env.precipitation.toFixed(1) }} mm/h</span>
        </div>
      </template>

      <p class="hint">
        Weather: <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo.com</a> (CC BY 4.0).
        Sun and moon: SunCalc.
      </p>
    </div>
  </div>

  <!-- water meter -->
  <div class="hud">
    <div class="panel">
      <h3>Rain barrel</h3>
      <div class="bar">
        <div class="bar-fill water" :style="{ width: `${percent}%` }"></div>
      </div>
      <div class="row">
        <span>{{ liters }} / {{ BARREL_LITERS }} L</span>
        <span>{{ percent }}%</span>
      </div>
      <div class="row">
        <span>Water used</span>
        <span>{{ used }} L</span>
      </div>
      <div class="row">
        <span>Garden health</span>
        <span>{{ gardenPercent }}%</span>
      </div>
      <div class="bar small">
        <div class="bar-fill garden" :style="{ width: `${gardenPercent}%` }"></div>
      </div>
      <div class="buttons">
        <button @click="water.raining = !water.raining">
          {{ water.raining ? 'Stop rain' : 'Make it rain' }}
        </button>
        <button @click="water.cutaway = !water.cutaway">
          {{ water.cutaway ? 'Close the house' : 'Look inside' }}
        </button>
      </div>
      <p class="hint">
        Click the cloud for rain (manual mode). Click the tap on the barrel to water the garden.
        Look inside, then click the toilet or the sink tap to use the pump.
      </p>
    </div>
  </div>
</template>

<style scoped>
.hud {
  position: fixed;
  top: 12px;
  left: 12px;
  z-index: 10;
  pointer-events: none;
  font-family: system-ui, sans-serif;
}
.panel {
  width: 240px;
  padding: 12px 14px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.88);
  color: #1d2733;
  font-size: 13px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.15);
  pointer-events: auto;
}
h3 {
  margin: 0 0 8px;
  font-size: 14px;
}
.row {
  display: flex;
  justify-content: space-between;
  margin-top: 4px;
}
.bar {
  height: 12px;
  border-radius: 6px;
  background: #d9e2ec;
  overflow: hidden;
}
.bar.small {
  height: 8px;
  margin-top: 4px;
}
.bar-fill {
  height: 100%;
  transition: width 0.2s;
}
.bar-fill.water {
  background: #3b8fd9;
}
.bar-fill.garden {
  background: #3f9b3f;
}
.buttons {
  display: flex;
  gap: 6px;
  margin-top: 10px;
}
button {
  flex: 1;
  padding: 6px 8px;
  border: 0;
  border-radius: 6px;
  background: #1d2733;
  color: #fff;
  font-size: 12px;
  cursor: pointer;
}
.hint {
  margin: 10px 0 0;
  font-size: 11px;
  line-height: 1.4;
  color: #52606d;
}

.hud-right {
  left: auto;
  right: 12px;
}
.buttons button.active {
  background: #3b8fd9;
}
.place,
.buttons select {
  margin-top: 8px;
  padding: 5px 6px;
  border-radius: 6px;
  border: 1px solid #c3ccd6;
  background: #fff;
  color: #1d2733;
  font-size: 12px;
}
.buttons select {
  flex: 1;
  margin-top: 0;
}
.place {
  width: 100%;
}
.clock {
  margin-top: 10px;
  font-weight: 600;
  text-transform: capitalize;
}
.slider {
  width: 100%;
  margin: 6px 0 2px;
}
.hint.error {
  color: #b3261e;
}
.hint a {
  color: #1d6fb8;
}
</style>
