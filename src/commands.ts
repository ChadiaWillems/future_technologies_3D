import { reactive } from 'vue'
import { disableLive, weatherData } from './liveController'
import { formatLocal } from './liveData'
import { env, live, water } from './waterState'

// Voice commands (Web Speech API) and the text/button fallbacks that run the same commands.

export interface LogEntry {
  /** What was heard, typed or pressed */
  heard: string
  /** Which command that was understood as */
  action: string
  /** What happened */
  result: string
  ok: boolean
  source: 'spraak' | 'tekst' | 'knop'
}

const SpeechRecognitionClass: any = typeof window !== 'undefined'
  ? ((window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition)
  : undefined

export const speech = reactive({
  supported: Boolean(SpeechRecognitionClass),
  listening: false,
  /** Text that is being recognised right now */
  interim: '',
  error: '',
  log: [] as LogEntry[],
})

// Number words that speech recognition sometimes returns instead of digits
const NUMBER_WORDS: Record<string, number> = {
  nul: 0,
  vijfentwintig: 25,
  dertig: 30,
  veertig: 40,
  vijftig: 50,
  zestig: 60,
  een: 1,
  twee: 2,
  drie: 3,
  vier: 4,
  vijf: 5,
  zes: 6,
  zeven: 7,
  acht: 8,
  negen: 9,
  tien: 10,
  elf: 11,
  twaalf: 12,
  dertien: 13,
  veertien: 14,
  vijftien: 15,
  zestien: 16,
  zeventien: 17,
  achttien: 18,
  negentien: 19,
  twintig: 20,
  eenentwintig: 21,
  tweeentwintig: 22,
  drieentwintig: 23,
  vierentwintig: 24,
}

/** Lower case, no accents or punctuation, so "Één uur!" and "een uur" look the same */
export function normalize(text: string) {
  return text.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

function findHour(text: string): number | null {
  const digits = text.match(/\b(\d{1,2})(?:\s*(?:uur|u|h))?\b/)
  if (digits) { return Number(digits[1]) }
  for (const [word, value] of Object.entries(NUMBER_WORDS)) {
    if (new RegExp(`\\b${word}\\b`).test(text)) { return value }
  }
  return null
}

const has = (text: string, ...words: string[]) => words.some(word => text.includes(word))

const HUNDREDS: Record<string, number> = { een: 1, twee: 2, drie: 3, vier: 4, vijf: 5, zes: 6 }

/** The number in a sentence: digits ("100", "2,5") or Dutch words ("vijftig", "driehonderd", "honderdvijftig"). */
export function findNumber(text: string): number | null {
  const digits = text.match(/\b\d+(?:[.,]\d+)?\b/)
  if (digits) { return Number(digits[0].replace(',', '.')) }
  let rest = text
  let total = 0
  let found = false
  const hundreds = rest.match(/\b(een|twee|drie|vier|vijf|zes)?honderd/)
  if (hundreds) {
    total += (hundreds[1] ? HUNDREDS[hundreds[1]] : 1) * 100
    rest = rest.replace(hundreds[0], ' ')
    found = true
  }
  for (const [word, value] of Object.entries(NUMBER_WORDS)) {
    if (new RegExp(`\\b${word}\\b`).test(rest)) { return total + value }
  }
  return found ? total : null
}

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))
/** Round to the step of a slider and keep it inside the slider */
function toSlider(value: number, min: number, max: number, step: number) {
  return clamp(Math.round(value / step) * step, min, max)
}

interface Command {
  id: string
  /** Shown in the log */
  label: string
  /** Words that must be recognised */
  matches: (text: string) => boolean
  run: (text: string) => string
  /** Questions are also answered out loud when you spoke them */
  isQuestion?: boolean
}

function liters() {
  return Math.round(water.fill * water.capacity)
}

