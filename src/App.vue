<script setup lang="ts">
import { TresCanvas } from '@tresjs/core/webgpu'
import { OrbitControls } from '@tresjs/cientos/webgpu'
import { computed, onMounted, ref } from 'vue'
import { speech, startListening, startWake, stopListening, stopWake } from './commands'
import { WAKE_PHRASE } from './wakeWord'
import Landscape from './components/Landscape.vue'
import RainChart from './components/RainChart.vue'
import { currentPosition, disableLive, enableLive, toggleManualRain } from './liveController'
import { PLACES, samePlace, searchPlaces } from './liveData'
import type { Place } from './liveData'
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

// The microphone icon: one command by voice (in "Hey Regenton" mode it means "I'm about to say it")
const micActive = computed(() => (speech.listening && !speech.wake) || speech.armed)
const micTitle = computed(() => {
  if (!speech.supported) { return 'Spraak wordt door deze browser niet ondersteund' }
  if (speech.wake) { return `${WAKE_PHRASE} staat aan: klik om meteen een commando te zeggen` }
  return speech.listening ? 'Ik luister… klik om te stoppen' : 'Spreek een commando'
})
function onMic() {
  if (speech.wake || !speech.listening) { startListening() }
  else { stopListening() }
}
function toggleWake() {
  if (speech.wake) { stopWake() }
  else { startWake() }
}

// The place: pick a preset, search any place on Earth, or use your own location
const isPreset = computed(() => PLACES.some(place => samePlace(place, live.place)))
const query = ref('')
const results = ref<Place[]>([])
const placeMessage = ref('')
const searching = ref(false)

function pickPreset(event: Event) {
  const place = PLACES.find(p => p.name === (event.target as HTMLSelectElement).value)
  if (place) { enableLive(place) }
}

async function search() {
  const text = query.value.trim()
  if (!text) { return }
  searching.value = true
  placeMessage.value = ''
  results.value = []
  try {
    results.value = await searchPlaces(text)
    if (!results.value.length) { placeMessage.value = `Geen plaats gevonden voor "${text}".` }
  }
  catch (error) {
    placeMessage.value = `Zoeken mislukt (${error instanceof Error ? error.message : 'onbekende fout'}).`
  }
  finally { searching.value = false }
}

function choose(place: Place) {
  results.value = []
  placeMessage.value = ''
  query.value = ''
  enableLive(place)
}

async function useMyLocation() {
  placeMessage.value = ''
  try { choose(await currentPosition()) }
  catch (error) { placeMessage.value = error instanceof Error ? error.message : 'Je locatie is niet beschikbaar.' }
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

  <!-- one widget: voice, location, the rain barrel and the chart -->
  <div class="hud">
    <div class="panel">
      <div class="panel-head">
        <h2>Regenwater</h2>
        <button
          class="icon-button"
          :class="{ listening: micActive,
                    awake: speech.wake }"
          :disabled="!speech.supported"
          :title="micTitle"
          :aria-label="micTitle"
          :aria-pressed="micActive"
          @click="onMic"
        >
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect x="9" y="2" width="6" height="12" rx="3" />
            <path d="M5 11a7 7 0 0 0 14 0" />
            <path d="M12 18v4" />
            <path d="M8 22h8" />
          </svg>
        </button>
      </div>

      <label class="switch-row">
        <input
          class="switch"
          type="checkbox"
          role="switch"
          :checked="speech.wake"
          :disabled="!speech.supported"
          @change="toggleWake"
        />
        <span>Zeg "{{ WAKE_PHRASE }}" om een commando te starten</span>
      </label>
      <p v-if="speech.wake" class="hint listening-hint">
        <template v-if="speech.armed">
          Ja? Zeg je commando…<span v-if="speech.interim"> "{{ speech.interim }}"</span>
        </template>
        <template v-else>
          Wacht op "{{ WAKE_PHRASE }}"…
        </template>
      </p>
      <p v-else-if="speech.listening" class="hint listening-hint">
        Ik luister…<span v-if="speech.interim"> "{{ speech.interim }}"</span>
      </p>
      <p v-if="speech.listening" class="hint">
        Let op: je browser kan het geluid naar een online dienst sturen om het te verstaan<template v-if="speech.wake">, zolang deze stand aanstaat continu</template>. Andere gesprekken worden niet getoond of bewaard.
      </p>
      <p v-if="speech.error" class="hint error">
        {{ speech.error }}
      </p>
      <p v-if="!speech.supported" class="hint error">
        Deze browser ondersteunt geen spraakherkenning (probeer Chrome of Edge).
      </p>
      <ul v-if="speech.log.length" class="log">
        <li v-for="(entry, i) in speech.log" :key="i" :class="{ bad: !entry.ok }">
          <div class="heard">
            "{{ entry.heard }}"
          </div>
          <div class="action">
            {{ entry.action }}
          </div>
          <div>{{ entry.result }}</div>
        </li>
      </ul>

      <!-- where the rain comes from -->
      <details class="section" open>
        <summary>Locatie</summary>
        <div class="buttons">
          <button :class="{ active: !live.enabled }" @click="disableLive()">
            Handmatig
          </button>
          <button :class="{ active: live.enabled }" @click="enableLive()">
            Echte data
          </button>
        </div>

        <template v-if="live.enabled">
          <select class="place" :value="live.place.name" @change="pickPreset">
            <option v-for="place in PLACES" :key="place.name" :value="place.name">
              {{ place.name }}
            </option>
            <option v-if="!isPreset" :value="live.place.name">
              {{ live.place.name }}
            </option>
          </select>
          <p v-if="live.place.detail" class="hint place-detail">
            {{ live.place.detail }}
          </p>

          <form class="typed" @submit.prevent="search">
            <input v-model="query" type="text" placeholder="Zoek een plaats, bv. Parijs" />
            <button type="submit" :disabled="searching">
              {{ searching ? '…' : 'Zoek' }}
            </button>
          </form>
          <ul v-if="results.length" class="results">
            <li v-for="place in results" :key="`${place.lat},${place.lon}`">
              <button @click="choose(place)">
                <b>{{ place.name }}</b>
                <span>{{ place.detail }}</span>
              </button>
            </li>
          </ul>
          <button class="here" @click="useMyLocation">
            Gebruik mijn locatie
          </button>
          <p v-if="placeMessage" class="hint error">
            {{ placeMessage }}
          </p>
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
            <span v-if="!live.playing" class="paused">(gepauzeerd: zeg "speel af")</span>
          </div>
          <input
            v-model.number="live.time"
            class="slider"
            type="range"
            :min="live.start"
            :max="live.end"
            :step="900000"
            aria-label="Tijd"
          />
          <div class="row">
            <span>Regen</span><span>{{ env.precipitation.toFixed(1) }} mm/u</span>
          </div>
        </template>

        <p class="hint">
          Weerdata: <a href="https://open-meteo.com/" target="_blank" rel="noopener">Open-Meteo.com</a> (CC BY 4.0).
          Zonnestand: SunCalc.
        </p>
      </details>

      <!-- the rain barrel -->
      <details class="section" open>
        <summary>Regenton</summary>
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
      </details>

      <!-- chart -->
      <details class="section" open>
        <summary>Waterstand en regen</summary>
        <RainChart />
      </details>
    </div>
  </div>
