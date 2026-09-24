import { inheritedData, LAZY_ARGS, type LazyArgument } from './interpreter'
import { spendWork } from './limits'
import type { VarCraft } from './varcraft'

// Task 9 (M4): nested helper expressions inherit the outer evaluation's data,
// stored, and predefined bindings. The reserved names below are overlaid last,
// so they win over an inherited data binding of the same name. Inheritance is
// SHALLOW: inherited objects/arrays are shared by reference, never deep-cloned.
function nestedScope(
  receiver: unknown,
  overlays: Record<string, unknown>,
): Record<string, unknown> {
  return { ...inheritedData(receiver), ...overlays }
}

function arrayValue(value: unknown): unknown[] {
  if (!Array.isArray(value)) throw new TypeError('Expected an array')
  return value
}

function textValue(value: unknown): string {
  if (
    value === null ||
    (typeof value !== 'string' &&
      typeof value !== 'number' &&
      typeof value !== 'boolean')
  )
    throw new TypeError('Expected a primitive expression value')
  return String(value)
}

function numberValue(value: unknown): number {
  if (typeof value !== 'number') throw new TypeError('Expected a number')
  return value
}

function lazyArgs<T extends (...args: unknown[]) => unknown>(callback: T): T {
  Object.defineProperty(callback, LAZY_ARGS, { value: true })
  return callback
}

function lazyValue(value: unknown): LazyArgument {
  if (
    typeof value !== 'object' ||
    value === null ||
    typeof (value as LazyArgument).evaluate !== 'function'
  )
    throw new TypeError('Expected a lazy argument')
  return value as LazyArgument
}

export function registerBuiltins(engine: VarCraft): void {
  engine.setPredefinedVar('_sum', (arr: unknown) => {
    const values = arrayValue(arr)
    spendWork(values.length)
    return values.reduce((accumulator: unknown, currentValue: unknown) => {
      if (typeof accumulator !== 'number' || typeof currentValue !== 'number')
        throw new TypeError('Expected numeric values')
      return accumulator + currentValue
    }, 0)
  })

  engine.setPredefinedVar(
    '_map',
    function (this: unknown, arr: unknown, expression: unknown) {
      const values = arrayValue(arr)
      return values.map((item: unknown, index: number) => {
        spendWork(values.length + 1)
        return engine.parseExpression(
          textValue(expression),
          nestedScope(this, { ...values, _item_: item, _index_: index }),
        )
      })
    },
  )

  engine.setPredefinedVar(
    '_filter',
    function (this: unknown, arr: unknown, expression: unknown) {
      const values = arrayValue(arr)
      return values.filter((item: unknown, index: number) => {
        spendWork(values.length + 1)
        return engine.parseExpression(
          textValue(expression),
          nestedScope(this, { ...values, _item_: item, _index_: index }),
        )
      })
    },
  )

  engine.setPredefinedVar(
    '_reduce',
    function (
      this: unknown,
      arr: unknown,
      expression: unknown,
      initialValue: unknown,
    ) {
      const inherited = inheritedData(this)
      const values = arrayValue(arr)
      return values.reduce(
        (accumulator: unknown, currentValue: unknown, index: number) => {
          spendWork(values.length + 1)
          return engine.parseExpression(textValue(expression), {
            ...inherited,
            ...values,
            _item_: currentValue,
            _index_: index,
            _accumulator_: accumulator,
          })
        },
        engine.parseExpression(String(initialValue), inherited),
      )
    },
  )

  engine.setPredefinedVar('_chunk', (arr: unknown, size: unknown) => {
    const values = arrayValue(arr)
    const chunkSize = numberValue(size)
    if (
      !Number.isFinite(chunkSize) ||
      !Number.isInteger(chunkSize) ||
      chunkSize <= 0
    )
      throw new RangeError('Chunk size must be a positive integer')
    const chunks: unknown[][] = []
    for (let i = 0; i < values.length; i += chunkSize) {
      chunks.push(values.slice(i, i + chunkSize))
    }
    spendWork(values.length)
    return chunks
  })

  engine.setPredefinedVar('_includes', (arr: unknown, value: unknown) => {
    const values = arrayValue(arr)
    spendWork(values.length)
    return values.includes(value)
  })

  // Task 10 (M5): `_when`/`_case` are AST-native lazy helpers. Arguments are
  // ordinary expressions, evaluated on demand in argument order: the selected
  // branch runs once, the unselected branch never runs, and a `_case` default
  // runs only when no case matches. No expression strings, so no double quotes.
  engine.setPredefinedVar(
    '_when',
    lazyArgs((condition: unknown, whenTrue: unknown, whenFalse: unknown) =>
      lazyValue(condition).evaluate()
        ? lazyValue(whenTrue).evaluate()
        : lazyValue(whenFalse).evaluate(),
    ),
  )

  engine.setPredefinedVar(
    '_case',
    lazyArgs((subject: unknown, ...cases: unknown[]) => {
      if (cases.length % 2 === 0)
        throw new TypeError('_case expects a default as the final argument')
      const selected = lazyValue(subject).evaluate()
      for (let i = 0; i < cases.length - 1; i += 2) {
        if (selected === lazyValue(cases[i]).evaluate())
          return lazyValue(cases[i + 1]).evaluate()
      }
      return lazyValue(cases[cases.length - 1]).evaluate()
    }),
  )

  // Deprecated compatibility shims (M5), retained through 2.x. Their arguments
  // are evaluated eagerly by the interpreter and converted to text, so nested
  // string literals keep the historic double-quote convention (write `'"two"'`).
  // Prefer `_when`/`_case`.
  engine.setPredefinedVar(
    '_if',
    (
      conditionExpression: unknown,
      trueExpression: unknown,
      falseExpression: unknown,
    ) => {
      return engine.parseExpression(textValue(conditionExpression))
        ? engine.parseExpression(textValue(trueExpression))
        : engine.parseExpression(textValue(falseExpression))
    },
  )

  engine.setPredefinedVar('_switch', (value: unknown, ...cases: unknown[]) => {
    if (cases.length % 2 === 0) {
      throw new Error('switch case should have default case')
    }

    const valueExpression = engine.parseExpression(textValue(value))

    for (let i = 0; i < cases.length - 1; i += 2) {
      if (valueExpression === engine.parseExpression(textValue(cases[i]))) {
        return engine.parseExpression(textValue(cases[i + 1]))
      }
    }
    return engine.parseExpression(textValue(cases[cases.length - 1]))
  })
}