const COMMANDS: Command[] = [
  {
    id: 'ask-rain',
    label: 'Hoeveel regen valt er?',
    isQuestion: true,
    matches: t => has(t, 'hoeveel regen', 'hoe hard regent', 'regent het', 'valt er regen', 'hoeveel neerslag'),
    run: () => env.precipitation >= 0.05
      ? `Er valt nu ${env.precipitation.toFixed(1)} millimeter regen per uur. Het dak stuurt ${Math.round(env.inflow)} liter per uur naar de ton.`
      : 'Het regent op dit moment niet.',
  },
  {
    id: 'ask-level',
    label: 'Hoeveel water zit er in de ton?',
    isQuestion: true,
    matches: t => has(t, 'hoeveel water', 'hoe vol', 'hoeveel liter', 'waterstand', 'niveau'),
    run: () => {
      const overflow = water.overflowed >= 1 ? ` Er is al ${Math.round(water.overflowed)} liter overgelopen.` : ''
      return `De ton bevat ${liters()} van ${water.capacity} liter, dat is ${Math.round(water.fill * 100)} procent.${overflow}`
    },
  },
  {
    id: 'empty',
    label: 'Leeg de ton',
    matches: t => has(t, 'leeg', 'ledig', 'afvoer', 'aftappen') && has(t, 'ton', 'put', 'vat', 'regenput', 'regenton', 'tank'),
    run: () => {
      if (water.fill <= 0) { return 'De ton is al leeg.' }
      water.draining = true
      return `Het afvoerventiel staat open. ${liters()} liter loopt weg.`
    },
  },
  {
    id: 'tap-close',
    label: 'Sluit de kraan',
    matches: t => has(t, 'kraan', 'tuin') && has(t, 'dicht', 'sluit', 'sluiten', 'toe', 'uit', 'stop'),
    run: () => {
      water.gardenTap = false
      return 'De tuinkraan is dicht.'
    },
  },
  {
    id: 'tap-open',
    label: 'Open de kraan (tuin water geven)',
    matches: t => has(t, 'kraan', 'tuin') && has(t, 'open', 'water', 'giet', 'geef', 'aan'),
    run: () => {
      if (water.fill <= 0) { return 'De ton is leeg, er is geen water voor de tuin.' }
      water.gardenTap = true
      return 'De tuinkraan staat open en de tuin krijgt water.'
    },
  },
  {
    id: 'rain-off',
    label: 'Zet de regen uit',
    matches: t => has(t, 'regen') && has(t, 'uit', 'stop', 'stopt', 'weg', 'einde'),
    run: () => {
      if (live.enabled) { disableLive() }
      water.raining = false
      return 'De regen is gestopt. Je bent nu in handmatige modus.'
    },
  },
  {
    id: 'rain-on',
    label: 'Laat het regenen',
    matches: t => has(t, 'regen') && has(t, 'aan', 'start', 'laat', 'begin', 'zet', 'maak'),
    run: () => {
      if (live.enabled) { disableLive() }
      water.raining = true
      return 'Het regent. Je bent nu in handmatige modus.'
    },
  },
  {
    id: 'volume-set',
    label: 'Zet het tonvolume',
    // "zet de ton volume op 100", "tonvolume 450", "maak de ton 300 liter", "zet de ton op vijfhonderd"
    matches: t => has(t, 'volume', 'ton', 'put', 'vat', 'regenput') && !has(t, 'verbruik', 'gebruik', 'uur', 'leeg', 'regen aan', 'regen uit')
      && findNumber(t) !== null && has(t, 'volume', 'zet', 'maak', 'stel', 'liter'),
    run: (t) => {
      const wanted = findNumber(t)!
      const capacity = toSlider(wanted, 100, 600, 50)
      water.capacity = capacity
      const note = capacity === Math.round(wanted) ? '' : ` (de ton kan van 100 tot 600 liter, in stappen van 50; ${wanted} is dus ${capacity} geworden)`
      return `De ton is nu ${capacity} liter.${note}`
    },
  },
  {
    id: 'usage-none',
    label: 'Geen verbruik',
    matches: t => has(t, 'geen verbruik', 'geen gebruik', 'zonder verbruik', 'verbruik uit', 'verbruik stoppen'),
    run: () => {
      water.usage = 0
      return 'Het huishouden gebruikt nu geen water meer (0 liter per uur).'
    },
  },
  {
    id: 'usage-set',
    label: 'Zet het verbruik van het huishouden',
    // "zet het verbruik op 30", "huishoudverbruik 45 liter per uur"
    matches: t => has(t, 'verbruik', 'gebruik') && findNumber(t) !== null,
    run: (t) => {
      const wanted = findNumber(t)!
      const usage = toSlider(wanted, 0, 60, 5)
      water.usage = usage
      const note = usage === Math.round(wanted) ? '' : ` (het verbruik kan van 0 tot 60 liter per uur, in stappen van 5; ${wanted} is dus ${usage} geworden)`
      return `Het huishouden gebruikt nu ${usage} liter per uur.${note}`
    },
  },
  {
    id: 'usage-more',
    label: 'Meer verbruik',
    matches: t => has(t, 'verbruik', 'gebruik') && has(t, 'meer', 'hoger', 'verhoog', 'omhoog', 'verhogen'),
    run: () => {
      water.usage = clamp(water.usage + 10, 0, 60)
      return `Het huishouden gebruikt nu ${water.usage} liter per uur.`
    },
  },
  {
    id: 'usage-less',
    label: 'Minder verbruik',
    matches: t => has(t, 'verbruik', 'gebruik') && has(t, 'minder', 'lager', 'verlaag', 'omlaag', 'verlagen'),
    run: () => {
      water.usage = clamp(water.usage - 10, 0, 60)
      return `Het huishouden gebruikt nu ${water.usage} liter per uur.`
    },
  },
  {
    id: 'volume-up',
    label: 'Grotere ton',
    matches: t => has(t, 'groter', 'grotere', 'vergroot', 'vergroten') && has(t, 'ton', 'put', 'vat', 'regenput'),
    run: () => {
      water.capacity = Math.min(600, water.capacity + 100)
      return `De ton is nu ${water.capacity} liter.`
    },
  },
  {
    id: 'volume-down',
    label: 'Kleinere ton',
    matches: t => has(t, 'kleiner', 'kleinere', 'verklein', 'verkleinen') && has(t, 'ton', 'put', 'vat', 'regenput'),
    run: () => {
      water.capacity = Math.max(100, water.capacity - 100)
      return `De ton is nu ${water.capacity} liter.`
    },
  },
  {
    id: 'time',
    label: 'Zet de tijd',
    matches: t => has(t, 'uur') && has(t, 'tijd', 'zet', 'ga naar', 'spring') && !has(t, 'verbruik', 'gebruik', 'liter'),
    run: (t) => {
      const data = weatherData.value
      if (!live.enabled || !data) { return 'Zet eerst "Echte data" aan, want alleen daar loopt de tijd.' }
      const hour = findHour(t.replace(/(zet|ga naar|spring naar|de tijd op|tijd)/g, ' '))
      if (hour === null || hour > 24) { return 'Ik heb geen uur verstaan. Zeg bijvoorbeeld "zet de tijd op 15 uur".' }
      const offset = data.utcOffsetSeconds * 1000
      const dayStart = Math.floor((live.time + offset) / 86_400_000) * 86_400_000
      live.time = Math.min(live.end, Math.max(live.start, dayStart + hour * 3_600_000 - offset))
      return `De tijd staat nu op ${String(hour).padStart(2, '0')}:00 (${formatLocal(data, live.time)}).`
    },
  },
  {
    id: 'pause',
    label: 'Pauzeer de tijd',
    matches: t => has(t, 'pauze', 'pauzeer', 'wacht') && !has(t, 'regen'),
    run: () => {
      live.playing = false
      return 'De tijd staat stil.'
    },
  },
  {
    id: 'play',
    label: 'Laat de tijd lopen',
    matches: t => has(t, 'speel af', 'verder', 'hervat', 'laat de tijd lopen'),
    run: () => {
      live.playing = true
      return 'De tijd loopt weer.'
    },
  },
]

