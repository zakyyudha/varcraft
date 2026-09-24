// Task 12 (M6 follow-up): measure repeated nested parsing in _map/_filter/_reduce.
//
// Run against the built package:  node bench/nested-parse-bench.mjs
// Prints a JSON report to stdout and the human table to stderr.
//
// The goal is to attribute nested-helper time to its phases so the parse-once
// optimization can be accepted or rejected on evidence:
//   parse            -> tokenize + Pratt parse of the body string, per item today
//   full per-item    -> parse + data/stored/predefined snapshots + merge + interpret
//   helper iteration -> the real `_map`/`_filter`/`_reduce` invocation (adds the
//                       per-item nestedScope array spread)
//   result conversion-> the host-array -> Value conversion path (e.g. .toString())
import { performance } from 'node:perf_hooks'
import { parse } from '../dist/parser.js'
import { VarCraft } from '../dist/varcraft.js'

const FILTER_BODY = '_item_.serviceUsage.value === "Layanan Mitra"'
const MAP_BODY = '_item_?.partnerSugestion?.partnerName'
const REDUCE_BODY = '_accumulator_ + _item_.price * rate'
const TRIVIAL_BODY = '1'

const N = Number(process.env.BENCH_N ?? 24)
const RUNS = Number(process.env.BENCH_RUNS ?? 25)

function makeProducts(n) {
  return Array.from({ length: n }, (_, i) => ({
    serviceUsage: { value: i % 3 === 0 ? 'Layanan Telkom' : 'Layanan Mitra' },
    partnerSugestion: { partnerName: i % 4 === 0 ? undefined : `P${i}` },
    price: 100 + i,
  }))
}

function makeEngine() {
  return new VarCraft({ builtins: true })
}

const results = {}
function median(xs) {
  const s = [...xs].sort((a, b) => a - b)
  const m = s.length >> 1
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}
function bench(label, fn, runs = RUNS) {
  for (let i = 0; i < Math.max(8, runs >> 1); i++) fn()
  const samples = []
  for (let i = 0; i < runs; i++) {
    const t = performance.now()
    fn()
    samples.push(performance.now() - t)
  }
  results[label] = {
    medianMs: Number(median(samples).toFixed(4)),
    minMs: Number(Math.min(...samples).toFixed(4)),
    maxMs: Number(Math.max(...samples).toFixed(4)),
  }
  return results[label].medianMs
}

/* ----------------------------------------------------------- correctness pin */
const products = makeProducts(N)
const engine = makeEngine()
engine.set('products', products)
engine.set('rate', 2)
const mapped = engine.evaluate(`_map(products, "${MAP_BODY}")`)
const filtered = engine.evaluate(`_filter(products, '${FILTER_BODY}')`)
const reduced = engine.evaluate(`_reduce(products, "${REDUCE_BODY}", 0)`)
const partner = engine.evaluate(
  `_map(_filter(products, '${FILTER_BODY}'), '${MAP_BODY}').toString()`,
)
const correctness = {
  n: N,
  mapLength: mapped.length,
  filterLength: filtered.length,
  reduced,
  partner,
  mapStable: JSON.stringify(engine.evaluate(`_map(products, "${MAP_BODY}")`)) === JSON.stringify(mapped),
}

/* ------------------------------------------------------------- phase probes */

// (1) parse only: the lexical+Pratt cost of the body string, once per item.
bench('parse_only_mapBody_xN', () => {
  for (let i = 0; i < N; i++) parse(MAP_BODY)
})

// (2) full per-item path as _map executes it today: parse + snapshots + merge +
// interpret, driven through the public parseExpression using an item scope that
// mirrors nestedScope (array indices + _item_ + _index_).
const itemScopes = products.map((item, index) => ({
  ...products,
  _item_: item,
  _index_: index,
}))
bench('parseExpression_mapBody_perItem_xN', () => {
  for (let i = 0; i < N; i++) engine.parseExpression(MAP_BODY, itemScopes[i])
})

