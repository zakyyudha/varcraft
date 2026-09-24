import { DeniedOperationError, MissingNameError } from '../src/values'
import { VarCraft } from '../src/varcraft'

// Task 9 (finding M4): nested `_map`/`_filter`/`_reduce` expression strings run
// in a scope derived from the outer evaluation. They inherit outer data,
// stored, and predefined bindings while overlaying the reserved helper names
// `_item_`/`_index_`/`_accumulator_`. The scope is passed explicitly per
// evaluation; there is no module-global "active data" state.
//
// INHERITANCE IS SHALLOW: inherited objects/arrays are shared by reference, not
// deep-cloned. A host that hands VarCraft a mutable object can observe the same
// reference inside a nested helper result, and vice versa.

function engine(): VarCraft {
  return new VarCraft({ builtins: true })
}

describe('nested helper scope inheritance (M4)', () => {
  it('lets _map read a scalar from the outer data object', () => {
    const items = [{ price: 2 }, { price: 3 }]

    expect(
      engine().evaluate('_map(items, "_item_.price * rate")', {
        items,
        rate: 10,
      }),
    ).toEqual([20, 30])
  })

  it('lets _filter read a scalar from the outer data object', () => {
    const items = [{ price: 2 }, { price: 30 }, { price: 5 }]

    expect(
      engine().evaluate('_filter(items, "_item_.price > threshold")', {
        items,
        threshold: 10,
      }),
    ).toEqual([items[1]])
  })

  it('lets _reduce read a scalar from the outer data object', () => {
    const items = [{ price: 2 }, { price: 3 }]

    expect(
      engine().evaluate(
        '_reduce(items, "_accumulator_ + _item_.price * rate", 0)',
        { items, rate: 10 },
      ),
    ).toBe(50)
  })

  it('inherits outer data through composed reduce(filter(...)) helper calls', () => {
    const items = [
      { active: true, price: 2 },
      { active: false, price: 100 },
      { active: true, price: 3 },
    ]

    expect(
      engine().evaluate(
        '_reduce(_filter(items, "_item_.active"), "_accumulator_ + _item_.price * rate", 0)',
        { items, rate: 10 },
      ),
    ).toBe(50)
  })

  it('inherits outer stored and predefined bindings, keeping documented precedence', () => {
    const instance = engine()
    instance.set('stored', 5)
    instance.setPredefinedVar('predefined', 7)

    expect(instance.evaluate('_map([1], "stored + predefined")')).toEqual([12])
    // stored/predefined outrank the inherited data layer (methods > predefined
    // > stored > data), so the same-named data keys never shadow them.
    expect(
      instance.evaluate('_map([1], "stored + predefined")', {
        stored: 99,
        predefined: 99,
      }),
    ).toEqual([12])
  })

  it('overlays _item_ over an inherited data binding of the same name', () => {
    expect(
      engine().evaluate('_map([5, 6], "_item_")', { _item_: 'ambient' }),
    ).toEqual([5, 6])
  })

  it('overlays _index_ over an inherited data binding of the same name', () => {
    expect(
      engine().evaluate('_map([5, 6], "_index_")', { _index_: 99 }),
    ).toEqual([0, 1])
  })

  it('overlays _accumulator_ over an inherited data binding of the same name', () => {
    expect(
      engine().evaluate('_reduce([1, 2], "_accumulator_ + 1", 100)', {
        _accumulator_: 7,
      }),
    ).toBe(102)
  })

  it('resolves a reduce initial expression against the inherited scope', () => {
    expect(
      engine().evaluate('_reduce([1, 2], "_accumulator_ + _item_", "base")', {
        base: 10,
      }),
    ).toBe(13)
  })

  it('keeps input-data callbacks non-callable inside nested expressions', () => {
    const instance = engine()
    const callback = () => 'called'

    expect(() =>
      instance.evaluate('_map([1], "callback()")', { callback }),
    ).toThrow(DeniedOperationError)
  })

  it('still reads an input-data callback as a value inside a nested expression', () => {
    const instance = engine()
    const callback = () => 'called'

    expect(instance.evaluate('_map([1], "callback")', { callback })).toEqual([
      callback,
    ])
  })

  it('never falls back to ambient globals inside nested expressions', () => {
    expect(() => engine().evaluate('_map([1], "process")')).toThrow(
      MissingNameError,
    )
  })

  it('shares inherited objects and arrays by reference (shallow alias)', () => {
    const instance = engine()
    const shared = { total: 3 }
    const sharedList = [1, 2, 3]

    expect(instance.evaluate('_map([0], "shared")', { shared })).toEqual([
      shared,
    ])
    const sharedResult = instance.evaluate('_map([0], "shared")', {
      shared,
    }) as unknown[]
    expect(sharedResult[0]).toBe(shared)
    const listResult = instance.evaluate('_map([0], "sharedList")', {
      sharedList,
    }) as unknown[]
    expect(listResult[0]).toBe(sharedList)
  })

  it('does not leak outer data between two sibling evaluations', () => {
    const instance = engine()

    expect(
      instance.evaluate('_map(items, "_item_.price * rate")', {
        items: [{ price: 2 }],
        rate: 10,
      }),
    ).toEqual([20])
    // A later evaluation that does not supply `rate` must fail rather than see
    // the previous evaluation's scope.
    expect(() =>
      instance.evaluate('_map(items, "_item_.price * rate")', {
        items: [{ price: 2 }],
      }),
    ).toThrow(MissingNameError)
  })
})