/** Phrases for the buttons: they go through the same parser as speech, so they test it too. */
export const BUTTONS: { label: string, phrase: string }[] = [
  { label: 'Regen aan', phrase: 'zet de regen aan' },
  { label: 'Regen uit', phrase: 'zet de regen uit' },
  { label: 'Hoeveel water?', phrase: 'hoeveel water zit er in de ton' },
  { label: 'Leeg de ton', phrase: 'leeg de ton' },
  { label: 'Kraan open', phrase: 'open de kraan' },
  { label: 'Kraan dicht', phrase: 'sluit de kraan' },
  { label: 'Grotere ton', phrase: 'grotere ton' },
  { label: 'Kleinere ton', phrase: 'kleinere ton' },
]

function speak(text: string) {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) { return }
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = 'nl-BE'
  window.speechSynthesis.cancel()
  window.speechSynthesis.speak(utterance)
}

function addLog(entry: LogEntry) {
  speech.log.unshift(entry)
  if (speech.log.length > 5) { speech.log.length = 5 }
}

/** Understand a sentence, do what it asks and write down what happened. */
export function runCommand(heard: string, source: LogEntry['source']) {
  const text = normalize(heard)
  const command = COMMANDS.find(c => c.matches(text))
  if (!command) {
    addLog({
      heard,
      action: 'Niet begrepen',
      result: 'Dat commando ken ik niet. Probeer: "zet de regen aan", "hoeveel water zit er in de ton", "leeg de ton" of "zet de tijd op 15 uur".',
      ok: false,
      source,
    })
    return
  }
  const result = command.run(text)
  addLog({ heard, action: command.label, result, ok: true, source })
  if (source === 'spraak' && command.isQuestion) { speak(result) }
}