// (3) snapshot-only floor: snapshot of the stored+predefined layers with a
// trivial body (parse is ~free here, so this isolates snapshot + merge).
bench('parseExpression_trivial_noData_xN', () => {
  for (let i = 0; i < N; i++) engine.parseExpression(TRIVIAL_BODY)
})

// (3b) environment snapshot cost when the data scope carries N+3 keys, which is
// exactly what nestedScope hands each nested evaluation. Body is trivial, so
// this isolates snapshot(data)+merge scaling from parse/interpret.
bench('snapshot_nPlus3Keys_trivial_xN', () => {
  for (let i = 0; i < N; i++) engine.parseExpression(TRIVIAL_BODY, itemScopes[i])
})

// (3c) pure JS nestedScope construction cost: the per-item full-array spread the
// helper performs before it even calls parseExpression.
bench('nestedScopeSpread_xN', () => {
  for (let i = 0; i < N; i++) {
    const scope = { ...products, _item_: products[i], _index_: i }
    if (scope._index_ < 0) throw new Error('unreachable')
  }
})

// (4) real helper invocations (one call each; per-item = value / N).
for (const [name, body] of [
  ['map', MAP_BODY],
  ['filter', FILTER_BODY],
]) {
  bench(`helper_${name}_x1_${N}items`, () => {
    engine.evaluate(`_${name}(products, '${body}')`)
  })
}
bench(`helper_reduce_x1_${N}items`, () => {
  engine.evaluate(`_reduce(products, '${REDUCE_BODY}', 0)`)
})

// (5) empty-array error timing: today the body string is never parsed, so an
// invalid body on an empty array is accepted. Parse-once must keep this.
let emptyOutcome
try {
  const empty = makeEngine().evaluate('_map([], "definitely not valid (")')
  emptyOutcome = `accepted:${JSON.stringify(empty)}`
} catch (error) {
  emptyOutcome = `threw:${error.name}`
}
bench('helper_map_empty_invalidBody_x1', () => {
  makeEngine().evaluate('_map([], "definitely not valid (")')
})

// (6) result conversion: helper result -> Value (valueFromHost) + optional
// .toString() member-method serialization.
bench(`helper_map_x1_${N}items_plus_toString`, () => {
  engine.evaluate(`_map(products, "${MAP_BODY}").toString()`)
})

/* ------------------------------------------------------------------ report */
const per = (label) => results[label].medianMs / N
const report = {
  generatedAt: new Date().toISOString(),
  node: process.version,
  iteratedItems: N,
  runs: RUNS,
  correctness,
  emptyArrayInvalidBodyOutcome: emptyOutcome,
  phasesMs: results,
  perItemUs: {
    parse_only_mapBody: Number((per('parse_only_mapBody_xN') * 1000).toFixed(3)),
    parseExpression_mapBody: Number((per('parseExpression_mapBody_perItem_xN') * 1000).toFixed(3)),
    snapshot_nPlus3Keys_trivial: Number((per('snapshot_nPlus3Keys_trivial_xN') * 1000).toFixed(3)),
    nestedScopeSpread: Number((per('nestedScopeSpread_xN') * 1000).toFixed(3)),
    helper_map: Number((per(`helper_map_x1_${N}items`) * 1000).toFixed(3)),
    helper_filter: Number((per(`helper_filter_x1_${N}items`) * 1000).toFixed(3)),
    helper_reduce: Number((per(`helper_reduce_x1_${N}items`) * 1000).toFixed(3)),
  },
}
const parseShareOfHelper =
  results[`helper_map_x1_${N}items`].medianMs === 0
    ? null
    : Number((results.parse_only_mapBody_xN.medianMs / results[`helper_map_x1_${N}items`].medianMs).toFixed(3))
report.parseMsOverHelperMapMs = parseShareOfHelper

process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
process.stderr.write(`\n== nested parse bench (N=${N}) ==\n`)
for (const [k, v] of Object.entries(results))
  process.stderr.write(`${k.padEnd(40)} ${String(v.medianMs).padStart(9)} ms\n`)
process.stderr.write(`\nparse share of _map total: ${parseShareOfHelper}\n`)
process.stderr.write(`per-item: ${JSON.stringify(report.perItemUs, null, 2)}\n`)
