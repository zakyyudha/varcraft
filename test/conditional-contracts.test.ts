import { MissingNameError } from '../src/values'
import { VarCraft } from '../src/varcraft'

// Task 10 (M5): conditional/switch contracts.
//
// Argument contract:
// - Legacy `_if`/`_switch` are retained compatibility shims. Their branch/case
//   arguments are expression STRINGS that are converted to text and reparsed,
//   so nested literals keep the historic double-quote convention: a string
//   literal is written `'"two"'`.
// - New `_when`/`_case` are AST-native lazy helpers. Their arguments are
//   ordinary expressions evaluated on demand in argument order; the selected
//   branch is evaluated once, the unselected branch is never evaluated, and a
//   `_case` default is evaluated only when no case matches.

function counterEngine(): { engine: VarCraft; calls: () => number } {
  const engine = new VarCraft({ builtins: true })
  let calls = 0
  engine.setPredefinedVar('_bump', () => {
    calls += 1
    return calls
  })
  return { engine, calls: () => calls }
}

describe('conditional and switch contracts (M5)', () => {
  describe('legacy compatibility shims', () => {
    it('_if still selects a literal branch from quoted expression strings', () => {
      const engine = new VarCraft({ builtins: true })
      expect(engine.evaluate('_if(10 > 5, true, false)')).toBe(true)
    })

    it('_switch still resolves nested member results with the double-quote convention', () => {
      const engine = new VarCraft({ builtins: true })
      engine.set('project', {
        approvals: [{ members: [{ name: 'Ari' }] }],
      })

      expect(
        engine.evaluate(
          `_switch('"approved"', '"approved"', 'project.approvals[0].members[0].name', '"other"')`,
        ),
      ).toBe('Ari')
    })

    it('_switch no longer evaluates the default before a matching case', () => {
      const { engine, calls } = counterEngine()

      expect(engine.evaluate(`_switch(1, 1, '"hit"', '_bump()')`)).toBe('hit')
      expect(calls()).toBe(0)
    })

    it('_switch still evaluates the default when nothing matches', () => {
      const { engine, calls } = counterEngine()

      expect(engine.evaluate(`_switch(9, 1, '"hit"', '_bump()')`)).toBe(1)
      expect(calls()).toBe(1)
    })
  })

  describe('_when lazy conditional', () => {
    it('evaluates only the selected branch when the condition is false', () => {
      const { engine, calls } = counterEngine()

      expect(engine.evaluate('_when(false, _bump(), "safe")')).toBe('safe')
      expect(calls()).toBe(0)
    })

    it('evaluates only the selected branch when the condition is true', () => {
      const { engine, calls } = counterEngine()

      expect(engine.evaluate('_when(true, "yes", _bump())')).toBe('yes')
      expect(calls()).toBe(0)
    })

    it('does not run an unselected branch assignment (zero side effects)', () => {
      const engine = new VarCraft({ builtins: true })

      expect(engine.evaluate('_when(false, set("ran", 1), "safe")')).toBe(
        'safe',
      )
      expect(() => engine.get('ran')).toThrow(MissingNameError)
    })

    it('does not resolve an unselected branch identifier', () => {
      const engine = new VarCraft({ builtins: true })

      expect(engine.evaluate('_when(true, "ok", missingName)')).toBe('ok')
    })

    it('evaluates branch expressions against the outer data layer', () => {
      const engine = new VarCraft({ builtins: true })

      expect(
        engine.evaluate('_when(flag, rate * 2, 0)', { flag: true, rate: 5 }),
      ).toBe(10)
    })

    it('evaluates the selected branch assignment (positive side effect)', () => {
      const engine = new VarCraft({ builtins: true })

      expect(engine.evaluate('_when(true, set("ran", 1), 0)')).toBeUndefined()
      expect(engine.get('ran')).toBe(1)
    })

    it('composes without evaluating excluded nested branches', () => {
      const engine = new VarCraft({ builtins: true })

      expect(
        engine.evaluate('_when(true, _case(2, 1, "a", 2, "b", "z"), _bump())'),
      ).toBe('b')
    })

    it('works inside a nested helper scope', () => {
      const engine = new VarCraft({ builtins: true })

      expect(
        engine.evaluate(
          `_map([1, 2], '_case(_item_, 1, "one", 2, "two", "other")')`,
        ),
      ).toEqual(['one', 'two'])
    })
  })

  describe('_case lazy switch', () => {
    it('evaluates the subject expression exactly once', () => {
      const { engine, calls } = counterEngine()

      expect(engine.evaluate('_case(_bump(), 9, "a", 1, "b", "z")')).toBe('b')
      expect(calls()).toBe(1)
    })

    it('matches raw values without the double-quote convention', () => {
      const engine = new VarCraft({ builtins: true })

      expect(
        engine.evaluate('_case(status, "approved", "A", "other")', {
          status: 'approved',
        }),
      ).toBe('A')
    })

    it('does not evaluate the default before a matching case', () => {
      const { engine, calls } = counterEngine()

      expect(engine.evaluate('_case(1, 1, "hit", _bump())')).toBe('hit')
      expect(calls()).toBe(0)
    })

    it('does not run a default assignment when a case matches', () => {
      const engine = new VarCraft({ builtins: true })

      expect(
        engine.evaluate('_case("b", "a", "A", "b", "B", set("defaultRan", 1))'),
      ).toBe('B')
      expect(() => engine.get('defaultRan')).toThrow(MissingNameError)
    })

    it('evaluates the default only when nothing matches', () => {
      const { engine, calls } = counterEngine()

      expect(engine.evaluate('_case(9, 1, "hit", _bump())')).toBe(1)
      expect(calls()).toBe(1)
    })

    it('evaluates result expressions against the outer data layer', () => {
      const engine = new VarCraft({ builtins: true })

      expect(engine.evaluate('_case(0, 0, rate + 1, "x")', { rate: 5 })).toBe(6)
    })

    it('rejects a malformed case list without a default', () => {
      const engine = new VarCraft({ builtins: true })

      expect(() => engine.evaluate('_case(1, 1, "hit")')).toThrow(/_?case/i)
    })
  })
})
