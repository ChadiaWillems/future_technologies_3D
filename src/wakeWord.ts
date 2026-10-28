// The wake phrase "Hey Regenton": when "Hey Regenton" mode is on, nothing is done with what you say
// until a sentence starts with it. Speech recognition does not always spell it the same way, so a few
// variants are accepted ("hey regen ton", "hoi regenton", ...).

/** Lower case, no accents or punctuation, so "Één uur!" and "een uur" look the same */
export function normalize(text: string) {
  return text.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

export const WAKE_PHRASE = 'Hey Regenton'

const WAKE = /\b(?:hey|hei|hee|he|hoi|hallo|hello|ok|oke)\s+regen\s?too?[nm]\b/

export interface WakeResult {
  /** The sentence contained the wake phrase */
  heard: boolean
  /** What came after it ("hey regenton leeg de ton" gives "leeg de ton"), empty if nothing */
  command: string
}

export function parseWake(sentence: string): WakeResult {
  const text = normalize(sentence)
  const match = WAKE.exec(text)
  if (!match) { return { heard: false, command: '' } }
  return { heard: true, command: text.slice(match.index + match[0].length).trim() }
}
