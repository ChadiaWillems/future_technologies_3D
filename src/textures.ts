import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three'

// Small procedural textures drawn on a canvas, so the scene needs no image files.
// Every texture is drawn so that it tiles without visible seams.

type Ctx = CanvasRenderingContext2D
type Rand = () => number

function seeded(seed: number): Rand {
  let a = seed
  return () => {
    a = (a + 0x6D2B79F5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function make(size: number, repeat: [number, number], seed: number, draw: (c: Ctx, s: number, r: Rand) => void) {
  const canvas = document.createElement('canvas')
  canvas.width = size
  canvas.height = size
  const c = canvas.getContext('2d')!
  draw(c, size, seeded(seed))
  const texture = new CanvasTexture(canvas)
  texture.wrapS = RepeatWrapping
  texture.wrapT = RepeatWrapping
  texture.repeat.set(repeat[0], repeat[1])
  texture.colorSpace = SRGBColorSpace
  texture.anisotropy = 8
  return texture
}

// Run a drawing step at the 9 wrapped positions so shapes crossing the edge continue on the other side
function tiled(s: number, x: number, y: number, fn: (x: number, y: number) => void) {
  for (const dx of [-s, 0, s]) {
    for (const dy of [-s, 0, s]) { fn(x + dx, y + dy) }
  }
}

const jitter = (r: Rand, base: number, amount: number) => Math.max(0, Math.min(255, Math.round(base + (r() - 0.5) * amount)))
const rgb = (r: number, g: number, b: number, a = 1) => `rgba(${r},${g},${b},${a})`

export function createTextures() {
  const grass = make(512, [150, 150], 1, (c, s, r) => {
    c.fillStyle = '#4f8a3a'
    c.fillRect(0, 0, s, s)
    for (let i = 0; i < 40; i++) {
      const x = r() * s
      const y = r() * s
      const radius = 25 + r() * 60
      c.fillStyle = r() < 0.5 ? 'rgba(35,85,30,0.22)' : 'rgba(135,180,75,0.18)'
      tiled(s, x, y, (px, py) => { c.beginPath(); c.arc(px, py, radius, 0, Math.PI * 2); c.fill() })
    }
    const palette = ['#3b7a2d', '#5fa045', '#4a8c36', '#78b552', '#33692a', '#8fc462']
    for (let i = 0; i < 12000; i++) {
      const x = r() * s
      const y = r() * s
      const length = 3 + r() * 7
      const lean = (r() - 0.5) * 4
      c.strokeStyle = palette[Math.floor(r() * palette.length)]
      c.lineWidth = 1
      tiled(s, x, y, (px, py) => { c.beginPath(); c.moveTo(px, py); c.lineTo(px + lean, py - length); c.stroke() })
    }
  })

  const plaster = make(256, [2, 1], 2, (c, s, r) => {
    c.fillStyle = '#e6dac2'
    c.fillRect(0, 0, s, s)
    for (let i = 0; i < 7000; i++) {
      const v = r() < 0.5 ? 255 : 120
      c.fillStyle = rgb(v, v - 10, v - 30, 0.06 + r() * 0.07)
      c.fillRect(r() * s, r() * s, 1 + r() * 2, 1 + r() * 2)
    }
    for (let i = 0; i < 30; i++) {
      const y = r() * s
      c.fillStyle = rgb(120, 100, 80, 0.04)
      c.fillRect(0, y, s, 1 + r() * 3)
    }
  })

  const roof = make(512, [8, 2], 3, (c, s, r) => {
    const cols = 8
    const rows = 12
    const w = s / cols
    const h = s / rows
    c.fillStyle = '#3a1a14'
    c.fillRect(0, 0, s, s)
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const offset = row % 2 ? w / 2 : 0
        const x = col * w + offset
        const y = row * h
        const base = [150, 62, 44]
        const shade = (r() - 0.5) * 40
        const gradient = c.createLinearGradient(0, y, 0, y + h)
        gradient.addColorStop(0, rgb(base[0] + shade + 15, base[1] + shade * 0.5 + 8, base[2] + shade * 0.4 + 5))
        gradient.addColorStop(1, rgb(base[0] + shade - 40, base[1] + shade * 0.5 - 22, base[2] + shade * 0.4 - 16))
        c.fillStyle = gradient
        tiled(s, x + 1, y + 1, (px, py) => { c.fillRect(px, py, w - 2, h - 1) })
      }
    }
    for (let i = 0; i < 2500; i++) {
      c.fillStyle = rgb(0, 0, 0, 0.05 + r() * 0.06)
      c.fillRect(r() * s, r() * s, 1 + r() * 2, 1)
    }
  })

  const wood = make(256, [1, 1], 4, (c, s, r) => {
    const planks = 4
    const h = s / planks
    for (let p = 0; p < planks; p++) {
      c.fillStyle = rgb(jitter(r, 176, 24), jitter(r, 138, 20), jitter(r, 94, 16))
      c.fillRect(0, p * h, s, h)
      for (let i = 0; i < 26; i++) {
        c.strokeStyle = rgb(70, 45, 20, 0.08 + r() * 0.12)
        c.lineWidth = 1
        const y = p * h + r() * h
        c.beginPath()
        c.moveTo(0, y)
        c.bezierCurveTo(s * 0.3, y + (r() - 0.5) * 5, s * 0.6, y + (r() - 0.5) * 5, s, y)
        c.stroke()
      }
      c.fillStyle = 'rgba(30,18,8,0.55)'
      c.fillRect(0, p * h, s, 2)
    }
  })

  const barrel = make(256, [1, 1], 5, (c, s, r) => {
    const staves = 16
    const w = s / staves
    for (let i = 0; i < staves; i++) {
      c.fillStyle = rgb(jitter(r, 128, 26), jitter(r, 82, 20), jitter(r, 44, 14))
      c.fillRect(i * w, 0, w, s)
      for (let k = 0; k < 10; k++) {
        c.strokeStyle = rgb(50, 28, 12, 0.1 + r() * 0.15)
        const x = i * w + r() * w
        c.beginPath()
        c.moveTo(x, 0)
        c.lineTo(x + (r() - 0.5) * 3, s)
        c.stroke()
      }
      c.fillStyle = 'rgba(25,14,6,0.7)'
      c.fillRect(i * w, 0, 1.5, s)
    }
  })

  const stone = make(256, [1, 3], 6, (c, s, r) => {
    c.fillStyle = '#6f6a60'
    c.fillRect(0, 0, s, s)
    const cols = 2
    const rows = 3
    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        const v = jitter(r, 178, 22)
        c.fillStyle = rgb(v, v - 5, v - 14)
        c.fillRect(col * (s / cols) + 4, row * (s / rows) + 4, s / cols - 8, s / rows - 8)
        for (let i = 0; i < 300; i++) {
          c.fillStyle = rgb(60, 55, 45, 0.08)
          c.fillRect(col * (s / cols) + 4 + r() * (s / cols - 8), row * (s / rows) + 4 + r() * (s / rows - 8), 2, 2)
        }
      }
    }
  })

  const bark = make(256, [1, 2], 7, (c, s, r) => {
    c.fillStyle = '#5d4331'
    c.fillRect(0, 0, s, s)
    for (let i = 0; i < 160; i++) {
      const x = r() * s
      const v = r() < 0.5 ? 25 : 120
      c.strokeStyle = rgb(v, v * 0.7, v * 0.5, 0.35)
      c.lineWidth = 1 + r() * 2
      tiled(s, x, 0, (px) => { c.beginPath(); c.moveTo(px, 0); c.bezierCurveTo(px + 6, s * 0.3, px - 6, s * 0.6, px + 2, s); c.stroke() })
    }
  })

  const leaves = make(256, [3, 2], 8, (c, s, r) => {
    c.fillStyle = '#3d8a3b'
    c.fillRect(0, 0, s, s)
    for (let i = 0; i < 1400; i++) {
      const x = r() * s
      const y = r() * s
      const light = r() < 0.5
      c.fillStyle = light ? rgb(110, 175, 70, 0.55) : rgb(25, 80, 30, 0.55)
      const radius = 2 + r() * 5
      tiled(s, x, y, (px, py) => { c.beginPath(); c.ellipse(px, py, radius, radius * 0.6, r() * 3, 0, Math.PI * 2); c.fill() })
    }
  })

  const soil = make(256, [3, 3], 9, (c, s, r) => {
    c.fillStyle = '#4a3626'
    c.fillRect(0, 0, s, s)
    for (let i = 0; i < 5000; i++) {
      const v = r() < 0.5 ? 15 : 110
      c.fillStyle = rgb(v + 25, v + 12, v, 0.18 + r() * 0.2)
      c.fillRect(r() * s, r() * s, 1 + r() * 3, 1 + r() * 3)
    }
  })

  const brick = make(256, [1, 2], 10, (c, s, r) => {
    const cols = 4
    const rows = 12
    const w = s / cols
    const h = s / rows
    c.fillStyle = '#cfc6b8'
    c.fillRect(0, 0, s, s)
    for (let row = 0; row < rows; row++) {
      for (let col = -1; col <= cols; col++) {
        const x = col * w + (row % 2 ? w / 2 : 0)
        c.fillStyle = rgb(jitter(r, 158, 40), jitter(r, 78, 24), jitter(r, 58, 20))
        c.fillRect(x + 1.5, row * h + 1.5, w - 3, h - 3)
      }
    }
  })

  return { grass, plaster, roof, wood, barrel, stone, bark, leaves, soil, brick }
}

// Sky dome gradients (zenith at the top, horizon in the middle). A plain textured sphere works the same
// in the WebGL and WebGPU renderers, unlike a GLSL sky shader. The horizon colour matches the fog.
function skyGradient(zenith: string, high: string, horizon: string) {
  const canvas = document.createElement('canvas')
  canvas.width = 4
  canvas.height = 256
  const c = canvas.getContext('2d')!
  const gradient = c.createLinearGradient(0, 0, 0, 256)
  gradient.addColorStop(0, zenith)
  gradient.addColorStop(0.3, high)
  gradient.addColorStop(0.5, horizon)
  gradient.addColorStop(1, horizon)
  c.fillStyle = gradient
  c.fillRect(0, 0, 4, 256)
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  return texture
}

export function createSkyTextures() {
  return {
    clear: skyGradient('#2f74c8', '#86b9ea', '#cfe0ea'),
    overcast: skyGradient('#59636e', '#7d8791', '#8d98a3'),
  }
}
