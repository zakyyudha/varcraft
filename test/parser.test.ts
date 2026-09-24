import { parse } from '../src/parser'
import { ExpressionSyntaxError } from '../src/tokenizer'

describe('parser language boundary', () => {
  it('parses a complete expression and rejects trailing tokens', () => {
    expect(parse('1 + 2')).toMatchObject({ kind: 'binary', operator: '+' })
    expect(() => parse('1 "" + 2')).toThrow(ExpressionSyntaxError)
  })

  it('parses quoted delimiters as literal values in arrays and calls', () => {
    expect(parse('["", ")", "]"]')).toMatchObject({
      kind: 'array',
      elements: [
        { kind: 'literal', value: '' },
        { kind: 'literal', value: ')' },
        { kind: 'literal', value: ']' },
      ],
    })
    expect(parse('fn(")", "]")')).toMatchObject({
      kind: 'call',
      name: 'fn',
      args: [
        { kind: 'literal', value: ')' },
        { kind: 'literal', value: ']' },
      ],
    })
  })

  it('rejects malformed and unsupported assignments', () => {
    expect(() => parse('')).toThrow(ExpressionSyntaxError)
    expect(() => parse('1 = 2')).toThrow(ExpressionSyntaxError)
    expect(() => parse('set = 2')).toThrow(ExpressionSyntaxError)
    expect(() => parse('true = 2')).toThrow(ExpressionSyntaxError)
  })

  it('preserves precedence and left associativity', () => {
    expect(parse('1 + 2 * 3')).toMatchObject({
      kind: 'binary',
      operator: '+',
      right: { kind: 'binary', operator: '*' },
    })
    expect(parse('8 - 3 - 1')).toMatchObject({
      kind: 'binary',
      operator: '-',
      left: { kind: 'binary', operator: '-' },
    })
  })

  it('centralizes reserved identifier policy across expressions and member names', () => {
    for (const source of [
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
      'undefined',
    ]) {
      if (
        source === 'true' ||
        source === 'false' ||
        source === 'null' ||
        source === 'undefined'
      )
        continue
      expect(() => parse(source)).toThrow(ExpressionSyntaxError)
    }
    expect(() => parse('value.undefined')).toThrow(ExpressionSyntaxError)
  })
})
