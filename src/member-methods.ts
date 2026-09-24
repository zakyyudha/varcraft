import { limit } from './limits'
import { DeniedOperationError, ownRead, type Value } from './values'

export type MemberMethod = (target: Value, args: readonly Value[]) => Value

function isPrimitive(value: Value): boolean {
  return (
    value === null ||
    value === undefined ||
    (typeof value !== 'object' && typeof value !== 'function')
  )
}

/**
 * Serialize an array without touching overridable array methods such as
 * `join`/`toString`. Only own-index primitive/nullish elements are read;
 * nested non-primitives are denied. Nullish slots stay empty segments so the
 * output matches `Array.prototype.join(',')` for the supported inputs.
 */
function serializeArray(target: readonly unknown[]): string {
  limit('array', target.length)
  const parts: string[] = []
  for (let index = 0; index < target.length; index += 1) {
    const element = ownRead(target, String(index))
    if (element === null || element === undefined) {
      parts.push('')
      continue
    }
    if (typeof element === 'object' || typeof element === 'function')
      throw new DeniedOperationError('toString array element')
    parts.push(String(element))
  }
  const text = parts.join(',')
  limit('string', text.length)
  return text
}

export function defaultToString(target: Value, args: readonly Value[]): Value {
  if (args.length !== 0) throw new DeniedOperationError('toString arguments')
  if (Array.isArray(target)) return serializeArray(target)
  if (isPrimitive(target)) return String(target)
  throw new DeniedOperationError('toString target')
}
