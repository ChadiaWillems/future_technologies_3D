<script setup lang="ts">
import { TresCanvas } from '@tresjs/core/webgpu'
import { OrbitControls } from '@tresjs/cientos/webgpu'
import { computed, onMounted, ref } from 'vue'
import { BUTTONS, runCommand, speech, startListening, stopListening } from './commands'
import Landscape from './components/Landscape.vue'
import RainChart from './components/RainChart.vue'
import { disableLive, enableLive, jumpToNow, toggleManualRain } from './liveController'
import { PLACES } from './liveData'
import { env, live, water } from './waterState'

const percent = computed(() => Math.round(water.fill * 100))
const liters = computed(() => Math.round(water.fill * water.capacity))
const used = computed(() => Math.round(water.used))
const overflowed = computed(() => Math.round(water.overflowed))
const inflow = computed(() => Math.round(env.inflow))
const gardenPercent = computed(() => Math.round(water.garden * 100))

const liveReady = computed(() => live.enabled && live.status === 'ready')

// Start with real data; the page falls back to manual mode if the weather service can't be reached
onMounted(() => { enableLive() })

function changePlace(event: Event) {
  enableLive(Number((event.target as HTMLSelectElement).value))
}

const typed = ref('')
function runTyped() {
  if (!typed.value.trim()) { return }
  runCommand(typed.value, 'tekst')
  typed.value = ''
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

  <!-- real rainfall: Open-Meteo -->
  <div class="hud hud-right">
    <div class="panel">
      <h3>Echte neerslag</h3>
      <div class="buttons">
        <button :class="{ active: !live.enabled }" @click="disableLive()">
          Handmatig
        </button>
        <button :class="{ active: live.enabled }" @click="enableLive()">
          Echte data
        </button>
      </div>

      <template v-if="live.enabled">
        <select class="place" :value="live.placeIndex" @change="changePlace">
          <option v-for="(place, i) in PLACES" :key="place.name" :value="i">
            {{ place.name }}
          </option>
        </select>
        <p v-if="live.status === 'loading'" class="hint">
          Weerdata laden…
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
            {{ live.playing ? 'Pauze' : 'Speel af' }}
          </button>
          <button @click="jumpToNow()">
            Nu
          </button>
          <select v-model.number="live.secondsPerHour">
            <option :value="2">
              1 u = 2 s
            </option>
            <option :value="6">
              1 u = 6 s
            </option>
            <option :value="15">
              1 u = 15 s
            </option>
            <option :value="3600">
              Echte tijd
            </option>
          </select>
        </div>

        <div class="row">
          <span>Regen</span><span>{{ env.precipitation.toFixed(1) }} mm/u</span>
        </div>
      </template>

      <p class="hint">
        Weerdata: <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo.com</a> (CC BY 4.0).
        Zonnestand: SunCalc.
      </p>
    </div>

    <!-- chart of the barrel level and the rain -->
    <div class="panel">
      <h3>Waterstand en regen</h3>
      <RainChart />
    </div>
  </div>

  <div class="hud hud-left">
    <!-- the rain barrel: live values, chart and settings -->
    <div class="panel">
      <h3>Regenton</h3>
      <div class="bar">
        <div class="bar-fill water" :style="{ width: `${percent}%` }"></div>
      </div>
      <div class="row">
        <span>{{ liters }} / {{ water.capacity }} L</span>
        <span>{{ percent }}%</span>
      </div>
      <div class="row">
        <span>Dak levert</span><span>{{ inflow }} L/u</span>
      </div>
      <div class="row">
        <span>Verbruikt</span><span>{{ used }} L</span>
      </div>
      <div class="row">
        <span>Overgelopen</span><span>{{ overflowed }} L</span>
      </div>
      <div class="row">
        <span>Tuin</span><span>{{ gardenPercent }}%</span>
      </div>
      <div class="bar small">
        <div class="bar-fill garden" :style="{ width: `${gardenPercent}%` }"></div>
      </div>

      <label class="field">
        <span>Tonvolume <b>{{ water.capacity }} L</b></span>
        <input v-model.number="water.capacity" type="range" min="100" max="600" step="50" />
      </label>
      <label class="field">
        <span>Verbruik huishouden <b>{{ water.usage }} L/u</b></span>
        <input v-model.number="water.usage" type="range" min="0" max="60" step="5" />
      </label>

      <div class="buttons">
        <button @click="toggleManualRain()">
          {{ water.raining && !live.enabled ? 'Stop regen' : 'Laat regenen' }}
        </button>
        <button @click="water.cutaway = !water.cutaway">
          {{ water.cutaway ? 'Sluit huis' : 'Kijk binnen' }}
        </button>
      </div>
      <p class="hint">
        Lamp bij de ton: groen = genoeg, oranje = bijna leeg, rood = leeg, blauw = loopt over.
        Klik op de kranen, het afvoerventiel (onderaan de ton) of de wolk.
      </p>
    </div>

    <!-- voice commands, with buttons and a text field as a fallback -->
    <div class="panel">
      <h3>Spraak</h3>
      <div class="buttons">
        <button
          :class="{ active: speech.listening }"
          :disabled="!speech.supported"
          @click="speech.listening ? stopListening() : startListening()"
        >
          {{ speech.listening ? 'Ik luister… (stop)' : 'Spreek een commando' }}
        </button>
      </div>
      <p v-if="speech.interim" class="hint">
        Verstaan: "{{ speech.interim }}"
      </p>
      <p v-if="speech.error" class="hint error">
        {{ speech.error }}
      </p>
      <p v-if="!speech.supported" class="hint error">
        Deze browser ondersteunt geen spraakherkenning (probeer Chrome of Edge). Gebruik de knoppen of typ een commando.
      </p>
      <p class="hint">
        Let op: je browser kan het geluid naar een online dienst sturen om het te verstaan.
      </p>

      <form class="typed" @submit.prevent="runTyped">
        <input v-model="typed" type="text" placeholder="Of typ: leeg de ton" />
        <button type="submit">
          Voer uit
        </button>
      </form>

      <div class="chips">
        <button v-for="b in BUTTONS" :key="b.label" @click="runCommand(b.phrase, 'knop')">
          {{ b.label }}
        </button>
      </div>

      <ul v-if="speech.log.length" class="log">
        <li v-for="(entry, i) in speech.log" :key="i" :class="{ bad: !entry.ok }">
          <div class="heard">
            {{ entry.source }}: "{{ entry.heard }}"
          </div>
          <div class="action">
            {{ entry.action }}
          </div>
          <div>{{ entry.result }}</div>
        </li>
      </ul>
      <p v-else class="hint">
        Probeer: "zet de regen aan", "hoeveel water zit er in de ton", "leeg de ton", "zet de tijd op 15 uur", "zet de ton volume op 400" of "zet het verbruik op 30".
      </p>
    </div>
  </div>
</template>

<style scoped>
.hud {
  position: fixed;
  top: 12px;
  z-index: 10;
  display: flex;
  flex-direction: column;
  gap: 10px;
  max-height: calc(100vh - 24px);
  overflow-y: auto;
  pointer-events: none;
  font-family: system-ui, sans-serif;
}
.hud-left {
  left: 12px;
}
.hud-right {
  right: 12px;
}
.hud-right .panel {
  width: clamp(220px, calc(100vw - 298px), 340px);
}
.panel {
  width: 250px;
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
button:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
.buttons button.active {
  background: #3b8fd9;
}
.hint {
  margin: 10px 0 0;
  font-size: 11px;
  line-height: 1.4;
  color: #52606d;
}
.hint.error {
  color: #b3261e;
}
.hint a {
  color: #1d6fb8;
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
.field {
  display: block;
  margin-top: 10px;
}
.field span {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
}
.field input {
  width: 100%;
  margin: 2px 0 0;
}
.typed {
  display: flex;
  gap: 6px;
  margin-top: 10px;
}
.typed input {
  flex: 1;
  min-width: 0;
  padding: 5px 6px;
  border-radius: 6px;
  border: 1px solid #c3ccd6;
  font-size: 12px;
}
.typed button {
  flex: 0 0 auto;
}
.chips {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  margin-top: 10px;
}
.chips button {
  flex: 0 0 auto;
  padding: 4px 8px;
  background: #e3e9f0;
  color: #1d2733;
}
.log {
  margin: 10px 0 0;
  padding: 0;
  list-style: none;
  font-size: 11px;
  line-height: 1.35;
}
.log li {
  padding: 6px 0;
  border-top: 1px solid #d9e2ec;
}
.log .heard {
  color: #52606d;
}
.log .action {
  font-weight: 600;
}
.log .bad .action {
  color: #b3261e;
}
</style>
