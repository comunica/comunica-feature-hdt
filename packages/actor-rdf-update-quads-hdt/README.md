# Comunica HDT RDF Update Quads Actor

[![npm version](https://badge.fury.io/js/%40comunica%2Factor-rdf-update-quads-hdt.svg)](https://www.npmjs.com/package/@comunica/actor-rdf-update-quads-hdt)

An [RDF Update Quads](https://github.com/comunica/comunica/tree/master/packages/bus-rdf-update-quads) actor that updates local [HDT files](https://www.rdfhdt.org/)
and local directories with an updatable dataset of HDT files,
via [hdt.js](https://github.com/rubensworks/hdt.js).

A dataset only writes the changes of an update: the positions of deleted triples, and a small HDT file of inserted triples,
which are merged with other files later on, so that updates take milliseconds instead of rewriting all data.
Updates of a dataset are durable once they finish, and multiple processes, such as workers of an endpoint,
can update the same dataset, as configured by the `isolation` parameter.

A single HDT file is read-only by design, so each update rewrites the whole file,
by merging it with the deleted and inserted quads.
The new file replaces the old one once it is complete,
and an index next to the file (`<file>.index.v1-1` or `<file>.index`) is regenerated if it exists.
Updates of the same file within an engine run one after another,
and cached sources of the file are invalidated after each update.

HDT files only have a default graph, so inserting quads in named graphs fails,
and deleting all graphs or the default graph empties the file.

This module is part of the [Comunica framework](https://github.com/comunica/comunica),
and should only be used by [developers that want to build their own query engine](https://comunica.dev/docs/modify/).

[Click here if you just want to query with Comunica](https://comunica.dev/docs/query/).

## Install

```bash
$ yarn add @comunica/actor-rdf-update-quads-hdt
```

## Configure

After installing, this package can be added to your engine's configuration as follows:
```text
{
  "@context": [
    ...
    "https://linkedsoftwaredependencies.org/bundles/npm/@comunica/actor-rdf-update-quads-hdt/^1.0.0/components/context.jsonld"
  ],
  "actors": [
    ...
    {
      "@id": "urn:comunica:default:rdf-update-quads/actors#hdt",
      "@type": "ActorRdfUpdateQuadsHdt",
      "mediatorHttpInvalidate": { "@id": "urn:comunica:default:http-invalidate/mediators#main" },
      "beforeActors": { "@id": "urn:comunica:default:rdf-update-quads/actors#hypermedia" }
    }
  ]
}
```

### Config Parameters

* `mediatorHttpInvalidate`: A mediator over the [HTTP Invalidate bus](https://github.com/comunica/comunica/tree/master/packages/bus-http-invalidate), via which cached sources of updated files are invalidated.
* `isolation`: How updates of datasets in multiple processes are isolated from each other, defaults to `serializable`.
  With `serializable`, an update holds the lock of the dataset while its quads are determined and committed,
  so that updates with `WHERE` clauses behave as if they ran one after another.
  With `snapshot`, updates run in parallel, and only retry their commit if another update committed first,
  which is equally correct for updates without `WHERE` clauses, such as `INSERT DATA`.
