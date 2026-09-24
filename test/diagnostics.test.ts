import {
  type DiagnosticEvent,
  Diagnostics,
  sourceOffset,
} from '../src/diagnostics'
import { ExpressionSyntaxError } from '../src/tokenizer'
import { VarCraft } from '../src/varcraft'

function captureConsole(): { restore: () => void; text: () => string } {
  const spies = [
    jest.spyOn(console, 'error'),
    jest.spyOn(console, 'warn'),
    jest.spyOn(console, 'log'),
    jest.spyOn(console, 'info'),
  ]
  for (const spy of spies) spy.mockImplementation(() => {})
  return {
    restore: () => {
      for (const spy of spies) spy.mockRestore()
    },
    text: () =>
      spies
        .flatMap((spy) => spy.mock.calls.map((call) => call.join(' ')))
        .join('\n'),
  }
}

describe('diagnostic boundary', () => {
  it('does not build an event when disabled or without a logger', () => {
    const diagnostics = new Diagnostics()
    let builds = 0
    const build = (): DiagnosticEvent => {
      builds += 1
      return { code: 'probe' }
    }

    diagnostics.emit(build)
    diagnostics.setEnabled(true)
    diagnostics.emit(build)
    expect(builds).toBe(0)

    const seen: DiagnosticEvent[] = []
    diagnostics.setLogger((event) => seen.push(event))
    diagnostics.emit(build)
    expect(builds).toBe(1)
    expect(seen).toEqual([{ code: 'probe' }])
  })

  it('extracts an offset only from a numeric offset field', () => {
    expect(sourceOffset(undefined)).toBeUndefined()
    expect(sourceOffset(new Error('plain'))).toBeUndefined()
    expect(sourceOffset({ offset: Number.NaN })).toBeUndefined()
    expect(sourceOffset({ offset: 4 })).toBe(4)
  })

  it('does not recurse or throw when logging is enabled', () => {
    const engine = new VarCraft()
    const events: DiagnosticEvent[] = []
    engine.setEnableLogging(true)
    engine.setLogger((event) => events.push(event))

    expect(() => {
      engine.parseExpression('1 + 2')
      engine.set('a', 1)
      engine.clear()
    }).not.toThrow()

    expect(events.map((event) => event.code)).toEqual([
      'parse-expression',
      'expression-result',
      'clear',
    ])
  })

  it('emits no console output by default', () => {
    const engine = new VarCraft()
    const capture = captureConsole()
    try {
      engine.parseExpression('1 + 2')
      try {
        engine.evaluate('1 +')
      } catch {
        // expected parse failure
      }
      expect(capture.text()).toBe('')
    } finally {
      capture.restore()
    }
  })

  it('does not coerce a result while logging is disabled', () => {
    const engine = new VarCraft()
    let calls = 0
    const value = {
      toString() {
        calls += 1
        return 'coerced'
      },
    }
    engine.set('value', value)

    expect(engine.parseExpression('value')).toBe(value)
    expect(calls).toBe(0)
  })

  it('returns a null-prototype object without coercion', () => {
    const engine = new VarCraft()
    const value = Object.create(null)
    engine.set('value', value)

    expect(engine.parseExpression('value')).toBe(value)
  })

  it('keeps a sentinel secret out of console and logger text', () => {
    const engine = new VarCraft()
    const sentinel = 'SUPER_SECRET_SENTINEL_9f3'
    const events: DiagnosticEvent[] = []
    engine.setEnableLogging(true)
    engine.setLogger((event) => events.push(event))
    const capture = captureConsole()

    try {
      expect(() => engine.evaluate(`${sentinel} +`)).toThrow()
      const logged = `${JSON.stringify(events)} ${capture.text()}`
      expect(logged).not.toContain(sentinel)
      expect(capture.text()).toBe('')
      expect(events.some((event) => event.code === 'evaluate-error')).toBe(true)
    } finally {
      capture.restore()
    }
  })

  it('rethrows the original typed error with its offset preserved', () => {
    const engine = new VarCraft()
    const events: DiagnosticEvent[] = []
    engine.setEnableLogging(true)
    engine.setLogger((event) => events.push(event))
    let caught: unknown

    try {
      engine.evaluate('1 +')
    } catch (error) {
      caught = error
    }

    if (!(caught instanceof ExpressionSyntaxError))
      throw new Error('expected ExpressionSyntaxError')
    const errorEvent = events.find((event) => event.code === 'evaluate-error')
    expect(errorEvent?.errorName).toBe('ExpressionSyntaxError')
    expect(errorEvent?.offset).toBe(caught.offset)
  })

  it('persists an assignment without throwing when logging is enabled', () => {
    const engine = new VarCraft()
    const events: DiagnosticEvent[] = []
    engine.setEnableLogging(true)
    engine.setLogger((event) => events.push(event))

    expect(() => engine.evaluate('total = 1 + 2')).not.toThrow()
    expect(engine.get('total')).toBe(3)
    expect(events.some((event) => event.code === 'assignment')).toBe(true)
  })
})