</template>

<style scoped>
.hud {
  position: fixed;
  top: 12px;
  right: 12px;
  z-index: 10;
  max-height: calc(100vh - 24px);
  overflow-y: auto;
  border-radius: 10px;
  font-family: system-ui, sans-serif;
}
.panel {
  width: clamp(260px, calc(100vw - 24px), 350px);
  padding: 12px 14px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.9);
  color: #1d2733;
  font-size: 13px;
  box-shadow: 0 2px 10px rgba(0, 0, 0, 0.15);
}
h2 {
  margin: 0;
  font-size: 16px;
}
.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 8px;
}

/* sections with their own heading */
.section {
  margin-top: 12px;
  padding-top: 10px;
  border-top: 1px solid #d9e2ec;
}
.section summary {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-bottom: 8px;
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  list-style: none;
}
.section summary::-webkit-details-marker {
  display: none;
}
.section summary::before {
  content: '';
  width: 6px;
  height: 6px;
  border-right: 2px solid #52606d;
  border-bottom: 2px solid #52606d;
  transform: rotate(-45deg);
  transition: transform 0.15s;
}
.section[open] summary::before {
  transform: rotate(45deg);
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
.section > .buttons:first-of-type {
  margin-top: 0;
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
  margin: 8px 0 0;
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
.place {
  width: 100%;
  margin-top: 8px;
  padding: 5px 6px;
  border-radius: 6px;
  border: 1px solid #c3ccd6;
  background: #fff;
  color: #1d2733;
  font-size: 12px;
}
.place-detail {
  margin-top: 4px;
}
.clock {
  margin-top: 10px;
  font-weight: 600;
  text-transform: capitalize;
}
.paused {
  font-weight: 400;
  color: #b3261e;
  text-transform: none;
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
  margin-top: 8px;
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
.results {
  margin: 8px 0 0;
  padding: 0;
  list-style: none;
}
.results button {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  width: 100%;
  margin-top: 4px;
  padding: 5px 8px;
  background: #e3e9f0;
  color: #1d2733;
  text-align: left;
}
.results button span {
  font-size: 11px;
  color: #52606d;
}
.here {
  width: 100%;
  margin-top: 8px;
  background: #e3e9f0;
  color: #1d2733;
}

/* what was heard and what happened */
.log {
  margin: 8px 0 0;
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

/* microphone icon and the "Hey Regenton" switch */
.icon-button {
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  padding: 0;
  border-radius: 50%;
}
.icon-button.listening {
  background: #d93a3a;
  animation: listening-pulse 1.2s ease-out infinite;
}
.icon-button.awake:not(.listening) {
  box-shadow: 0 0 0 3px rgba(59, 143, 217, 0.5);
}
.listening-hint {
  color: #b3261e;
  font-weight: 600;
}
.switch-row {
  display: flex;
  align-items: center;
  gap: 10px;
  font-size: 12px;
  line-height: 1.35;
  cursor: pointer;
}
.switch {
  appearance: none;
  flex: 0 0 auto;
  position: relative;
  width: 38px;
  height: 22px;
  margin: 0;
  border-radius: 11px;
  background: #b8c2cd;
  transition: background 0.15s;
  cursor: pointer;
}
.switch::after {
  content: '';
  position: absolute;
  top: 3px;
  left: 3px;
  width: 16px;
  height: 16px;
  border-radius: 50%;
  background: #fff;
  box-shadow: 0 1px 2px rgba(0, 0, 0, 0.3);
  transition: transform 0.15s;
}
.switch:checked {
  background: #3b8fd9;
}
.switch:checked::after {
  transform: translateX(16px);
}
.switch:focus-visible {
  outline: 2px solid #1d6fb8;
  outline-offset: 2px;
}
.switch:disabled {
  opacity: 0.45;
  cursor: not-allowed;
}
@keyframes listening-pulse {
  0% {
    box-shadow: 0 0 0 0 rgba(217, 58, 58, 0.55);
  }
  100% {
    box-shadow: 0 0 0 10px rgba(217, 58, 58, 0);
  }
}
@media (prefers-reduced-motion: reduce) {
  .icon-button.listening {
    animation: none;
  }
  .switch,
  .switch::after {
    transition: none;
  }
}
</style>
