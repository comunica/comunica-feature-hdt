# Benchmark WatDiv HDT Large

This internal package benchmarks Comunica HDT using the [WatDiv](https://dsg.uwaterloo.ca/watdiv/) benchmark,
at scale 100 instead of the scale 10 used by [`benchmark-watdiv-hdt`](../benchmark-watdiv-hdt):
11 014 612 triples instead of 1 093 111.

The smaller variant stays as it is. It gives fast feedback and a long history, and the two answer
different questions: at scale 10 most templates finish in a few milliseconds, so what they measure is
dominated by per-query overhead, while at scale 100 the scans and the joins over them are what takes
the time. The queries that separate Comunica from a native store, C3 and S2 in particular, only show
that separation at the larger scale.

The dataset is fetched from
[comunica-performance-assets](https://github.com/comunica/comunica-performance-assets) rather than
generated per run, because the WatDiv generator is not deterministic and per-run generation would make
the continuous results incomparable. The asset ships the HDT conversion as well, so the run skips both
the generation and the `rdf2hdt` pass.

Compare your current version of Comunica locally with the latest published release by running `npm run performance` from within this package.
This will output a file called `plot_queries_data.svg` that visualizes the performance differences.

If you only want to check the performance of your current version of Comunica,
you can run `npm run performance:ci` instead,
which is what the CI will run as well for continuous performance measurements.

Continuous performance results are tracked on https://github.com/comunica/comunica-performance-results.