const ERROR_TEXT: Record<string, string> = {
  'not-allowed': 'De microfoon is geblokkeerd. Geef toestemming in je browser, of gebruik de knoppen.',
  'service-not-allowed': 'Deze browser staat spraakherkenning niet toe. Gebruik de knoppen.',
  'no-speech': 'Ik heb niets gehoord. Probeer het opnieuw.',
  'audio-capture': 'Er is geen microfoon gevonden.',
  'network': 'De spraakdienst is niet bereikbaar. Gebruik de knoppen of typ het commando.',
}

let recognition: any = null

export function startListening() {
  if (!SpeechRecognitionClass) {
    speech.error = 'Spraakherkenning wordt door deze browser niet ondersteund. Gebruik Chrome of Edge, of de knoppen.'
    return
  }
  speech.error = ''
  speech.interim = ''
  recognition = new SpeechRecognitionClass()
  recognition.lang = 'nl-BE'
  recognition.interimResults = true
  recognition.continuous = false
  recognition.maxAlternatives = 1
  recognition.onstart = () => { speech.listening = true }
  recognition.onresult = (event: any) => {
    let text = ''
    let final = false
    for (let i = event.resultIndex; i < event.results.length; i++) {
      text += event.results[i][0].transcript
      if (event.results[i].isFinal) { final = true }
    }
    speech.interim = text
    if (final) {
      speech.interim = ''
      runCommand(text.trim(), 'spraak')
    }
  }
  recognition.onerror = (event: any) => {
    speech.error = ERROR_TEXT[event.error] ?? `Spraakherkenning mislukt (${event.error}). Gebruik de knoppen.`
  }
  recognition.onend = () => {
    speech.listening = false
    speech.interim = ''
  }
  try { recognition.start() }
  catch { speech.error = 'Spraakherkenning kon niet starten. Probeer het nog eens.' }
}

export function stopListening() {
  recognition?.stop()
}
