import { VarCraft as Parser } from './varcraft'

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

const VarCraft = new Parser()
VarCraft.setPredefinedVar('_sum', (arr: unknown) => {
  const values = arrayValue(arr)
  return values.reduce((accumulator: unknown, currentValue: unknown) => {
    if (typeof accumulator !== 'number' || typeof currentValue !== 'number')
      throw new TypeError('Expected numeric values')
    return accumulator + currentValue
  }, 0)
})

VarCraft.setPredefinedVar('_map', (arr: unknown, expression: unknown) => {
  const values = arrayValue(arr)
  return values.map((item: unknown, index: number) => {
    return VarCraft.parseExpression(textValue(expression), {
      ...values,
      _item_: item,
      _index_: index,
    })
  })
})

VarCraft.setPredefinedVar('_filter', (arr: unknown, expression: unknown) => {
  const values = arrayValue(arr)
  return values.filter((item: unknown, index: number) => {
    return VarCraft.parseExpression(textValue(expression), {
      ...values,
      _item_: item,
      _index_: index,
    })
  })
})

VarCraft.setPredefinedVar(
  '_reduce',
  (arr: unknown, expression: unknown, initialValue: unknown) => {
    const values = arrayValue(arr)
    return values.reduce(
      (accumulator: unknown, currentValue: unknown, index: number) => {
        return VarCraft.parseExpression(textValue(expression), {
          ...values,
          _item_: currentValue,
          _index_: index,
          _accumulator_: accumulator,
        })
      },
      VarCraft.parseExpression(String(initialValue)),
    )
  },
)

VarCraft.setPredefinedVar('_chunk', (arr: unknown, size: unknown) => {
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
  return chunks
})

VarCraft.setPredefinedVar('_includes', (arr: unknown, value: unknown) => {
  return arrayValue(arr).includes(value)
})

VarCraft.setPredefinedVar(
  '_if',
  (
    conditionExpression: unknown,
    trueExpression: unknown,
    falseExpression: unknown,
  ) => {
    return VarCraft.parseExpression(textValue(conditionExpression))
      ? VarCraft.parseExpression(textValue(trueExpression))
      : VarCraft.parseExpression(textValue(falseExpression))
  },
)

VarCraft.setPredefinedVar('_switch', (value: unknown, ...cases: unknown[]) => {
  const defaultCase = cases[cases.length - 1]
  if (cases.length % 2 === 0) {
    throw new Error('switch case should have default case')
  }

  const defaultCaseValue = VarCraft.parseExpression(textValue(defaultCase))
  const valueExpression = VarCraft.parseExpression(textValue(value))

  for (let i = 0; i < cases.length - 1; i += 2) {
    if (valueExpression === VarCraft.parseExpression(textValue(cases[i]))) {
      return VarCraft.parseExpression(textValue(cases[i + 1]))
    }
  }
  return defaultCaseValue
})

export default VarCraft
