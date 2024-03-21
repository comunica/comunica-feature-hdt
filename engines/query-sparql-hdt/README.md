# Comunica SPARQL HDT

[![npm version](https://badge.fury.io/js/%40comunica%2Fquery-sparql-hdt.svg)](https://www.npmjs.com/package/@comunica/query-sparql-hdt)
[![Docker Pulls](https://img.shields.io/docker/pulls/comunica/query-sparql-hdt.svg)](https://hub.docker.com/r/comunica/query-sparql-hdt/)

Comunica SPARQL Solid is a SPARQL query engine for JavaScript that can query over [HDT files](https://www.rdfhdt.org/), which are highly compressed files for storing large RDF datasets.

This package can only be used within Node.js, and **it does NOT work within browser environments**.

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

TODO

Show the help with all options:

```bash
$ comunica-sparql-hdt --help
```

Just like [Comunica SPARQL](https://github.com/comunica/comunica/tree/master/packages/query-sparql),
a [dynamic variant](https://github.com/comunica/comunica/tree/master/packages/query-sparql#usage-from-the-command-line) (`comunica-dynamic-sparql-hdt`) also exists.

_[**Read more** about querying from the command line](https://comunica.dev/docs/query/getting_started/query_cli/)._

### Usage within application

This engine can be used in JavaScript/TypeScript applications as follows:

TODO

_[**Read more** about querying an application](https://comunica.dev/docs/query/getting_started/query_app/)._

### Usage as a SPARQL endpoint

TODO

Show the help with all options:

```bash
$ comunica-sparql-hdt-http --help
```

The SPARQL endpoint can only be started dynamically.
An alternative config file can be passed via the `COMUNICA_CONFIG` environment variable.

Use `bin/http.js` when running in the Comunica monorepo development environment.

_[**Read more** about setting up a SPARQL endpoint](https://comunica.dev/docs/query/getting_started/setup_endpoint/)._
