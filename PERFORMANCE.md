# Performance

This document records measured performance decisions for VarCraft's expression
engine. Numbers in this file are produced by the checked-in benchmark and are
evidence, not targets or promises.

## Nested helper parsing (`_map` / `_filter` / `_reduce`) — no optimization

**Decision (plan task 12): keep the current parse-per-iteration behavior. Do not
add a parse-once-per-invocation AST reuse, and do not add a global AST cache.**

`_map` / `_filter` / `_reduce` currently call `engine.parseExpression(body, scope)`
once per array item, so the nested body string is tokenized and parsed again for
every item. The 2.0 refactor plan deferred this optimization pending measurement.
It was measured; the evidence says the parse is not the
dominant cost and the optimization cannot pay for its behavioral surface.

### Threshold

Optimize only if the nested parse is a **material and growing** share of helper
time. Measured evidence does not meet that bar:

- the parse term is **size-independent** (a flat ~2–3.5 µs/item regardless of
  array length), while every other per-item term grows with the array;
- at realistic helper sizes (tens of items, and the buying corpus uses 4) any
  parse-once saving is bounded by the parse-only total, which is **well under
  0.1 ms per helper invocation** at ≤ 24 items and ~0.22 ms at 100 items;
- the parse share **shrinks** as arrays grow (≈31 % at 24 items → ≈13 % at 64 →
  ≈5 % at 100), so the workload that would benefit most is the one the engine
  already bounds hardest.

### Measurement

Command (run after `pnpm run build`; `BENCH_N` sets the item count):

```bash
node bench/nested-parse-bench.mjs            # N=24
BENCH_N=100 node bench/nested-parse-bench.mjs
```

Medians of 25 runs on Node v22.22.0. Per-item figures are in microseconds.

| Phase (per item) | N=24 | N=64 | N=100 | grows with N? |
| --- | ---: | ---: | ---: | :---: |
| `parse()` body only | 3.50 | 3.07 | 2.24 | no |
| full `parseExpression` per item | 7.43 | 7.92 | 10.36 | yes |
| env snapshot (`n+3`-key scope) + merge | 4.20 | 6.20 | 9.11 | yes |
| `{...values}` nestedScope spread | 2.55 | 7.24 | 11.11 | yes |
| **helper `_map` (total per item)** | 11.33 | 23.73 | 42.68 | yes |
| **parse share of `_map` total** | **30.9 %** | **12.9 %** | **5.2 %** | shrinking |

Whole-invocation totals (median ms): `_map` 0.27 / 1.52 / 4.27; `_filter`
0.28 / 1.44 / 3.56; `_reduce` 0.21 / 1.06 / 2.29 for N = 24 / 64 / 100.

Raw reports: `.omo/evidence/varcraft-implementation-audit/task-12/bench-n{24,64,100}.json`.

### Why parse-once does not pay

1. **Parse is the smallest, non-scaling term.** The dominant per-item costs are
   environment construction — snapshotting the nested scope (which exposes one
   key per array index, so it is O(n) per item and O(n²) per invocation) and the
   `{...values}` array spread — both unchanged by reusing an AST. Parse-once
   could shave at most the ~5 % parse share at 100 items.
2. **Absolute gain is negligible.** At the corpus scale (the production
   partner-name pipeline filters 4 products) the entire nested helper is already
   sub-millisecond; the parse-only total is measured in tens of microseconds.
3. **Behavioral surface is not free.** Reusing an AST requires threading a
   pre-parsed program through evaluation (a new internal path) or caching the
   first parsed AST on the helper, while still re-entering `withBudget` per item
   so `evaluations` / `nesting` / `work` charges are byte-identical to today.
   `nodes` / `depth` are per-parse limits, so reuse would also change when those
   limits are re-checked. That is real risk for a sub-10 % win on a bounded
   workload.
4. **The task-11 budget already bounds the interesting region.** `work` rejects
   `_map` / `_filter` / `_reduce` around 177 elements, so the largest arrays
   never reach the point where the parse share is meaningful.

### Preserved behavior (if this is ever revisited)

- **Empty arrays never parse the body.** `_map([], "definitely not valid (")`
  returns `[]` today because the body string is only parsed inside the per-item
  callback. Any future parse-once must parse lazily on the **first** iteration
  (not eagerly on entry) to keep this timing, or the change must be documented as
  an intentional error-timing change. Confirmed by the benchmark
  (`emptyArrayInvalidBodyOutcome: "accepted:[]"`).
- Per-iteration context rebuild, `{...values}` spread, shallow aliasing, budget
  accounting, and lookup timing must all stay identical.
- No global/process-wide AST cache: the refactor plan deferred it pending a
  measured need, and none was found.

### What would change the decision

A workload where nested bodies are large/complex enough that parse dominates
(same array length, much larger body), or a raised/removed `work` bound that lets
helper arrays grow well past a few hundred elements, would move the parse share
back up. Re-measure with `bench/nested-parse-bench.mjs` before acting.
