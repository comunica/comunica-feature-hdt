import type { IQuadDestination } from '@comunica/bus-rdf-update-quads';
import type * as RDF from '@rdfjs/types';
import type { AsyncIterator } from 'asynciterator';
import type { HdtDataset } from 'hdt-js';
import { defaultGraphQuads } from './HdtQuadDestination';

/**
 * A quad destination that updates a dataset of hdt.js in a local directory.
 *
 * Unlike a single HDT file, which must be rewritten for each update,
 * a dataset writes the deleted positions and a small segment of inserted triples,
 * which are merged with other segments later on.
 */
export class HdtDatasetDestination implements IQuadDestination {
  private readonly dataset: HdtDataset;
  private readonly onUpdated: () => Promise<void>;
  private readonly isolation: 'serializable' | 'snapshot';

  /**
   * @param dataset The dataset.
   * @param onUpdated Invoked after the dataset changed.
   * @param isolation The isolation of updates.
   */
  public constructor(dataset: HdtDataset, onUpdated: () => Promise<void>, isolation: 'serializable' | 'snapshot') {
    this.dataset = dataset;
    this.onUpdated = onUpdated;
    this.isolation = isolation;
  }

  public async update(
    quadStreams: { insert?: AsyncIterator<RDF.Quad>; delete?: AsyncIterator<RDF.Quad> },
  ): Promise<void> {
    const changed = await this.dataset.update({
      delete: quadStreams.delete && defaultGraphQuads(quadStreams.delete, false),
      insert: quadStreams.insert && defaultGraphQuads(quadStreams.insert, true),
    }, { isolation: this.isolation });
    if (changed) {
      await this.onUpdated();
    }
  }

  public async deleteGraphs(
    graphs: RDF.DefaultGraph | 'NAMED' | 'ALL' | RDF.NamedNode[],
    _requireExistence: boolean,
    _dropGraphs: boolean,
  ): Promise<void> {
    // Datasets only have a default graph, and do not record empty graphs
    if (graphs === 'ALL' || (graphs !== 'NAMED' && !Array.isArray(graphs))) {
      await this.dataset.clear();
      await this.onUpdated();
    }
  }

  public async createGraphs(_graphs: RDF.NamedNode[], _requireNonExistence: boolean): Promise<void> {
    // Datasets do not record empty graphs, and named graphs never exist
  }
}
