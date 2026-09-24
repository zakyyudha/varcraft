import { DeniedOperationError } from '../src/values'
import { VarCraft } from '../src/varcraft'

describe('continuous optional-chain semantics', () => {
  it('short-circuits an uninterrupted dot chain when the guarded root is nullish', () => {
    const engine = new VarCraft()

    expect(engine.evaluate('customer?.profile.name', { customer: null })).toBe(
      undefined,
    )
    expect(
      engine.evaluate('customer?.profile.name', { customer: undefined }),
    ).toBe(undefined)
  })

  it('evaluates an uninterrupted dot chain when the guarded root is present', () => {
    const engine = new VarCraft()

    expect(
      engine.evaluate('customer?.profile.name', {
        customer: { profile: { name: 'Ari' } },
      }),
    ).toBe('Ari')
  })

  it('throws when a later non-optional access meets a nullish value', () => {
    const engine = new VarCraft()

    expect(() =>
      engine.evaluate('customer?.profile.name', {
        customer: { profile: null },
      }),
    ).toThrow(DeniedOperationError)
  })

  it('short-circuits an uninterrupted computed chain and skips the key', () => {
    const engine = new VarCraft()
    let keyCalls = 0
    engine.setPredefinedVar('key', () => {
      keyCalls += 1
      return 'name'
    })

    expect(
      engine.evaluate('item?.[key()].name', { item: null }),
    ).toBeUndefined()
    expect(keyCalls).toBe(0)
  })

  it('reads an uninterrupted computed chain when values are present', () => {
    const engine = new VarCraft()
    engine.setPredefinedVar('index', () => 0)

    expect(
      engine.evaluate('items?.[index()].name', {
        items: [{ name: 'Ari' }],
      }),
    ).toBe('Ari')
  })

  it('short-circuits a method call after an optional segment when the guarded root is nullish', () => {
    const engine = new VarCraft()
    let calls = 0
    engine.setMemberMethod('c', (target, args) => {
      calls += 1
      return [target, args.length]
    })

    expect(engine.evaluate('a?.b.c()', { a: null })).toBeUndefined()
    expect(engine.evaluate('a?.b.c()', { a: undefined })).toBeUndefined()
    expect(calls).toBe(0)
  })

  it('dispatches a method call after an optional segment when the guarded root is present', () => {
    const engine = new VarCraft()
    engine.setMemberMethod('c', (target) => `c:${String(target)}`)

    expect(engine.evaluate('a?.b.c()', { a: { b: 'x' } })).toBe('c:x')
    expect(engine.evaluate('a.b.c()', { a: { b: 'y' } })).toBe('c:y')
  })

  it('performs ordinary access after grouping and throws on nullish', () => {
    const engine = new VarCraft()

    expect(() =>
      engine.evaluate('(customer?.profile).name', { customer: null }),
    ).toThrow(DeniedOperationError)
    expect(() => engine.evaluate('(items?.[0]).name', { items: null })).toThrow(
      DeniedOperationError,
    )

    expect(
      engine.evaluate('(customer?.profile).name', {
        customer: { profile: { name: 'Ari' } },
      }),
    ).toBe('Ari')
  })

  it('returns undefined for a null or undefined guarded root', () => {
    const engine = new VarCraft()

    expect(engine.evaluate('null?.profile.name')).toBeUndefined()
    expect(engine.evaluate('undefined?.profile.name')).toBeUndefined()
    expect(
      engine.evaluate('missing?.profile', { missing: null }),
    ).toBeUndefined()
  })

  it('still denies dangerous keys through optional and computed syntax', () => {
    const engine = new VarCraft()
    engine.set('value', { constructor: 'blocked', prototype: 'blocked' })

    expect(() => engine.evaluate('value?.constructor')).toThrow(
      DeniedOperationError,
    )
    expect(() => engine.evaluate('value?.["prototype"]')).toThrow(
      DeniedOperationError,
    )
  })
})
