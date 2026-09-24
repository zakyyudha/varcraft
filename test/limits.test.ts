import { LIMITS, LimitError, limit, spendWork } from '../src/limits'
import { VarCraft } from '../src/varcraft'

const RESOURCES = Object.keys(LIMITS) as (keyof typeof LIMITS)[]

function engine(): VarCraft {
  return new VarCraft({ builtins: true })
}

function expectLimitError(
  run: () => unknown,
  resource: keyof typeof LIMITS,
): void {
  try {
    run()
    throw new Error(`expected a LimitError for ${resource}`)
  } catch (error) {
    expect(error).toBeInstanceOf(LimitError)
    expect((error as LimitError).resource).toBe(resource)
  }
}

function keysObject(size: number): Record<string, number> {
  return Object.fromEntries(
    Array.from({ length: size }, (_, index) => [`k${index}`, index]),
  )
}

function ones(size: number): number[] {
  return Array.from({ length: size }, () => 1)
}

function balanced(leaves: number): string {
  if (leaves <= 1) return '1'
  const half = Math.ceil(leaves / 2)
  return `(${balanced(half)}+${balanced(leaves - half)})`
}

function ternaryArray(size: number): string {
  return `[${Array.from({ length: size }, () => 'a?b:c').join(',')}]`
}

function groups(depth: number): string {
  return `${'('.repeat(depth)}1${')'.repeat(depth)}`
}

describe('published limit boundaries (finding M6)', () => {
  it('accepts every resource exactly at its limit and rejects limit + 1', () => {
    for (const resource of RESOURCES) {
      expect(() => limit(resource, LIMITS[resource])).not.toThrow()
      expectLimitError(() => limit(resource, LIMITS[resource] + 1), resource)
    }
  })

  it('rejects an oversized top-level source before parsing', () => {
    const atLimit = `"${'a'.repeat(LIMITS.source - 2)}"`
    const overLimit = `"${'a'.repeat(LIMITS.source - 1)}"`
    expect(engine().evaluate(atLimit)).toHaveLength(LIMITS.source - 2)
    expectLimitError(() => engine().evaluate(overLimit), 'source')
  })

  it('rejects an oversized host string binding', () => {
    const atLimit = 'a'.repeat(LIMITS.string)
    expect(engine().evaluate('s', { s: atLimit })).toHaveLength(LIMITS.string)
    expectLimitError(
      () => engine().evaluate('s', { s: `${atLimit}a` }),
      'string',
    )
  })

  it('rejects an oversized host array binding', () => {
    expect(engine().evaluate('a', { a: ones(LIMITS.array) })).toHaveLength(
      LIMITS.array,
    )
    expectLimitError(
      () => engine().evaluate('a', { a: ones(LIMITS.array + 1) }),
      'array',
    )
  })

  it('bounds object snapshots by the key limit', () => {
    expect(engine().evaluate('1', keysObject(LIMITS.keys))).toBe(1)
    expectLimitError(
      () => engine().evaluate('1', keysObject(LIMITS.keys + 1)),
      'keys',
    )
  })

  it('rejects a token storm that no smaller limit catches first', () => {
    expect(engine().evaluate(balanced(1024))).toBe(1024)
    expectLimitError(() => engine().evaluate(balanced(1025)), 'tokens')
  })

  it('rejects an expression that exceeds the AST node budget', () => {
    const data = { a: 1, b: 1, c: 1 }
    expect(engine().evaluate(ternaryArray(511), data)).toHaveLength(511)
    expectLimitError(() => engine().evaluate(ternaryArray(512), data), 'nodes')
  })

  it('rejects nested grouping deeper than the parser depth budget', () => {
    expect(engine().evaluate(groups(LIMITS.depth - 1))).toBe(1)
    expectLimitError(() => engine().evaluate(groups(LIMITS.depth)), 'depth')
  })

  it('rejects a call with more arguments than the argument budget', () => {
    const e = engine()
    e.setPredefinedVar('_argc', (...args: unknown[]) => args.length)
    const call = (count: number) => `_argc(${ones(count).join(',')})`
    expect(e.evaluate(call(LIMITS.args))).toBe(LIMITS.args)
    expectLimitError(() => e.evaluate(call(LIMITS.args + 1)), 'args')
  })
})

describe('shared budget across helpers and host collections (finding M6)', () => {
  it('charges nested helper evaluations to one shared counter', () => {
    const e = engine()
    e.setPredefinedVar('_spin', (times: unknown) => {
      const count = Number(times)
      for (let index = 0; index < count; index += 1) e.parseExpression('1')
      return count
    })
    expect(e.evaluate(`_spin(${LIMITS.evaluations - 2})`)).toBe(
      LIMITS.evaluations - 2,
    )
    expectLimitError(
      () => e.evaluate(`_spin(${LIMITS.evaluations})`),
      'evaluations',
    )
  })

  it('shares spendWork across nested helper calls', () => {
    const e = engine()
    e.setPredefinedVar('_burn', () => {
      spendWork(40000)
      return 0
    })
    expect(e.evaluate('_burn()')).toBe(0)
    expectLimitError(() => e.evaluate('_map([0, 0, 0], "_burn()")'), 'work')
  })

  it('bounds repeated array-spread helper workload deterministically', () => {
    expect(
      engine().evaluate('_map(nums, "1")', { nums: ones(10) }),
    ).toHaveLength(10)
    expectLimitError(
      () => engine().evaluate('_map(nums, "1")', { nums: ones(400) }),
      'work',
    )
  })

  it('bounds member-method result growth by the array and string limits', () => {
    const e = engine()
    e.setMemberMethod('okArray', () => ones(LIMITS.array))
    e.setMemberMethod('bigArray', () => ones(LIMITS.array + 1))
    e.setMemberMethod('bigString', () => 'a'.repeat(LIMITS.string + 1))
    expect(e.evaluate('"x".okArray()')).toHaveLength(LIMITS.array)
    expectLimitError(() => e.evaluate('"x".bigArray()'), 'array')
    expectLimitError(() => e.evaluate('"x".bigString()'), 'string')
  })

  it('resets the budget after success and after failure', () => {
    const e = engine()
    const heavy = () => e.evaluate('_map(nums, "1")', { nums: ones(50) })
    expect(heavy()).toHaveLength(50)
    expect(heavy()).toHaveLength(50)
    expectLimitError(
      () => e.evaluate('_map(nums, "1")', { nums: ones(400) }),
      'work',
    )
    expect(e.evaluate('1 + 1')).toBe(2)
    expect(heavy()).toHaveLength(50)
  })
})
