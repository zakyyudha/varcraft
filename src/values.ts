import { limit } from './limits'

export type Primitive = number | string | boolean | null | undefined
export type Callback = (...args: unknown[]) => unknown
export type Value = Primitive | object | Callback

export class DeniedOperationError extends TypeError {
  readonly name = 'DeniedOperationError'
  constructor(readonly operation: string) {
    super(`Denied operation: ${operation}`)
  }
}

export class MissingNameError extends ReferenceError {
  readonly name = 'MissingNameError'
  constructor(readonly variable: string) {
    super(`Variable or function ${variable} not found`)
  }
}

const DANGEROUS_KEYS = new Set(['__proto__', 'prototype', 'constructor'])

export function safeKey(name: string): void {
  if (DANGEROUS_KEYS.has(name)) throw new DeniedOperationError(name)
}

export function valueFromHost(value: unknown): Value {
  if (
    value === null ||
    value === undefined ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'string' ||
    typeof value === 'object' ||
    typeof value === 'function'
  ) {
    if (typeof value === 'string') limit('string', value.length)
    if (Array.isArray(value)) limit('array', value.length)
    return value
  }
  throw new DeniedOperationError('unsupported host value')
}

export function primitive(value: Value): Primitive {
  if (
    value !== null &&
    (typeof value === 'object' || typeof value === 'function')
  )
    throw new DeniedOperationError('object coercion')
  return value
}

export function ownRead(target: Value, key: string): Value {
  safeKey(key)
  if (target === null || target === undefined)
    throw new DeniedOperationError('member read on null or undefined')
  const object: object = Object(target)
  if (!Object.prototype.hasOwnProperty.call(object, key)) return undefined
  return valueFromHost(Reflect.get(object, key))
}

export function expressionText(value: unknown): string {
  const text = String(primitive(valueFromHost(value)))
  limit('source', text.length)
  return text
}
