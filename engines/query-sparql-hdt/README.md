# Comunica SPARQL HDT

[![npm version](https://badge.fury.io/js/%40comunica%2Fquery-sparql-hdt.svg)](https://www.npmjs.com/package/@comunica/query-sparql-hdt)
[![Docker Pulls](https://img.shields.io/docker/pulls/comunica/query-sparql-hdt.svg)](https://hub.docker.com/r/comunica/query-sparql-hdt/)

Comunica SPARQL Solid is a SPARQL query engine for JavaScript that can query over [HDT files](https://www.rdfhdt.org/), which are highly compressed files for storing large RDF datasets.

HDT files can be local files, or remote files over HTTP(S), of which only the needed parts are downloaded via Range requests.
HDT files are read via [hdt.js](https://github.com/rubensworks/hdt.js), a pure JavaScript implementation.

This module is part of the [Comunica framework](https://comunica.dev/).
[Click here to learn more about Comunica and HDT](https://comunica.dev/docs/query/advanced/hdt/).

## Install

```bash
$ yarn add @comunica/query-sparql-hdt
```

or

```bash
$ npm install -g @comunica/query-sparql-hdt
```

## Usage

Show 100 triples from the HDT file stored at `datasets/dataset-100M.hdt`:

```bash
$ comunica-sparql-hdt hdt@datasets/dataset-100M.hdt "CONSTRUCT WHERE { ?s ?p ?o } LIMIT 100"
```

Query a remote HDT file, of which only the needed parts are downloaded:

```bash
$ comunica-sparql-hdt hdt@https://example.org/dataset.hdt "SELECT * WHERE { ?s ?p ?o } LIMIT 100"
```

The server must support Range requests, and in browsers also allow the `range` request header
and expose the `content-range` response header via CORS.
If an hdt-cpp index (`dataset.hdt.index.v1-1`) exists next to the HDT file, it is used for patterns with unbound subjects.

Local HDT files can also be updated with SPARQL UPDATE queries:

```bash
$ comunica-sparql-hdt hdt@datasets/dataset.hdt "INSERT DATA { <ex:s> <ex:p> <ex:o> }"
```

Since HDT files are read-only by design, each update rewrites the whole file, and its index if it exists,
which takes time linear in the size of the file.
HDT files only have a default graph, so quads cannot be inserted in named graphs.

Show the help with all options:

```bash
$ comunica-sparql-hdt --help
```

Just like [Comunica SPARQL](https://github.com/comunica/comunica/tree/master/packages/query-sparql),
a [dynamic variant](https://github.com/comunica/comunica/tree/master/packages/query-sparql#usage-from-the-command-line) (`comunica-dynamic-sparql-hdt`) also exists.

_[**Read more** about querying from the command line](https://comunica.dev/docs/query/getting_started/query_cli/)._

### Usage within application

This engine can be used in JavaScript/TypeScript applications as follows:

```javascript
const QueryEngine = require('@comunica/query-sparql-hdt').QueryEngine;
const myEngine = new QueryEngine();

const bindingsStream = await myEngine.queryBindings(`
  SELECT ?s ?p ?o WHERE {
    ?s ?p ?o
  } LIMIT 100`, {
  sources: [ { type: 'hdt', value: 'datasets/dataset-100M.hdt' } ],
});

// Consume results as a stream (best performance)
bindingsStream.on('data', (binding) => {
  console.log(binding.toString());
});
bindingsStream.on('end', () => {
  // The data-listener will not be called anymore once we get here.
});
bindingsStream.on('error', (error) => {
  console.error(error);
});
```

_[**Read more** about querying an application](https://comunica.dev/docs/query/getting_started/query_app/)._

### Usage as a SPARQL endpoint

```bash
$ comunica-sparql-hdt-http hdt@datasets/dataset-100M.hdt
```

Show the help with all options:

```bash
$ comunica-sparql-hdt-http --help
```

The SPARQL endpoint can only be started dynamically.
An alternative config file can be passed via the `COMUNICA_CONFIG` environment variable.

Use `bin/http.js` when running in the Comunica monorepo development environment.

_[**Read more** about setting up a SPARQL endpoint](https://comunica.dev/docs/query/getting_started/setup_endpoint/)._
