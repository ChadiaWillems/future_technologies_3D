<script setup lang="ts">
import { TresCanvas } from '@tresjs/core/webgpu'
import { OrbitControls } from '@tresjs/cientos/webgpu'
import { computed } from 'vue'
import Landscape from './components/Landscape.vue'
import { BARREL_LITERS, water } from './waterState'

const percent = computed(() => Math.round(water.fill * 100))
const liters = computed(() => Math.round(water.fill * BARREL_LITERS))
const used = computed(() => Math.round(water.used))
const gardenPercent = computed(() => Math.round(water.garden * 100))
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
        Click the cloud for rain. Click the tap on the barrel to water the garden.
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
</style>
