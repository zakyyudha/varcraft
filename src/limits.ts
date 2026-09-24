export const LIMITS = {
  source: 16384,
  tokens: 4096,
  depth: 64,
  nodes: 2048,
  args: 64,
  array: 1024,
  string: 16384,
  keys: 1024,
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

// Each host `evaluate`/`parseExpression` call opens one `Budget` for its whole
// synchronous tree: the parser/interpreter, every nested helper re-evaluation,
// array-spread/scope construction, and object snapshot all debit the SAME
// `work`/`evaluations`/`nesting` counters. The budget is discarded when the
// outermost call returns (success or throw), so no counter leaks into a later
// evaluation.
//
// SCOPE OF THE GUARANTEE: it bounds VarCraft's OWN interpreter/helper work. It
// does NOT bound the CPU a trusted host callback burns inside its own body — a
// registered callback can loop or allocate arbitrarily. Host callbacks also run
// unbudgeted when invoked directly off `get()` outside any `withBudget` scope
// (there, `spendWork` is a no-op). Treat registered callbacks as trusted
// capabilities, not as sandboxed work.

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
