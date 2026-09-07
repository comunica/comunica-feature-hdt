# Comunica at large dataset scale: what is slow, and why

Measured on WatDiv scale 100 (10.9M triples) and BSBM 100K products (35.3M triples), queried
in-process over an HDT source. All timings are best-of-two on one machine; ratios within a run are
comparable, absolute numbers across runs are not. Every configuration below was checked to return
identical result counts to stock Comunica on all 31 queries.

## 1. Where the time goes

The queries that lag other engines are not slow because the planner picks the wrong join algorithm.
They are slow because **a bind join re-enters the query engine once per binding**.

For WatDiv C2 (10 patterns, 0 results, ~9s):

| | |
|---|---|
| bind sub-mediations | 13 322 |
| distinct operation *shapes* among them | **10** |
| `HdtIterator`s created | 101 213 |
| of those, ever read for data | **2.5%** |
| `countTriples` calls | 101 213 |

C3 plans the same shape 40 297 times. C1, 4 873 times for 7 shapes.

With every cardinality lookup memoized so data access is free, C2 still takes 3.9s, of which 98% is
JavaScript and 1.9% idle: ~33% bus and mediator dispatch, 14.5% asynciterator, 12.6% GC. The cost is
building a fresh sub-pipeline per binding, not reading data.

## 2. What other engines do

Apache Jena 5.2.0 / TDB2, same data, same query text, warm (2 warmup runs, average of 3):

| query | Jena TDB2 | Comunica master | with the changes below |
|---|---:|---:|---:|
| C1 | 43 | 2709 | 621 |
| C2 | 189 | 9212 | 2010 |
| C3 | 7318 | 25913 | 16183 |
| S2 | 48 | 14299 | 624 |
| S5 | 10 | 2553 | 66 |
| S3 | 10 | 252 | 334 |
| S4 | 7 | 66 | 79 |
| F1 | 7 | 276 | 70 |
| L2 | 28 | 28 | 65 |

**Jena's plan for every one of these is a single `quadpattern` operator.** There is no join tree.
TDB2 reorders the patterns using statistics and then executes the whole BGP as one pipeline of
substitute-and-index-scan steps. Nothing is re-planned per binding because there is nothing to
re-plan: the pattern order is fixed once, before execution.

Comunica instead decomposes a BGP into nested binary and n-ary join actors, each of which re-enters
the engine for its sub-operations. That is the structural difference, and it is the whole gap.

## 3. Cost model defects found along the way

### `iterations` is not a unit

| actor | `iterations` | measures |
|---|---|---|
| `hash` | `0.8(c0+c1)` | rows |
| `nested-loop` | `c0*c1` | comparisons |
| `multi-bind` | `c0*sum(ci*seli*0.1)` | output rows, deflated 10x |
| `multi-smallest` | `prod(ci)` | a cross product it never computes |
| `multi-bind-source` | `1` | a constant |

One `cpuWeight` multiplies all of these. No value of it can be correct. This is why weight tuning
alone never moved anything: measured, going from `ioWeight` 10 to 100000 left the slow queries
untouched and slightly worse (C1 2605 -> 3166).

### The model is effectively single-parameter

For L2's inner join, `iterations` is 91.7% of the total cost; memory and blocking contribute 2.8%
and 5.6%, and I/O is zero for a local source.

### `requestTime` is dimensionally mismatched

It is in milliseconds while the other three terms are counts. With `cpuWeight = ioWeight = 10` the
model asserts 1ms of I/O is worth 1 row of CPU. Measured here, an HDT round trip is 19-90us and a
row of pipeline work is 2-4us, so 1ms is worth 250-500 rows.

### Seek cost is suppressed for paged sources

`getRequestInitialTimes` is `pageSize ? 0 : requestTime`. A paged source is *defined* to have zero
per-request cost, so no source can express "cheap to stream, expensive to seek" — which is exactly
what HDT is.

### Costing is local, and planning is free

Nothing represents the cost of instantiating a plan, and each join mediation is costed in isolation.
When the planner picks multi-bind at a 10-entry join, the 13 322 sub-plans that decision commits to
appear in no cost it computes.

## 4. What was tried

| change | result |
|---|---|
| Cap join cardinality with shared variables (comunica#1792) | 0.83x, safe, fixes S2 and S5 estimates |
| Answer whole BGPs inside the HDT source (hdt#37) | 0.34x, but not general and bypasses the planner |
| Chain bindings through the source, one pattern per call | **0.36x, general, planner-visible** |
| Raise `ioWeight` with `requestTime` reported | no effect |
| Cost `multi-smallest` as a join rather than a cross product | 12.9x **worse** standalone; needs #1792 under it |
| Adaptive hash step inside the HDT join | 0.94x of the nested loop, two tuned constants, C3 8137 -> 17226 without a size cap |
| Semi-join key set for existence-check steps | no gain (22 461 vs 21 684) |
| Report `requestTime` per request | breaks BSBM Q7/Q8 (115ms -> >90s) |

## 5. WatDiv L2 is unresolved

L2 regresses 28ms -> 65ms under both the HDT pushdown and the chain. Five separate remedies each
fixed it and cost more elsewhere. The reason is worth recording: **L2 and L5 are the same query
shape and cost us identically** (1361 vs 1362 native lookups, 43-47ms), but master answers L2 in
28ms and L5 in 55ms. L2 is simply where Comunica's existing planner happens to win, so any rule that
singles it out has to predict when the old planner gets lucky.

## 6. Recommended order of work

1. Land the shared-variable cardinality cap (comunica#1792). Everything else depends on estimates
   that are not cross products; without it, Q7's estimates reach 2.9e34 and `optional-nested-loop`
   is selected at a cost of 2.5e61.
2. Land the pattern-level `joinBindings` capability and the chained bind-source actor. This is the
   Jena shape: fix the order once, then stream, with no per-binding re-planning.
3. Make `iterations` mean one thing in every actor before touching any weight.
4. Separate seek cost from scan cost, and stop zeroing per-request cost for paged sources.
5. Add a plan-instantiation term, or make costing tree-aware. This is where C1/C2/C3's remaining
   time is.
6. Feed real distinct-value counts into selectivity; HDT can supply them cheaply.

## 7. Caveats

All measurements are HDT-backed. HDT has an unusually high seek-to-scan ratio; an in-memory store or
a SPARQL endpoint would weight these differently and were not measured. Jena's numbers are warm and
in-process via `tdb2.tdbquery`, which is the fairest available comparison but not identical
plumbing to Comunica's in-process engine.
