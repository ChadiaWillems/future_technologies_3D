// The rainwater model: how much water ends up in the barrel.
//
//   level(t + dt) = level(t) + rain × roof area × runoff − use,   limited to 0 … capacity
//
// What does not fit in the barrel (level above capacity) overflows. 1 mm of rain on 1 m² is 1 litre.

export const HOUSE_SCALE = 1.25
/** Roof seen from above: a square with a side of 2 × 2.12 m, scaled with the house */
export const ROOF_AREA_M2 = (2 * (3 / Math.SQRT2) * HOUSE_SCALE) ** 2
/** Share of the rain on the roof that reaches the barrel (the rest splashes off or evaporates) */
export const RUNOFF = 0.8

export interface BarrelStepInput {
  liters: number
  capacity: number
  /** mm per hour */
  rain: number
  /** Simulated time that passes in this step, in hours */
  hours: number
  /** Steady use by the household, litres per hour */
  useLitersPerHour: number
}

export interface BarrelStepResult {
  liters: number
  /** Litres that ran into the barrel from the roof in this step */
  inflow: number
  /** Litres the household used in this step */
  used: number
  /** Litres that did not fit and spilled over the rim */
  overflow: number
}

export function stepBarrel({ liters, capacity, rain, hours, useLitersPerHour }: BarrelStepInput): BarrelStepResult {
  const inflow = rain * hours * ROOF_AREA_M2 * RUNOFF
  const available = liters + inflow
  const used = Math.min(available, useLitersPerHour * hours)
  const total = available - used
  const overflow = Math.max(0, total - capacity)
  return { liters: Math.min(total, capacity), inflow, used, overflow }
}
