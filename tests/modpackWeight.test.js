import { describe, it, expect } from 'vitest'
import { calculateModpackWeight } from '../services/modpackWeight.cjs'

describe('calculateModpackWeight', () => {
  it('pack pequeno y optimizado es ligero', () => {
    // base 5, -1 optimizado, -1 pocos mods, -1 poco tamano
    expect(calculateModpackWeight(20, 100, 3, 0).score).toBe(2)
  })
  it('pack mediano sin optimizacion', () => {
    // base 5, +1 sin optimizacion
    expect(calculateModpackWeight(50, 400, 0, 0).score).toBe(6)
  })
  it('pack enorme se limita a 10', () => {
    expect(calculateModpackWeight(300, 5000, 0, 10).score).toBe(10)
  })
  it('nunca baja de 1', () => {
    expect(calculateModpackWeight(1, 1, 5, 0).score).toBeGreaterThanOrEqual(1)
  })
  it('devuelve los datos de entrada', () => {
    expect(calculateModpackWeight(100, 800, 1, 3)).toEqual({
      score: 8, totalMods: 100, totalSizeMB: 800, optimizationCount: 1, heavyCount: 3,
    })
  })
})
