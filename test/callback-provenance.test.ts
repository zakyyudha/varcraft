import { DeniedOperationError } from '../src/values'
import { VarCraft } from '../src/varcraft'

// Task 7 (H9 + M1): a function that arrived through evaluation `data` must not
// become callable merely because expression text stored it. Only an explicit
// host grant (set / setPredefinedVar / setMemberMethod) makes it callable.
// The legacy merged `this` receiver is documented compatibility behavior and is
// asserted as-is; it is deliberately unchanged.

function registerMap(engine: VarCraft): void {
  engine.setPredefinedVar('_map', (arr: unknown, expression: unknown) => {
    if (!Array.isArray(arr)) throw new TypeError('expected array')
    return arr.map((item, index) =>
      engine.parseExpression(String(expression), {
        ...arr,
        _item_: item,
        _index_: index,
      }),
    )
  })
}

describe('callback provenance and capability authority', () => {
  it('rejects a direct call to a data-origin callback', () => {
    const engine = new VarCraft()
    const callback = () => 'called'

    expect(() => engine.evaluate('callback()', { callback })).toThrow(
      DeniedOperationError,
    )
  })

  it('rejects two-step assignment promotion of a data-origin callback', () => {
    const engine = new VarCraft()
    let calls = 0
    const callback = () => ++calls

    engine.evaluate('saved = callback', { callback })

    expect(engine.get('saved')).toBe(callback)
    expect(() => engine.evaluate('saved()')).toThrow(DeniedOperationError)
    expect(calls).toBe(0)
  })

  it('rejects promotion of a data-origin callback reached through a member read', () => {
    const engine = new VarCraft()
    let calls = 0
    const callback = () => ++calls
    const holder = { method: callback }

    engine.evaluate('x = holder.method', { holder })

    expect(engine.get('x')).toBe(callback)
    expect(() => engine.evaluate('x()')).toThrow(DeniedOperationError)
    expect(calls).toBe(0)
  })

  it('rejects promotion of a data-origin callback reached through a computed read', () => {
    const engine = new VarCraft()
    let calls = 0
    const callback = () => ++calls

    engine.evaluate('y = arr[0]', { arr: [callback] })

    expect(engine.get('y')).toBe(callback)
    expect(() => engine.evaluate('y()')).toThrow(DeniedOperationError)
    expect(calls).toBe(0)
  })

  it('rejects promotion of a data-origin callback reached through an optional read', () => {
    const engine = new VarCraft()
    let calls = 0
    const callback = () => ++calls
    const holder = { method: callback }

    engine.evaluate('z = holder?.method', { holder })

    expect(engine.get('z')).toBe(callback)
    expect(() => engine.evaluate('z()')).toThrow(DeniedOperationError)
    expect(calls).toBe(0)
  })

  it('rejects promotion of a data-origin callback reached through a deep member chain', () => {
    const engine = new VarCraft()
    let calls = 0
    const callback = () => ++calls

    engine.evaluate('deep = a.b.c', { a: { b: { c: callback } } })

    expect(engine.get('deep')).toBe(callback)
    expect(() => engine.evaluate('deep()')).toThrow(DeniedOperationError)
    expect(calls).toBe(0)
  })

  it('rejects expression-level set promotion of a data-origin callback', () => {
    const engine = new VarCraft()
    let calls = 0
    const callback = () => ++calls

    engine.evaluate('set("saved", callback)', { callback })

    expect(() => engine.evaluate('saved()')).toThrow(DeniedOperationError)
    expect(calls).toBe(0)
  })

  it('rejects nested _map + set promotion of a data-origin callback', () => {
    const engine = new VarCraft()
    let calls = 0
    const callback = () => ++calls
    registerMap(engine)

    expect(() =>
      engine.evaluate('_map([set("saved", callback)], "saved()")', {
        callback,
      }),
    ).toThrow(DeniedOperationError)
    expect(calls).toBe(0)
  })

  it('still reads a data-origin callback as a value without invoking it', () => {
    const engine = new VarCraft()
    const callback = () => 'called'

    expect(engine.evaluate('callback', { callback })).toBe(callback)
  })

  it('keeps host setPredefinedVar callable direct and nested', () => {
    const engine = new VarCraft()
    registerMap(engine)
    engine.setPredefinedVar('ok', () => 42)

    expect(engine.evaluate('ok()')).toBe(42)
    expect(engine.evaluate('_map([1, 2], "ok()")')).toEqual([42, 42])
  })

  it('lets an explicit host set grant promote a previously data-origin callback', () => {
    const engine = new VarCraft()
    const callback = () => 'granted'

    expect(() => engine.evaluate('callback()', { callback })).toThrow(
      DeniedOperationError,
    )
    engine.set('granted', callback)

    expect(engine.evaluate('granted()')).toBe('granted')
  })

  it('lets an explicit host setPredefinedVar grant promote a data-origin callback', () => {
    const engine = new VarCraft()
    const callback = () => 'granted'

    engine.evaluate('ignored = callback', { callback })
    engine.setPredefinedVar('granted', callback)

    expect(engine.evaluate('granted()')).toBe('granted')
  })

  it('preserves positional argument order for registered callbacks', () => {
    const engine = new VarCraft()
    engine.setPredefinedVar('pair', (a: unknown, b: unknown) => [a, b])
    engine.setPredefinedVar(
      'joined',
      (a: unknown, b: unknown, c: unknown) => `${a}-${b}-${c}`,
    )

    expect(engine.evaluate('pair(1, 2)')).toEqual([1, 2])
    expect(engine.evaluate('joined("x", "y", "z")')).toBe('x-y-z')
  })

  it('documents the legacy merged receiver exposing bound set/get/clear', () => {
    const engine = new VarCraft()
    engine.setPredefinedVar('writeThrough', function (this: unknown) {
      const receiver = this as {
        set: (name: string, value: unknown) => void
        get: (name: string) => unknown
      }
      receiver.set('marked', 9)
      return receiver.get('marked')
    })

    expect(engine.evaluate('writeThrough()')).toBe(9)
    expect(engine.get('marked')).toBe(9)
  })
})
