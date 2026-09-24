import { LIMITS } from '../src/limits'
import type { Value } from '../src/values'
import { DeniedOperationError } from '../src/values'
import { VarCraft } from '../src/varcraft'

const convert = (value: unknown): Value => value as Value

describe('default toString boundary', () => {
  it('rejects an object with a custom toString without invoking the hook', () => {
    const engine = new VarCraft()
    let calls = 0
    engine.setPredefinedVar('obj', {
      toString: () => {
        calls += 1
        return 'HOST-CODE'
      },
    })
    expect(() => engine.evaluate('obj.toString()')).toThrow(
      DeniedOperationError,
    )
    expect(calls).toBe(0)
  })

  it('rejects an object with Symbol.toPrimitive without invoking the hook', () => {
    const engine = new VarCraft()
    let calls = 0
    engine.setPredefinedVar('obj', {
      [Symbol.toPrimitive]: () => {
        calls += 1
        return 'HOST-CODE'
      },
    })
    expect(() => engine.evaluate('obj.toString()')).toThrow(
      DeniedOperationError,
    )
    expect(calls).toBe(0)
  })

  it('does not invoke an array own overridden join', () => {
    const engine = new VarCraft()
    let calls = 0
    const hostile: string[] & { join?: () => string } = ['a', 'b']
    hostile.join = () => {
      calls += 1
      return 'HOST-JOIN'
    }
    engine.setPredefinedVar('arr', hostile)
    expect(engine.evaluate('arr.toString()')).toBe('a,b')
    expect(calls).toBe(0)
  })

  it('serializes primitives and nullish array slots internally', () => {
    const engine = new VarCraft()
    engine.setPredefinedVar('parts', ['Ari', null, undefined, 'Bima'])
    expect(engine.evaluate('parts.toString()')).toBe('Ari,,,Bima')
  })

  it('keeps the buying compat string exact with a trailing empty segment', () => {
    const engine = new VarCraft()
    engine.setPredefinedVar('names', ['Ari', 'Bima', undefined])
    expect(engine.evaluate('names.toString()')).toBe('Ari,Bima,')
  })

  it('serializes primitive targets', () => {
    const engine = new VarCraft()
    engine.setPredefinedVar('n', 42)
    expect(engine.evaluate('"ari".toString()')).toBe('ari')
    expect(engine.evaluate('n.toString()')).toBe('42')
  })

  it('rejects a nested non-primitive array element', () => {
    const engine = new VarCraft()
    engine.setPredefinedVar('nested', [['a']])
    engine.setPredefinedVar('object', [{ a: 1 }])
    expect(() => engine.evaluate('nested.toString()')).toThrow(
      DeniedOperationError,
    )
    expect(() => engine.evaluate('object.toString()')).toThrow(
      DeniedOperationError,
    )
  })

  it('rejects toString arguments', () => {
    const engine = new VarCraft()
    expect(() => engine.evaluate('"ari".toString(1)')).toThrow(
      DeniedOperationError,
    )
  })
})

describe('member-method result boundary', () => {
  it('rejects a symbol result', () => {
    const engine = new VarCraft()
    engine.setMemberMethod('sym', () => convert(Symbol('s')))
    expect(() => engine.evaluate('"seed".sym()')).toThrow(DeniedOperationError)
  })

  it('rejects a bigint result', () => {
    const engine = new VarCraft()
    engine.setMemberMethod('big', () => convert(1n))
    expect(() => engine.evaluate('"seed".big()')).toThrow(DeniedOperationError)
  })

  it('rejects an oversized string result', () => {
    const engine = new VarCraft()
    engine.setMemberMethod('large', () => 'x'.repeat(LIMITS.string + 1))
    expect(() => engine.evaluate('"seed".large()')).toThrow()
  })

  it('rejects an oversized array result', () => {
    const engine = new VarCraft()
    engine.setMemberMethod('largeArray', () =>
      Array.from({ length: LIMITS.array + 1 }, () => 1),
    )
    expect(() => engine.evaluate('"seed".largeArray()')).toThrow()
  })

  it('still allows a valid registered method result', () => {
    const engine = new VarCraft()
    engine.setMemberMethod('upper', (target, args) => {
      if (args.length !== 0 || typeof target !== 'string') {
        throw new TypeError('upper expects string target')
      }
      return target.toUpperCase()
    })
    expect(engine.evaluate('"ari".upper()')).toBe('ARI')
  })

  it('still denies an unregistered method', () => {
    const engine = new VarCraft()
    expect(() => engine.evaluate('"ari".missing()')).toThrow(
      'Denied operation: member method missing',
    )
  })
})
