import { default as varCraftInstance } from '../src'

describe('VarCraft', () => {
  afterEach(() => {
    varCraftInstance.clear()
  })

  it('should handle variable string', () => {
    const result = varCraftInstance.parseExpression('"hello"')
    expect(result).toEqual('hello')
  })

  it('should set and get a variable', () => {
    varCraftInstance.set('x', 42)
    expect(varCraftInstance.get('x')).toEqual(42)
  })

  it('should handle variable clearing', () => {
    varCraftInstance.set('y', 'hello')
    varCraftInstance.clear()
    expect(() => varCraftInstance.get('y')).toThrowError(
      'Variable or function y not found',
    )
  })

  it('should evaluate expressions correctly', () => {
    varCraftInstance.set('a', 10)
    varCraftInstance.set('b', 20)

    const result = varCraftInstance.parseExpression('a + b')
    expect(result).toEqual(30)
  })

  it('should handle predefined sum function', () => {
    const result = varCraftInstance.parseExpression('_sum(arr)', {
      arr: [1, 2, 3],
    })
    expect(result).toEqual(6)
  })

  it('should handle predefined map function', () => {
    const result = varCraftInstance.parseExpression(
      '_map([1, 2, 3], "_item_ + 1")',
    )
    expect(result).toEqual([2, 3, 4])
  })

  it('should handle predefined filter function', () => {
    const result = varCraftInstance.parseExpression(
      '_filter([1, 2, 3], "_item_ > 1")',
    )
    expect(result).toEqual([2, 3])
  })

  it('should handle predefined reduce function', () => {
    const result = varCraftInstance.parseExpression(
      '_reduce([1, 2, 3], "_accumulator_ + _item_", 0)',
    )
    expect(result).toEqual(6)
  })

  it('should handle predefined chunk function', () => {
    const result = varCraftInstance.parseExpression(
      '_chunk([1, 2, 3, 4, 5], 2)',
    )
    expect(result).toEqual([[1, 2], [3, 4], [5]])
  })

  it('should handle predefined includes function', () => {
    const result = varCraftInstance.parseExpression('_includes(arr, 2)', {
      arr: [1, 2, 3],
    })
    expect(result).toEqual(true)
  })

  it('should handle ternary option', () => {
    const result = varCraftInstance.parseExpression('(x > y) ? true : false', {
      x: 10,
      y: 5,
    })
    expect(result).toEqual(true)
  })

  it('should handle predefined if function', () => {
    const result = varCraftInstance.parseExpression('_if(x > y, true, false)', {
      x: 10,
      y: 5,
    })
    expect(result).toEqual(true)
  })

  it('should handle predefined switch function', () => {
    const result = varCraftInstance.parseExpression(
      '_switch(x, 1, data.y, 2, \'"two"\' ,\'"other"\')',
      {
        x: 1,
        data: {
          y: 1,
        },
      },
    )
    expect(result).toEqual(1)
  })
})
