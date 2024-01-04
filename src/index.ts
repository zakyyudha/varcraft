import { VarCraft as Parser } from './varcraft'

const VarCraft = new Parser()
VarCraft.setPredefinedVar('_sum', (arr) => {
  return arr.reduce((accumulator: any, currentValue: any) => {
    return accumulator + currentValue
  }, 0)
})

VarCraft.setPredefinedVar('_map', (arr, expression) => {
  return arr.map((item: any, index: any) => {
    return VarCraft.parseExpression(expression, {
      ...arr,
      _item_: item,
      _index_: index,
    })
  })
})

VarCraft.setPredefinedVar('_filter', (arr, expression) => {
  return arr.filter((item: any, index: any) => {
    return VarCraft.parseExpression(expression, {
      ...arr,
      _item_: item,
      _index_: index,
    })
  })
})

VarCraft.setPredefinedVar('_reduce', (arr, expression, initialValue) => {
  return arr.reduce((accumulator: any, currentValue: any, index: any) => {
    return VarCraft.parseExpression(expression, {
      ...arr,
      _item_: currentValue,
      _index_: index,
      _accumulator_: accumulator,
    })
  }, VarCraft.parseExpression(initialValue))
})

VarCraft.setPredefinedVar('_chunk', (arr, size) => {
  const chunks = []
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size))
  }
  return chunks
})

VarCraft.setPredefinedVar('_includes', (arr, value) => {
  return arr.includes(value)
})

VarCraft.setPredefinedVar(
  '_if',
  (conditionExpression, trueExpression, falseExpression) => {
    return VarCraft.parseExpression(conditionExpression)
      ? VarCraft.parseExpression(trueExpression)
      : VarCraft.parseExpression(falseExpression)
  },
)

VarCraft.setPredefinedVar('_switch', (value, ...cases) => {
  const defaultCase = cases[cases.length - 1]
  if (cases.length % 2 === 0) {
    throw new Error('switch case should have default case')
  }

  const defaultCaseValue = VarCraft.parseExpression(defaultCase)
  const valueExpression = VarCraft.parseExpression(value)

  for (let i = 0; i < cases.length; i += 2) {
    if (valueExpression === VarCraft.parseExpression(cases[i])) {
      return VarCraft.parseExpression(cases[i + 1])
    }
  }
  return defaultCaseValue
})

export default VarCraft
