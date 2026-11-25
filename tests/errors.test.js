import { describe, it, expect } from 'vitest'
import errors from '../services/errors.cjs'

describe('jerarquia de errores', () => {
  it('cada clase tiene codigo y hereda de AppError', () => {
    const cases = [
      [errors.InputValidationError, 'INPUT_VALIDATION_ERROR'],
      [errors.ApiError, 'API_ERROR'],
      [errors.FileSystemError, 'FILE_SYSTEM_ERROR'],
      [errors.OptimizationError, 'OPTIMIZATION_ERROR'],
    ]
    for (const [Cls, code] of cases) {
      const e = new Cls('fallo')
      expect(e).toBeInstanceOf(errors.AppError)
      expect(e).toBeInstanceOf(Error)
      expect(e.code).toBe(code)
      expect(e.userMessage).toContain('fallo')
    }
  })
  it('permite sobrescribir opciones', () => {
    const e = new errors.ApiError('x', { code: 'CUSTOM', details: { s: 500 } })
    expect(e.code).toBe('CUSTOM')
    expect(e.details).toEqual({ s: 500 })
  })
})
