export const LIMITS = {
  source: 16384,
  tokens: 4096,
  depth: 64,
  nodes: 2048,
  args: 64,
  array: 1024,
  string: 16384,
  evaluations: 2048,
  nesting: 32,
  work: 100000,
} as const

type Resource = keyof typeof LIMITS

export class LimitError extends RangeError {
  readonly name = 'LimitError'
  constructor(readonly resource: Resource) {
    super(`Expression limit exceeded: ${resource}`)
  }
}

export function limit(resource: Resource, count: number): void {
  if (count > LIMITS[resource]) throw new LimitError(resource)
}

/** Mutable counters shared by all synchronous nested evaluations and helpers. */
export class Budget {
  private work = 0
  private evaluations = 0
  private nesting = 0

  spend(amount = 1): void {
    this.work += amount
    limit('work', this.work)
  }

  enter(): void {
    this.evaluations += 1
    limit('evaluations', this.evaluations)
    limit('nesting', this.nesting + 1)
    this.nesting += 1
  }

  leave(): void {
    this.nesting -= 1
  }
}

// Synchronous scope also covers callbacks re-entering a different instance.
let active: Budget | undefined

export function withBudget<T>(action: (budget: Budget) => T): T {
  const parent = active
  const budget = parent ?? new Budget()
  budget.enter()
  active = budget
  try {
    return action(budget)
  } finally {
    budget.leave()
    active = parent
  }
}

export function spendWork(amount = 1): void {
  active?.spend(amount)
}
