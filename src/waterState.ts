import { reactive } from 'vue'

export const BARREL_LITERS = 300

// Shared by the 3D scene (Landscape.vue) and the on-screen meter (App.vue)
export const water = reactive({
  raining: false,
  fill: 0, // barrel level, 0..1
  used: 0, // liters taken out of the barrel so far
  garden: 0.35, // garden health, 0..1
  cutaway: false, // see-through house
  gardenTap: false,
  sinkTap: false,
  flushT: 0, // seconds left of the toilet flush (pump runs meanwhile)
})
