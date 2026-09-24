import { ExpressionSyntaxError, tokenize } from '../src/tokenizer'

describe('tokenizer language boundary', () => {
  it('emits a distinct EOF token for empty input', () => {
    expect(tokenize('')).toEqual([{ kind: 'eof', value: '', offset: 0 }])
  })

  it('keeps empty strings and delimiter strings as string tokens', () => {
    expect(tokenize('["", ")", "]", "(", "]"]')).toEqual([
      { kind: 'symbol', value: '[', offset: 0 },
      { kind: 'string', value: '', offset: 1 },
      { kind: 'symbol', value: ',', offset: 3 },
      { kind: 'string', value: ')', offset: 5 },
      { kind: 'symbol', value: ',', offset: 8 },
      { kind: 'string', value: ']', offset: 10 },
      { kind: 'symbol', value: ',', offset: 13 },
      { kind: 'string', value: '(', offset: 15 },
      { kind: 'symbol', value: ',', offset: 18 },
      { kind: 'string', value: ']', offset: 20 },
      { kind: 'symbol', value: ']', offset: 23 },
      { kind: 'eof', value: '', offset: 24 },
    ])
  })

  it('decodes supported escapes and rejects unsupported escapes', () => {
    expect(tokenize(String.raw`"\n\t\\\"\'\b\f\r\v"`)[0]).toEqual({
      kind: 'string',
      value: '\n\t\\"\'\b\f\r\v',
      offset: 0,
    })
    expect(() => tokenize(String.raw`"\x"`)).toThrow(ExpressionSyntaxError)
  })

  it('rejects malformed strings and unsupported characters', () => {
    expect(() => tokenize('"unterminated')).toThrow(ExpressionSyntaxError)
    expect(() => tokenize('@')).toThrow(ExpressionSyntaxError)
  })

  it('accepts finite decimal literals and rejects non-finite numeric literals', () => {
    expect(tokenize('12.5')[0]).toEqual({
      kind: 'number',
      value: 12.5,
      offset: 0,
    })
    expect(() => tokenize('9'.repeat(400))).toThrow(ExpressionSyntaxError)
  })
})
