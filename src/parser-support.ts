import type { BinaryOperator } from './ast'
import { ExpressionSyntaxError, type Token } from './tokenizer'
import { safeKey } from './values'

export const PRECEDENCE: Readonly<Record<string, number>> = {
  '||': 1,
  '&&': 2,
  '==': 3,
  '!=': 3,
  '===': 3,
  '!==': 3,
  '<': 4,
  '<=': 4,
  '>': 4,
  '>=': 4,
  '+': 5,
  '-': 5,
  '*': 6,
  '/': 6,
  '%': 6,
}

const BINARY = new Set(Object.keys(PRECEDENCE))
const RESERVED = new Set([
  'this',
  'new',
  'delete',
  'typeof',
  'void',
  'instanceof',
  'in',
  'await',
  'yield',
  'function',
  'class',
  'return',
  'let',
  'const',
  'var',
  'throw',
  'if',
  'else',
  'true',
  'false',
  'null',
])

export function isBinary(value: string): value is BinaryOperator {
  return BINARY.has(value)
}

export function identifier(token: Token): string {
  const name = String(token.value)
  safeKey(name)
  if (RESERVED.has(name))
    throw new ExpressionSyntaxError('Reserved identifier', token.offset)
  return name
}
