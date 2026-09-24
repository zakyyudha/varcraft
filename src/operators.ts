import { assertNever, type BinaryOperator } from './ast'
import { primitive, type Value, valueFromHost } from './values'

export function binary(
  operator: BinaryOperator,
  left: Value,
  right: Value,
): Value {
  switch (operator) {
    case '===':
      return left === right
    case '!==':
      return left !== right
    case '&&':
      return left && right
    case '||':
      return left || right
    default:
      break
  }
  const a = primitive(left)
  const b = primitive(right)
  switch (operator) {
    case '+':
      return valueFromHost(
        typeof a === 'string' || typeof b === 'string'
          ? String(a) + String(b)
          : Number(a) + Number(b),
      )
    case '-':
      return Number(a) - Number(b)
    case '*':
      return Number(a) * Number(b)
    case '/':
      return Number(a) / Number(b)
    case '%':
      return Number(a) % Number(b)
    case '<':
      return typeof a === 'string' && typeof b === 'string'
        ? a < b
        : Number(a) < Number(b)
    case '<=':
      return typeof a === 'string' && typeof b === 'string'
        ? a <= b
        : Number(a) <= Number(b)
    case '>':
      return typeof a === 'string' && typeof b === 'string'
        ? a > b
        : Number(a) > Number(b)
    case '>=':
      return typeof a === 'string' && typeof b === 'string'
        ? a >= b
        : Number(a) >= Number(b)
    case '==':
      return a == b
    case '!=':
      return a != b
    default:
      return assertNever(operator)
  }
}
