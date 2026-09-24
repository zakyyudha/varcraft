import type { Expression, Program } from './ast'
import { limit } from './limits'
import { parseArrayLiteral, parsePostfix } from './parser-postfix'
import { identifier, isBinary, PRECEDENCE } from './parser-support'
import { ExpressionSyntaxError, type Token, tokenize } from './tokenizer'

class Parser {
  private cursor = 0
  private nodes = 0
  private depth = 0

  constructor(private readonly tokens: readonly Token[]) {}

  parse(): Program {
    if (
      this.current().kind === 'identifier' &&
      this.tokens[1]?.kind === 'symbol' &&
      this.tokens[1].value === '='
    ) {
      const first = this.current()
      const name = identifier(first)
      if (name === 'set' || name === 'get' || name === 'clear')
        throw new ExpressionSyntaxError(
          'Reserved assignment name',
          first.offset,
        )
      const offset = first.offset
      this.cursor = 2
      const value = this.expression(0)
      this.expectEnd()
      return { kind: 'assignment', name, value, offset }
    }
    const expression = this.expression(0)
    this.expectEnd()
    return expression
  }

  private infix(minimum: number): Expression {
    let left = this.prefix()
    left = parsePostfix(this, left)
    while (true) {
      const token = this.current()
      if (token.kind !== 'symbol') return left
      if (token.value === '?' && minimum <= 0) {
        this.cursor += 1
        const consequent = this.expression(0)
        this.expectSymbol(':')
        const alternate = this.expression(0)
        left = this.node({
          kind: 'conditional',
          condition: left,
          consequent,
          alternate,
          offset: token.offset,
          height:
            Math.max(left.height, consequent.height, alternate.height) + 1,
        })
        continue
      }
      const operator = String(token.value)
      const precedence = PRECEDENCE[operator]
      if (
        precedence === undefined ||
        precedence < minimum ||
        !isBinary(operator)
      )
        return left
      this.cursor += 1
      const right = this.expression(precedence + 1)
      left = this.node({
        kind: 'binary',
        operator,
        left,
        right,
        offset: token.offset,
        height: Math.max(left.height, right.height) + 1,
      })
    }
  }

  private prefix(): Expression {
    const token = this.current()
    if (token.kind === 'number' || token.kind === 'string') {
      this.cursor += 1
      return this.node({
        kind: 'literal',
        value: token.value,
        offset: token.offset,
        height: 1,
      })
    }
    if (token.kind === 'identifier') {
      this.cursor += 1
      const name = String(token.value)
      if (
        name === 'true' ||
        name === 'false' ||
        name === 'null' ||
        name === 'undefined'
      ) {
        const value =
          name === 'null'
            ? null
            : name === 'undefined'
              ? undefined
              : name === 'true'
        return this.node({
          kind: 'literal',
          value,
          offset: token.offset,
          height: 1,
        })
      }
      return this.node({
        kind: 'identifier',
        name: identifier(token),
        offset: token.offset,
        height: 1,
      })
    }
    const operator = token.value
    if (operator === '!' || operator === '+' || operator === '-') {
      this.cursor += 1
      const operand = this.expression(7)
      return this.node({
        kind: 'unary',
        operator,
        operand,
        offset: token.offset,
        height: operand.height + 1,
      })
    }
    if (token.value === '(') {
      this.cursor += 1
      const expression = this.expression(0)
      this.expectSymbol(')')
      return expression
    }
    if (token.kind === 'symbol' && token.value === '[')
      return parseArrayLiteral(this)
    throw new ExpressionSyntaxError('Expected expression', token.offset)
  }

  readonly advance = (): void => {
    this.cursor += 1
  }

  readonly expression = (minimum: number): Expression =>
    this.parseExpression(minimum)

  readonly node = <T extends Expression>(expression: T): T =>
    this.createNode(expression)

  readonly current = (): Token => this.tokens[this.cursor]

  readonly consume = (value: string): Token => {
    const token = this.current()
    this.expectSymbol(value)
    return token
  }

  readonly expectSymbol = (value: string): void => {
    const token = this.current()
    if (token.kind !== 'symbol' || token.value !== value)
      throw new ExpressionSyntaxError(`Expected ${value}`, token.offset)
    this.cursor += 1
  }

  readonly identifier = (token: Token): string => identifier(token)

  private parseExpression(minimum: number): Expression {
    limit('depth', ++this.depth)
    try {
      return this.infix(minimum)
    } finally {
      this.depth -= 1
    }
  }

  private createNode<T extends Expression>(expression: T): T {
    this.nodes += 1
    limit('nodes', this.nodes)
    limit('depth', expression.height)
    return expression
  }

  private expectEnd(): void {
    const token = this.current()
    if (token.kind !== 'eof')
      throw new ExpressionSyntaxError('Expected end of input', token.offset)
  }
}

export function parse(source: string): Program {
  return new Parser(tokenize(source)).parse()
}
