import { VarCraft } from '../src/varcraft'

describe('VarCraft', () => {
  let varCraftInstance: VarCraft

  beforeEach(() => {
    varCraftInstance = new VarCraft({ builtins: true })
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

  it('should handle array access', () => {
    varCraftInstance.set('arr', [1, 2, 3])
    expect(varCraftInstance.get('arr')).toEqual([1, 2, 3])
    expect(varCraftInstance.parseExpression('arr[0]')).toEqual(1)
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

  it('should handle nested value access', () => {
    varCraftInstance.set('a', { b: { c: 1 } })
    expect(varCraftInstance.get('a')).toEqual({ b: { c: 1 } })
    expect(varCraftInstance.parseExpression('a.b.c')).toEqual(1)
  })

  it('should handle nested variable arithmetics', () => {
    varCraftInstance.set('a', { b: { c: 1 } })
    expect(varCraftInstance.get('a')).toEqual({ b: { c: 1 } })
    expect(varCraftInstance.parseExpression('a.b.c + 1')).toEqual(2)
  })

  it('should handle nested product filtering and reduction', () => {
    const products = [
      { name: 'Partner', serviceUsage: { value: 'Layanan Mitra' }, price: 100 },
      { name: 'Telkom', serviceUsage: { value: 'Layanan Telkom' }, price: 250 },
      { name: 'Small', serviceUsage: { value: 'Layanan Mitra' }, price: 50 },
    ]

    expect(
      varCraftInstance.parseExpression(
        '_filter(products, "_item_.serviceUsage.value == \'Layanan Mitra\' && _item_.price >= 100")',
        { products },
      ),
    ).toEqual([products[0]])

    expect(
      varCraftInstance.parseExpression(
        '_reduce(products, "_accumulator_ + _item_.price", 0)',
        { products },
      ),
    ).toEqual(400)
  })

  it('should handle nested array access and conditional selection', () => {
    varCraftInstance.set('project', {
      assessments: [
        { status: 'draft', score: 40 },
        { status: 'approved', score: 95 },
      ],
    })

    expect(
      varCraftInstance.parseExpression(
        'project.assessments[1].status === "approved" ? project.assessments[1].score : 0',
      ),
    ).toEqual(95)
  })

  it('should handle helper composition with array access', () => {
    varCraftInstance.set('rows', [{ values: [10, 20] }, { values: [30, 40] }])

    expect(
      varCraftInstance.parseExpression(
        '_sum([rows[0].values[1], rows[1].values[0]])',
      ),
    ).toEqual(50)
  })

  it('should handle filter then reduce for buying totals', () => {
    const products = [
      { category: 'partner', total: 100 },
      { category: 'telkom', total: 250 },
      { category: 'partner', total: 50 },
    ]

    expect(
      varCraftInstance.parseExpression(
        `_reduce(_filter(products, "_item_.category === 'partner'"), "_accumulator_ + _item_.total", 0)`,
        { products },
      ),
    ).toEqual(150)
  })

  it('should handle mapping nested array values', () => {
    const rows = [{ values: [10, 20] }, { values: [30, 40] }]

    expect(
      varCraftInstance.parseExpression('_map(rows, "_item_.values[1]")', {
        rows,
      }),
    ).toEqual([20, 40])
  })

  it('should persist assignment for later complex expressions', () => {
    const products = [{ total: 100 }, { total: 250 }]

    expect(
      varCraftInstance.parseExpression(
        'total = _reduce(products, "_accumulator_ + _item_.total", 0)',
        { products },
      ),
    ).toEqual(350)
    expect(
      varCraftInstance.parseExpression('total > 300 ? "high" : "normal"'),
    ).toBe('high')
  })

  it('should handle switch values from nested project data', () => {
    const project = {
      status: 'approved',
      approvals: [{ members: [{ name: 'Ari' }] }],
    }

    varCraftInstance.set('project', project)
    expect(
      varCraftInstance.parseExpression(
        `_switch('"approved"', '"approved"', 'project.approvals[0].members[0].name', '"other"')`,
      ),
    ).toBe('Ari')
  })

  it('should handle a complete pricing pipeline', () => {
    const products = [
      {
        name: 'Partner A',
        category: 'partner',
        quantity: 2,
        unitPrice: 100,
        active: true,
        serviceUsage: { value: 'Layanan Mitra' },
      },
      {
        name: 'Telkom A',
        category: 'telkom',
        quantity: 3,
        unitPrice: 250,
        active: true,
        serviceUsage: { value: 'Layanan Telkom' },
      },
      {
        name: 'Partner B',
        category: 'partner',
        quantity: 5,
        unitPrice: 50,
        active: false,
        serviceUsage: { value: 'Layanan Mitra' },
      },
    ]

    expect(
      varCraftInstance.parseExpression(
        '_map(products, "_item_.quantity * _item_.unitPrice")',
        { products },
      ),
    ).toEqual([200, 750, 250])

    expect(
      varCraftInstance.parseExpression(
        '_reduce(_filter(products, "_item_.active"), "_accumulator_ + (_item_.quantity * _item_.unitPrice)", 0)',
        { products },
      ),
    ).toEqual(950)

    expect(
      varCraftInstance.parseExpression(
        '_reduce(_filter(products, "_item_.serviceUsage.value === \'Layanan Mitra\'"), "_accumulator_ + (_item_.quantity * _item_.unitPrice)", 0)',
        { products },
      ),
    ).toEqual(450)
  })

  it('should preserve assignment and short-circuit decisions in pricing rules', () => {
    const products = [{ total: 100 }, { total: 250 }]
    varCraftInstance.set('products', products)

    expect(
      varCraftInstance.parseExpression(
        'activeTotal = _reduce(products, "_accumulator_ + _item_.total", 0)',
      ),
    ).toEqual(350)
    expect(
      varCraftInstance.parseExpression(
        'activeTotal > 300 ? "high-value" : "standard"',
      ),
    ).toBe('high-value')
    expect(varCraftInstance.parseExpression('false && missingPrice')).toBe(
      false,
    )
    expect(varCraftInstance.parseExpression('true || missingPrice')).toBe(true)
  })

  it('should handle null values', () => {
    const result = varCraftInstance.parseExpression('null')
    expect(result).toEqual(null)
  })

  it('should handle undefined values', () => {
    const result = varCraftInstance.parseExpression('undefined')
    expect(result).toEqual(undefined)
  })

  it('should handle boolean values', () => {
    const result = varCraftInstance.parseExpression('true && false')
    expect(result).toEqual(false)
  })

  it('should handle optional chaining', () => {
    const result = varCraftInstance.parseExpression('customer?.profile?.name', {
      customer: {
        profile: {
          name: 'Ari',
        },
      },
    })
    expect(result).toEqual('Ari')
    expect(
      varCraftInstance.parseExpression('customer?.missing?.name', {
        customer: {},
      }),
    ).toBeUndefined()
    expect(
      varCraftInstance.parseExpression('customer?.profile?.name', {
        customer: null,
      }),
    ).toBeUndefined()
    expect(
      varCraftInstance.parseExpression('items?.[0]?.name', {
        items: [{ name: 'Ari' }],
      }),
    ).toBe('Ari')
  })

  it('should handle buying unique partner names as a string', () => {
    varCraftInstance.setPredefinedVar('_arrUnique', (values: unknown[]) => [
      ...new Set(values),
    ])
    varCraftInstance.set('f3', {
      servicePlan: {
        products: [
          {
            serviceUsage: { value: 'Layanan Mitra' },
            partnerSugestion: { partnerName: 'Ari' },
          },
          {
            serviceUsage: { value: 'Layanan Telkom' },
            partnerSugestion: { partnerName: 'Telkom' },
          },
          {
            serviceUsage: { value: 'Layanan Mitra' },
            partnerSugestion: { partnerName: 'Bima' },
          },
          {
            serviceUsage: { value: 'Layanan Mitra' },
            partnerSugestion: { partnerSugestion: 'Bima' },
          },
        ],
      },
    })

    expect(
      varCraftInstance.parseExpression(
        `_arrUnique(_map(_filter(f3.servicePlan.products, '_item_.serviceUsage.value === "Layanan Mitra"'), '_item_?.partnerSugestion?.partnerName')).toString()`,
      ),
    ).toBe('Ari,Bima,')
  })

  it('should resolve member methods from registry', () => {
    varCraftInstance.setMemberMethod('upper', (target, args) => {
      if (args.length !== 0 || typeof target !== 'string')
        throw new TypeError('upper expects string target')
      return target.toUpperCase()
    })

    expect(varCraftInstance.parseExpression('"ari".upper()')).toBe('ARI')
    expect(() => varCraftInstance.parseExpression('"ari".missing()')).toThrow(
      'Denied operation: member method missing',
    )
    expect(() => varCraftInstance.parseExpression('"ari".upper("x")')).toThrow(
      'upper expects string target',
    )
  })
})
