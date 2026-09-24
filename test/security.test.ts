import { VarCraft } from '../src/varcraft'

describe('expression call boundary', () => {
  it('rejects callbacks when supplied only through input data', () => {
    // Given a data callback with an observable effect.
    const engine = new VarCraft()
    let calls = 0
    const callback = () => ++calls
    // When expression text attempts to invoke input data.
    const evaluate = () => engine.evaluate('callback()', { callback })
    // Then the callback never executes.
    expect(evaluate).toThrow()
    expect(calls).toBe(0)
  })

  it('rejects ambient globals and constructor access', () => {
    const engine = new VarCraft()

    expect(() => engine.evaluate('process')).toThrow()
    expect(() => engine.evaluate('globalThis')).toThrow()
    expect(() => engine.evaluate('({}).constructor')).toThrow()
  })
})
