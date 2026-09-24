import { DeniedOperationError, MissingNameError } from '../src/values'
import { VarCraft } from '../src/varcraft'

describe('interpreter language semantics', () => {
  it('evaluates computed receiver before key exactly once', () => {
    const engine = new VarCraft()
    const events: string[] = []
    engine.setPredefinedVar('receiver', () => {
      events.push('receiver')
      return { value: 'ok' }
    })
    engine.setPredefinedVar('index', () => {
      events.push('index')
      return 'value'
    })

    expect(engine.evaluate('receiver()[index()]')).toBe('ok')
    expect(events).toEqual(['receiver', 'index'])
  })

  it('does not evaluate computed key when receiver throws', () => {
    const engine = new VarCraft()
    const events: string[] = []
    engine.setPredefinedVar('receiver', () => {
      events.push('receiver')
      throw new Error('receiver failed')
    })
    engine.setPredefinedVar('index', () => {
      events.push('index')
      return 'value'
    })

    expect(() => engine.evaluate('receiver()[index()]')).toThrow(
      'receiver failed',
    )
    expect(events).toEqual(['receiver'])
  })

  it('applies truthiness directly for unary not on arrays and objects', () => {
    const engine = new VarCraft()
    engine.set('emptyObject', {})

    expect(engine.evaluate('![]')).toBe(false)
    expect(engine.evaluate('!emptyObject')).toBe(false)
  })

  it('keeps primitive coercion denied for arithmetic and computed keys', () => {
    const engine = new VarCraft()
    engine.set('emptyObject', {})
    engine.set('values', { value: 1 })

    expect(() => engine.evaluate('+emptyObject')).toThrow(DeniedOperationError)
    expect(() => engine.evaluate('values[emptyObject]')).toThrow(
      DeniedOperationError,
    )
  })

  it('denies dangerous member keys and missing names', () => {
    const engine = new VarCraft()
    engine.set('value', { constructor: 'blocked' })

    expect(() => engine.evaluate('value.constructor')).toThrow(
      DeniedOperationError,
    )
    expect(() => engine.evaluate('missing')).toThrow(MissingNameError)
  })

  it('allows finite numbers and rejects non-finite numeric literals', () => {
    const engine = new VarCraft()

    expect(engine.evaluate('0.25')).toBe(0.25)
    expect(() => engine.evaluate('9'.repeat(400))).toThrow()
  })

  it('rejects reserved identifiers while retaining literal semantics', () => {
    const engine = new VarCraft()

    expect(engine.evaluate('true')).toBe(true)
    expect(engine.evaluate('false')).toBe(false)
    expect(engine.evaluate('null')).toBeNull()
    expect(engine.evaluate('undefined')).toBeUndefined()
    expect(() => engine.evaluate('this')).toThrow()
    expect(() => engine.evaluate('null = 1')).toThrow()
  })
})
