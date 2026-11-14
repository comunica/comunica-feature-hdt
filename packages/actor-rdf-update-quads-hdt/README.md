# Comunica HDT RDF Update Quads Actor

[![npm version](https://badge.fury.io/js/%40comunica%2Factor-rdf-update-quads-hdt.svg)](https://www.npmjs.com/package/@comunica/actor-rdf-update-quads-hdt)

An [RDF Update Quads](https://github.com/comunica/comunica/tree/master/packages/bus-rdf-update-quads) actor that updates local [HDT files](https://www.rdfhdt.org/),
via [hdt.js](https://github.com/rubensworks/hdt.js).

Since HDT files are read-only by design, each update rewrites the whole file,
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
