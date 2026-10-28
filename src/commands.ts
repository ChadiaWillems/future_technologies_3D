import { reactive } from 'vue'
import { disableLive, enableLive, weatherData } from './liveController'
import { formatLocal, searchPlaces } from './liveData'
import { normalize, parseWake } from './wakeWord'
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

/** The browser's speech recogniser (Chrome and Edge have one). Looked up when needed, not all browsers have it. */
function recognitionClass(): any {
  if (typeof window === 'undefined') { return undefined }
  return (window as any).SpeechRecognition ?? (window as any).webkitSpeechRecognition
}

export const speech = reactive({
  supported: Boolean(recognitionClass()),
  /** The microphone is on */
  listening: false,
  /** "Hey Regenton" mode: listening all the time for the wake phrase */
  wake: false,
  /** The wake phrase was heard: the next sentence is a command */
  armed: false,
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

const PLACE_STOP_WORDS = new Set([
  'zet',
  'de',
  'het',
  'een',
  'plaats',
  'locatie',
  'op',
  'naar',
  'ga',
  'verander',
  'wijzig',
  'kies',
  'toon',
  'laat',
  'zien',
  'weer',
  'regen',
  'in',
  'van',
  'te',
  'kijk',
  'mijn',
  'stad',
  'dorp',
  'aub',
  'alsjeblieft',
])
/** What is left of a sentence like "ga naar new york" when the command words are removed: the place name */
function placeName(text: string) {
  return text.split(' ').filter(word => word && !PLACE_STOP_WORDS.has(word)).join(' ')
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
  run: (text: string) => string | Promise<string>
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
    id: 'place',
    label: 'Ga naar een plaats',
    // "ga naar Parijs", "zet de plaats op New York", "toon het weer in Tokio"
    matches: t => has(t, 'plaats', 'locatie', 'weer in', 'regen in', 'ga naar', 'toon', 'kijk in')
      && !has(t, 'uur', 'ton', 'kraan', 'tuin', 'verbruik', 'gebruik', 'volume', 'liter', 'regen aan', 'regen uit')
      && placeName(t).length >= 2,
    run: async (t) => {
      const name = placeName(t)
      try {
        const found = await searchPlaces(name)
        if (!found.length) { return `Ik vond geen plaats met de naam "${name}".` }
        await enableLive(found[0])
        return live.status === 'ready'
          ? `Ik toon nu de regen in ${found[0].name}${found[0].detail ? ` (${found[0].detail})` : ''}.`
          : live.message
      }
      catch (error) {
        return `Zoeken mislukt (${error instanceof Error ? error.message : 'onbekende fout'}). Probeer het later opnieuw.`
      }
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
  if (typeof result === 'string') {
    addLog({ heard, action: command.label, result, ok: true, source })
    if (source === 'spraak' && command.isQuestion) { speak(result) }
    return
  }
  // an answer that needs a moment (looking up a place): show that first, fill in the result when it arrives
  addLog({ heard, action: command.label, result: 'Bezig…', ok: true, source })
  const entry = speech.log[0]
  result.then((text) => { entry.result = text })
    .catch((error) => {
      entry.result = `Dat is niet gelukt (${error instanceof Error ? error.message : 'onbekende fout'}).`
      entry.ok = false
    })
}

const ERROR_TEXT: Record<string, string> = {
  'not-allowed': 'De microfoon is geblokkeerd. Geef toestemming in je browser.',
  'service-not-allowed': 'Deze browser staat spraakherkenning niet toe.',
  'no-speech': 'Ik heb niets gehoord. Probeer het opnieuw.',
  'audio-capture': 'Er is geen microfoon gevonden.',
  'network': 'De spraakdienst is niet bereikbaar.',
}

const ARMED_SECONDS = 8
let recognition: any = null
let armedTimer: ReturnType<typeof setTimeout> | undefined
let restartTimer: ReturnType<typeof setTimeout> | undefined
let failures = 0

function createRecognition(continuous: boolean) {
  const Recognition = recognitionClass()
  const instance = new Recognition()
  instance.lang = 'nl-BE'
  instance.interimResults = true
  instance.continuous = continuous
  instance.maxAlternatives = 1
  return instance
}

/** A short beep so you hear that the wake phrase was understood */
function beep() {
  try {
    const context = new AudioContext()
    const oscillator = context.createOscillator()
    const gain = context.createGain()
    oscillator.frequency.value = 880
    gain.gain.value = 0.05
    oscillator.connect(gain)
    gain.connect(context.destination)
    oscillator.start()
    oscillator.stop(context.currentTime + 0.12)
    oscillator.onended = () => { context.close() }
  }
  catch { /* no sound available; the screen shows it as well */ }
}

function arm() {
  speech.armed = true
  beep()
  clearTimeout(armedTimer)
  armedTimer = setTimeout(() => { speech.armed = false }, ARMED_SECONDS * 1000)
}

function disarm() {
  speech.armed = false
  clearTimeout(armedTimer)
}

/**
 * A finished sentence while "Hey Regenton" mode is on: only the wake phrase (and what follows it, or the next
 * sentence) is used. Everything else is ignored and is not stored or shown.
 */
export function handleWakeSentence(sentence: string) {
  const { heard, command } = parseWake(sentence)
  if (heard) {
    if (command) {
      disarm()
      runCommand(command, 'spraak')
    }
    else { arm() }
    return
  }
  if (speech.armed) {
    disarm()
    runCommand(sentence.trim(), 'spraak')
  }
}

/** One command: press the microphone icon and say it. In "Hey Regenton" mode the icon works like the wake phrase. */
export function startListening() {
  if (speech.wake) {
    arm()
    return
  }
  if (!recognitionClass()) {
    speech.error = 'Spraakherkenning wordt door deze browser niet ondersteund. Gebruik Chrome of Edge.'
    return
  }
  speech.error = ''
  speech.interim = ''
  recognition = createRecognition(false)
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
    speech.error = ERROR_TEXT[event.error] ?? `Spraakherkenning mislukt (${event.error}).`
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

function listenForWake() {
  if (!speech.wake) { return }
  recognition = createRecognition(true)
  recognition.onstart = () => { speech.listening = true }
  recognition.onresult = (event: any) => {
    failures = 0
    for (let i = event.resultIndex; i < event.results.length; i++) {
      const result = event.results[i]
      if (result.isFinal) {
        speech.interim = ''
        handleWakeSentence(result[0].transcript)
      }
      else if (speech.armed) { speech.interim = result[0].transcript }
    }
  }
  recognition.onerror = (event: any) => {
    // a quiet moment ends a session now and then; that is normal and it is simply started again
    if (event.error === 'no-speech' || event.error === 'aborted') { return }
    if (event.error === 'network' && ++failures < 3) { return }
    speech.error = ERROR_TEXT[event.error] ?? `Spraakherkenning mislukt (${event.error}).`
    stopWake()
  }
  recognition.onend = () => {
    speech.listening = false
    speech.interim = ''
    // browsers end a continuous session after a while: start again as long as the mode is on
    if (speech.wake) { restartTimer = setTimeout(listenForWake, 400) }
  }
  try { recognition.start() }
  catch {
    speech.error = 'Spraakherkenning kon niet starten. Probeer het nog eens.'
    stopWake()
  }
}

/** Turn "Hey Regenton" mode on: the microphone stays on until you turn it off. */
export function startWake() {
  if (!recognitionClass()) {
    speech.error = 'Spraakherkenning wordt door deze browser niet ondersteund. Gebruik Chrome of Edge.'
    return
  }
  speech.error = ''
  speech.wake = true
  failures = 0
  listenForWake()
}

export function stopWake() {
  speech.wake = false
  disarm()
  clearTimeout(restartTimer)
  try { recognition?.stop() }
  catch { /* it was not running */ }
  speech.listening = false
  speech.interim = ''
}
