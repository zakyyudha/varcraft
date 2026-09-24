import type { Expression, Program } from './ast'
import { limit } from './limits'
import { ExpressionSyntaxError, tokenize, type Token } from './tokenizer'
import { identifier, isBinary, PRECEDENCE } from './parser-support'

class Parser {
  private cursor = 0
  private nodes = 0
  private depth = 0

  constructor(private readonly tokens: readonly Token[]) {}

  parse(): Program {
    if (this.current().kind === 'identifier' && this.tokens[1]?.value === '=') {
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
      this.expect('')
      return { kind: 'assignment', name, value, offset }
    }
    const expression = this.expression(0)
    this.expect('')
    return expression
  }

  private expression(minimum: number): Expression {
    limit('depth', ++this.depth)
    try {
      return this.infix(minimum)
    } finally {
      this.depth -= 1
    }
  }

  private infix(minimum: number): Expression {
    let left = this.prefix()
    left = this.postfix(left)
    while (true) {
      const token = this.current()
      if (token.kind !== 'symbol') return left
      if (token.value === '?' && minimum <= 0) {
        this.cursor += 1
        const consequent = this.expression(0)
        this.expect(':')
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
      this.expect(')')
      return expression
    }
    if (token.value === '[') return this.array()
    throw new ExpressionSyntaxError('Expected expression', token.offset)
  }

  private postfix(initial: Expression): Expression {
    let expression = initial
    while (true) {
      const token = this.current()
      if (token.value === '.') {
        this.cursor += 1
        const key = this.current()
        if (key.kind !== 'identifier')
          throw new ExpressionSyntaxError('Expected member name', key.offset)
        this.cursor += 1
        expression = this.node({
          kind: 'member',
          target: expression,
          key: identifier(key),
          offset: token.offset,
          height: expression.height + 1,
        })
        continue
      }
      if (token.value === '?.') {
        this.cursor += 1
        if (this.current().value === '[') {
          this.cursor += 1
          const key = this.expression(0)
          this.expect(']')
          expression = this.node({
            kind: 'optional-member',
            target: expression,
            key,
            computed: true,
            offset: token.offset,
            height: Math.max(expression.height, key.height) + 1,
          })
        } else {
          const key = this.current()
          if (key.kind !== 'identifier')
            throw new ExpressionSyntaxError(
              'Expected optional member name',
              key.offset,
            )
          this.cursor += 1
          expression = this.node({
            kind: 'optional-member',
            target: expression,
            key: identifier(key),
            computed: false,
            offset: token.offset,
            height: expression.height + 1,
          })
        }
        continue
      }
      if (token.value === '[') {
        this.cursor += 1
        const key = this.expression(0)
        this.expect(']')
        expression = this.node({
          kind: 'computed-member',
          target: expression,
          key,
          offset: token.offset,
          height: Math.max(expression.height, key.height) + 1,
        })
        continue
      }
      if (token.value === '(') {
        if (expression.kind === 'member') {
          const call = this.callArguments()
          expression = this.node({
            kind: 'method-call',
            target: expression.target,
            name: expression.key,
            args: call.args,
            offset: call.offset,
            height: Math.max(expression.height, call.height) + 1,
          })
          continue
        }
        if (expression.kind !== 'identifier')
          throw new ExpressionSyntaxError(
            'Member and result calls are denied',
            token.offset,
          )
        expression = this.call(expression)
        continue
      }
      return expression
    }
  }

  private array(): Expression {
    const start = this.consume('[')
    const elements: Expression[] = []
    while (this.current().value !== ']') {
      if (elements.length > 0) this.expect(',')
      elements.push(this.expression(0))
      limit('array', elements.length)
    }
    this.cursor += 1
    return this.node({
      kind: 'array',
      elements,
      offset: start.offset,
      height: Math.max(0, ...elements.map((element) => element.height)) + 1,
    })
  }

  private call(
    callee: Extract<Expression, { readonly kind: 'identifier' }>,
  ): Expression {
    const call = this.callArguments()
    return this.node({
      kind: 'call',
      name: callee.name,
      args: call.args,
      offset: call.offset,
      height: Math.max(callee.height, call.height) + 1,
    })
  }

  private callArguments(): {
    args: Expression[]
    offset: number
    height: number
  } {
    const start = this.consume('(')
    const args: Expression[] = []
    while (this.current().value !== ')') {
      if (args.length > 0) this.expect(',')
      args.push(this.expression(0))
      limit('args', args.length)
    }
    this.cursor += 1
    return {
      args,
      offset: start.offset,
      height: Math.max(0, ...args.map((argument) => argument.height)) + 1,
    }
  }

  private node<T extends Expression>(expression: T): T {
    this.nodes += 1
    limit('nodes', this.nodes)
    limit('depth', expression.height)
    return expression
  }

  private consume(value: string): Token {
    const token = this.current()
    this.expect(value)
    return token
  }

  private expect(value: string): void {
    const token = this.current()
    if (token.value !== value)
      throw new ExpressionSyntaxError(
        `Expected ${value || 'end of input'}`,
        token.offset,
      )
    this.cursor += 1
  }

  private current(): Token {
    return this.tokens[this.cursor]
  }
}

export function parse(source: string): Program {
  return new Parser(tokenize(source)).parse()
}
