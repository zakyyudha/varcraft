import { DeniedOperationError, type Value } from './values'

export type MemberMethod = (target: Value, args: readonly Value[]) => Value

export function defaultToString(target: Value, args: readonly Value[]): Value {
  if (args.length !== 0) throw new DeniedOperationError('toString arguments')
  if (
    target === null ||
    (typeof target !== 'object' &&
      typeof target !== 'string' &&
      typeof target !== 'number' &&
      typeof target !== 'boolean')
  )
    throw new DeniedOperationError('toString target')
  return Array.isArray(target) ? target.join(',') : String(target)
}
