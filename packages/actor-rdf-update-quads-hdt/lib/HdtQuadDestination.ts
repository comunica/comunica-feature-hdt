/* eslint-disable import/no-nodejs-modules */
import { randomUUID } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { rename, rm, stat } from 'node:fs/promises';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

/* eslint-enable import/no-nodejs-modules */
import type { IQuadDestination } from '@comunica/bus-rdf-update-quads';
import type * as RDF from '@rdfjs/types';
import type { AsyncIterator } from 'asynciterator';
import { catHdt, HdtDocument } from 'hdt-js';

/**
 * A quad destination that updates a local HDT file, by rewriting it.
 *
 * The new file is written next to the old one, and then replaces it,
 * so that documents that are still reading the old file are not affected.
 * An index next to the file is regenerated if it exists.
 */
export class HdtQuadDestination implements IQuadDestination {
  private readonly path: string;
  private readonly lock: (task: () => Promise<void>) => Promise<void>;
  private readonly onUpdated: () => Promise<void>;

  /**
   * @param path The path of the HDT file.
   * @param lock Runs a task once no other updates of the same file are running.
   * @param onUpdated Invoked after the file has been replaced.
   */
  public constructor(
    path: string,
    lock: (task: () => Promise<void>) => Promise<void>,
    onUpdated: () => Promise<void>,
  ) {
    this.path = path;
    this.lock = lock;
    this.onUpdated = onUpdated;
  }

  public async update(
    quadStreams: { insert?: AsyncIterator<RDF.Quad>; delete?: AsyncIterator<RDF.Quad> },
  ): Promise<void> {
    if (!quadStreams.insert && !quadStreams.delete) {
      return;
    }
    await this.rewrite(document => catHdt([ document ], {
      delete: quadStreams.delete && defaultGraphQuads(quadStreams.delete, false),
      insert: quadStreams.insert && defaultGraphQuads(quadStreams.insert, true),
    }));
  }

  public async deleteGraphs(
    graphs: RDF.DefaultGraph | 'NAMED' | 'ALL' | RDF.NamedNode[],
    _requireExistence: boolean,
    _dropGraphs: boolean,
  ): Promise<void> {
    // HDT files only have a default graph, and do not record empty graphs
    if (graphs === 'ALL' || (graphs !== 'NAMED' && !Array.isArray(graphs))) {
      await this.rewrite(() => catHdt([]));
    }
  }

  public async createGraphs(_graphs: RDF.NamedNode[], _requireNonExistence: boolean): Promise<void> {
    // HDT files do not record empty graphs, and named graphs never exist
  }

  /**
   * Replace the file, and its index if it exists, by the result of the given edit.
   */
  protected async rewrite(edit: (document: HdtDocument) => AsyncIterable<Uint8Array>): Promise<void> {
    await this.lock(async() => {
      const temporary = `${this.path}.${randomUUID()}.tmp`;
      const temporaryIndex = `${temporary}.index.v1-1`;
      const indexes = [ `${this.path}.index.v1-1`, `${this.path}.index` ];
      const existingIndexes = (await Promise.all(indexes.map(fileExists))).some(Boolean);
      try {
        const document = await HdtDocument.fromFile(this.path, { index: false });
        try {
          await pipeline(Readable.from(edit(document)), createWriteStream(temporary));
        } finally {
          await document.close();
        }
        if (existingIndexes) {
          const updated = await HdtDocument.fromFile(temporary, { index: false });
          try {
            await pipeline(Readable.from(updated.serializeIndex()), createWriteStream(temporaryIndex));
          } finally {
            await updated.close();
          }
          // Stale indexes are removed first, so that the new file is never read with them
          await Promise.all(indexes.map(index => rm(index, { force: true })));
        }
        await rename(temporary, this.path);
        if (existingIndexes) {
          await rename(temporaryIndex, indexes[0]);
        }
      } finally {
        await Promise.all([ temporary, temporaryIndex ].map(file => rm(file, { force: true })));
      }
      await this.onUpdated();
    });
  }
}

/**
 * Check if a file exists.
 */
async function fileExists(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

/**
 * Only keep quads in the default graph, since HDT files have no named graphs.
 * @param quads The quads.
 * @param required If quads in other graphs must result in an error, instead of being skipped.
 */
export async function* defaultGraphQuads(quads: AsyncIterator<RDF.Quad>, required: boolean): AsyncGenerator<RDF.Quad> {
  for await (const quad of quads) {
    if (quad.graph.termType === 'DefaultGraph') {
      yield quad;
    } else if (required) {
      throw new Error(`HDT files only have a default graph, but a quad was inserted in graph ${quad.graph.value}`);
    }
  }
}
