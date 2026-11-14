# Comunica HDT Query Source Identify Actor

[![npm version](https://badge.fury.io/js/%40comunica%2Factor-query-source-identify-hdt.svg)](https://www.npmjs.com/package/@comunica/actor-query-source-identify-hdt)

A [Query Source Identify](https://github.com/comunica/comunica/tree/master/packages/bus-query-source-identify) actor that handles [HDT files](https://www.rdfhdt.org/),
which can be local files, or remote files that are read via HTTP Range requests,
and local directories with an updatable dataset of HDT files,
of which generations that other processes commit are picked up before queries.
HDT files are read via [hdt.js](https://github.com/rubensworks/hdt.js).

This module is part of the [Comunica framework](https://github.com/comunica/comunica),
and should only be used by [developers that want to build their own query engine](https://comunica.dev/docs/modify/).

[Click here if you just want to query with Comunica](https://comunica.dev/docs/query/).

## Install

```bash
$ yarn add @comunica/actor-query-source-identify-hdt
```

## Configure

After installing, this package can be added to your engine's configuration as follows:
```text
{
  "@context": [
    ...
    "https://linkedsoftwaredependencies.org/bundles/npm/@comunica/actor-query-source-identify-hdt/^1.0.0/components/context.jsonld"
  ],
  "actors": [
    ...
    {
      "@id": "urn:comunica:default:query-source-identify/actors#hdt",
      "@type": "ActorQuerySourceIdentifyHdt",
      "mediatorMergeBindingsContext": { "@id": "urn:comunica:default:merge-bindings-context/mediators#main" },
      "mediatorHttp": { "@id": "urn:comunica:default:http/mediators#main" }
    }
  ]
}
```

### Config Parameters

* `httpInvalidator`: An optional actor that listens to HTTP invalidation events.
* `mediatorMergeBindingsContext`: A mediator over the [Merge Bindings Context bus](https://github.com/comunica/comunica/tree/master/packages/bus-merge-bindings-context).
* `mediatorHttp`: A mediator over the [HTTP bus](https://github.com/comunica/comunica/tree/master/packages/bus-http), via which remote HDT files are read.
