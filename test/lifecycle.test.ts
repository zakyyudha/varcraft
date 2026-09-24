import { default as singleton } from '../src'
import { DeniedOperationError, MissingNameError } from '../src/values'
import { VarCraft } from '../src/varcraft'

// Task 8: one built-in bootstrap shared by the package default singleton and
// opt-in isolated engines, plus explicit lifecycle reset. Legacy clear() stays
// variables-only.

const BUILTINS = [
  '_sum',
  '_map',
  '_filter',
  '_reduce',
  '_chunk',
  '_includes',
  '_if',
  '_switch',
] as const

function storedRecord(engine: VarCraft): object {
  // White-box read: requirement 7 pins the storage SHAPE (null-prototype), not
  // just observable reads, because a plain {} regression is invisible through
  // own-property lookups.
  return (engine as unknown as { variables: object }).variables
}

describe('engine lifecycle and built-in bootstrap', () => {
  it('installs the eight built-ins on the default singleton', () => {
    for (const name of BUILTINS) {
      expect(typeof singleton.get(name)).toBe('function')
    }
    expect(singleton.parseExpression('_sum([1, 2, 3])')).toBe(6)
  })

  it('leaves a fresh isolated engine without built-ins by default', () => {
    const engine = new VarCraft()
    expect(() => engine.get('_sum')).toThrow(MissingNameError)
    expect(() => engine.evaluate('_sum([1, 2, 3])')).toThrow(
      DeniedOperationError,
    )
  })

  it('installs built-ins on an opted-in isolated engine', () => {
    const engine = new VarCraft({ builtins: true })
    for (const name of BUILTINS) {
      expect(typeof engine.get(name)).toBe('function')
    }
    expect(engine.evaluate('_sum([1, 2, 3])')).toBe(6)
    expect(engine.evaluate('_map([1, 2, 3], "_item_ + 1")')).toEqual([2, 3, 4])
  })

  it('keeps legacy clear() variables-only', () => {
    const engine = new VarCraft({ builtins: true })
    engine.set('x', 1)
    engine.setPredefinedVar('keep', () => 7)
    engine.setMemberMethod('upper', (target) => String(target).toUpperCase())

    engine.clear()

    expect(() => engine.get('x')).toThrow(MissingNameError)
    expect(engine.evaluate('keep()')).toBe(7)
    expect(engine.evaluate('"ari".upper()')).toBe('ARI')
    expect(engine.evaluate('_sum([1, 2, 3])')).toBe(6)
  })

  it('reset() restores the configured baseline deterministically', () => {
    const engine = new VarCraft({ builtins: true })
    engine.set('x', 1)
    engine.setPredefinedVar('custom', () => 7)
    engine.setMemberMethod('custom', () => 'custom')

    engine.setPredefinedVar('_sum', () => 'shadowed')
    expect(engine.evaluate('_sum([1, 2, 3])')).toBe('shadowed')

    engine.reset()

    expect(() => engine.get('x')).toThrow(MissingNameError)
    expect(() => engine.get('custom')).toThrow(MissingNameError)
    expect(() => engine.evaluate('"ari".custom()')).toThrow(
      DeniedOperationError,
    )
    // Built-ins are reinstalled at their baseline, not the shadowed override.
    expect(engine.evaluate('_sum([1, 2, 3])')).toBe(6)
    expect(engine.evaluate('"ari".toString()')).toBe('ari')
  })

  it('reset() on a non-builtin engine does not invent built-ins', () => {
    const engine = new VarCraft()
    engine.setPredefinedVar('custom', () => 7)

    engine.reset()

    expect(() => engine.get('custom')).toThrow(MissingNameError)
    expect(() => engine.get('_sum')).toThrow(MissingNameError)
  })

  it('never shares mutations between engines', () => {
    const a = new VarCraft({ builtins: true })
    const b = new VarCraft({ builtins: true })

    a.set('x', 1)
    expect(() => b.get('x')).toThrow(MissingNameError)

    a.setPredefinedVar('onlyA', () => 1)
    expect(() => b.get('onlyA')).toThrow(MissingNameError)

    a.setMemberMethod('onlyA', () => 1)
    expect(() => b.evaluate('"seed".onlyA()')).toThrow(DeniedOperationError)
    expect(a.evaluate('"seed".onlyA()')).toBe(1)
  })

  it('keeps null-prototype variable storage after clear and reset', () => {
    const engine = new VarCraft({ builtins: true })
    expect(Object.getPrototypeOf(storedRecord(engine))).toBe(null)

    engine.clear()
    expect(Object.getPrototypeOf(storedRecord(engine))).toBe(null)

    engine.reset()
    expect(Object.getPrototypeOf(storedRecord(engine))).toBe(null)
  })

  it('rejects literal and reserved API names across every registration API', () => {
    const engine = new VarCraft()
    const rejected = [
      'true',
      'false',
      'null',
      'undefined',
      'this',
      'function',
      'set',
      'get',
      'clear',
      '__proto__',
      'constructor',
    ] as const

    for (const name of rejected) {
      expect(() => engine.set(name, 1)).toThrow(DeniedOperationError)
      expect(() => engine.setPredefinedVar(name, () => 1)).toThrow(
        DeniedOperationError,
      )
      expect(() => engine.setMemberMethod(name, () => 1)).toThrow(
        DeniedOperationError,
      )
    }
  })

  it('still accepts ordinary registration names', () => {
    const engine = new VarCraft()
    engine.set('answer', 42)
    engine.setPredefinedVar('_double', (value: unknown) => Number(value) * 2)
    engine.setMemberMethod('upper', (target) => String(target).toUpperCase())

    expect(engine.evaluate('_double(answer)')).toBe(84)
    expect(engine.evaluate('"ari".upper()')).toBe('ARI')
  })

  it('keeps literals readable even though they are unreservable names', () => {
    const engine = new VarCraft()
    expect(engine.evaluate('true')).toBe(true)
    expect(engine.evaluate('undefined')).toBeUndefined()
  })
})
