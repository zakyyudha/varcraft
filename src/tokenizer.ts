import { limit } from './limits'

const SYMBOLS = [
  '===',
  '!==',
  '?.',
  '==',
  '!=',
  '<=',
  '>=',
  '&&',
  '||',
  '+',
  '-',
  '*',
  '/',
  '%',
  '<',
  '>',
  '!',
  '=',
  '(',
  ')',
  '[',
  ']',
  ',',
  '.',
  '?',
  ':',
] as const

export type TokenKind = 'number' | 'string' | 'identifier' | 'symbol' | 'eof'

export type Token = {
  readonly kind: TokenKind
  readonly value: string | number
  readonly offset: number
}

export class ExpressionSyntaxError extends SyntaxError {
  readonly name = 'ExpressionSyntaxError'
  constructor(
    message: string,
    readonly offset: number,
  ) {
    super(`${message} at offset ${offset}`)
  }
}

function isDigit(char: string | undefined): boolean {
  return char !== undefined && char >= '0' && char <= '9'
}

function isIdentifierStart(char: string | undefined): boolean {
  return (
    char !== undefined &&
    ((char >= 'a' && char <= 'z') ||
      (char >= 'A' && char <= 'Z') ||
      char === '_' ||
      char === '$')
  )
}

function isIdentifierPart(char: string | undefined): boolean {
  return isIdentifierStart(char) || isDigit(char)
}

function decodeEscape(char: string, offset: number): string {
  switch (char) {
    case '"':
    case "'":
    case '\\':
      return char
    case 'b':
      return '\b'
    case 'f':
      return '\f'
    case 'n':
      return '\n'
    case 'r':
      return '\r'
    case 't':
      return '\t'
    case 'v':
      return '\v'
    default:
      throw new ExpressionSyntaxError('Invalid string escape', offset)
  }
}

export function tokenize(source: string): readonly Token[] {
  limit('source', source.length)
  const tokens: Token[] = []
  let offset = 0
  const add = (token: Token): void => {
    tokens.push(token)
    limit('tokens', tokens.length)
  }

  while (offset < source.length) {
    const char = source[offset]
    if (char === undefined) break
    if (/\s/.test(char)) {
      offset += 1
      continue
    }

    const start = offset
    if (isDigit(char)) {
      offset += 1
      while (isDigit(source[offset])) offset += 1
      if (source[offset] === '.') {
        offset += 1
        if (!isDigit(source[offset]))
          throw new ExpressionSyntaxError('Expected decimal digit', offset)
        while (isDigit(source[offset])) offset += 1
      }
      const raw = source.slice(start, offset)
      const value = Number(raw)
      if (!Number.isFinite(value))
        throw new ExpressionSyntaxError('Numeric literal must be finite', start)
      add({ kind: 'number', value, offset: start })
      continue
    }

    if (isIdentifierStart(char)) {
      offset += 1
      while (isIdentifierPart(source[offset])) offset += 1
      add({
        kind: 'identifier',
        value: source.slice(start, offset),
        offset: start,
      })
      continue
    }

    if (char === '"' || char === "'") {
      const quote = char
      let value = ''
      offset += 1
      while (offset < source.length && source[offset] !== quote) {
        const current = source[offset]
        if (current === undefined || current === '\n' || current === '\r')
          throw new ExpressionSyntaxError('Unterminated string', start)
        if (current === '\\') {
          offset += 1
          const escaped = source[offset]
          if (escaped === undefined)
            throw new ExpressionSyntaxError('Unterminated string', start)
          value += decodeEscape(escaped, offset)
        } else {
          value += current
        }
        offset += 1
        limit('string', value.length)
      }
      if (source[offset] !== quote)
        throw new ExpressionSyntaxError('Unterminated string', start)
      offset += 1
      add({ kind: 'string', value, offset: start })
      continue
    }

    const symbol = SYMBOLS.find((candidate) =>
      source.startsWith(candidate, offset),
    )
    if (symbol === undefined)
      throw new ExpressionSyntaxError(`Unsupported character ${char}`, offset)
    offset += symbol.length
    add({ kind: 'symbol', value: symbol, offset: start })
  }

  add({ kind: 'eof', value: '', offset })
  return tokens
}
