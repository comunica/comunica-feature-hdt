import { quadsToBindings } from '@comunica/bus-query-source-identify';
import { KeysQueryOperation } from '@comunica/context-entries';
import type {
  IQuerySource,
  FragmentSelectorShape,
  IActionContext,
  BindingsStream,
  ComunicaDataFactory,
} from '@comunica/types';
import type { BindingsFactory } from '@comunica/utils-bindings-factory';
import { MetadataValidationState } from '@comunica/utils-metadata';
import type * as RDF from '@rdfjs/types';
import type { AsyncIterator } from 'asynciterator';
import { ArrayIterator } from 'asynciterator';
import type * as HDT from 'hdt';
import { DataFactory } from 'rdf-data-factory';
import type { Algebra } from 'sparqlalgebrajs';
import { Factory } from 'sparqlalgebrajs';
import { HdtIterator } from './HdtIterator';

const AF = new Factory();
const DF = new DataFactory<RDF.BaseQuad>();

/**
 * A query source over an HDT file.
 */
export class QuerySourceHdt implements IQuerySource {
  protected static readonly SELECTOR_SHAPE: FragmentSelectorShape = {
    type: 'operation',
    operation: {
      operationType: 'pattern',
      pattern: AF.createPattern(DF.variable('s'), DF.variable('p'), DF.variable('o')),
    },
    variablesOptional: [
      DF.variable('s'),
      DF.variable('p'),
      DF.variable('o'),
    ],
  };

  public referenceValue: string;
  protected readonly hdtPath: string;
  protected readonly hdtDocument: HDT.Document;
  private readonly dataFactory: ComunicaDataFactory;
  private readonly bindingsFactory: BindingsFactory;
  private readonly maxBufferSize: number;

  public constructor(
    hdtPath: string,
    hdtDocument: HDT.Document,
    dataFactory: ComunicaDataFactory,
    bindingsFactory: BindingsFactory,
    maxBufferSize: number,
  ) {
    this.hdtPath = hdtPath;
    this.referenceValue = hdtPath;
    this.hdtDocument = hdtDocument;
    this.dataFactory = dataFactory;
    this.bindingsFactory = bindingsFactory;
    this.maxBufferSize = maxBufferSize;
  }

  public async getSelectorShape(): Promise<FragmentSelectorShape> {
    return QuerySourceHdt.SELECTOR_SHAPE;
  }

  public queryBindings(operation: Algebra.Operation, context: IActionContext): BindingsStream {
    if (operation.type !== 'pattern') {
      throw new Error(`Attempted to pass non-pattern operation '${operation.type}' to QuerySourceRdfJs`);
    }

    let it: AsyncIterator<RDF.Quad>;
    if (operation.graph.termType === 'NamedNode') {
      it = new ArrayIterator<RDF.Quad>([], { autoStart: false });
      it.setProperty('metadata', {
        state: new MetadataValidationState(),
        cardinality: { type: 'exact', value: 0 },
      });
    } else {
      // Create an iterator over the HDT document
      it = new HdtIterator(
        this.hdtDocument,
        operation.subject,
        operation.predicate,
        operation.object,
        { autoStart: false, maxBufferSize: this.maxBufferSize },
      );
    }

    return quadsToBindings(
      it,
      operation,
      this.dataFactory,
      this.bindingsFactory,
      Boolean(context.get(KeysQueryOperation.unionDefaultGraph)),
    );
  }

  public queryQuads(
    _operation: Algebra.Operation,
    _context: IActionContext,
  ): AsyncIterator<RDF.Quad> {
    throw new Error('queryQuads is not implemented in QuerySourceHdt');
  }

  public queryBoolean(
    _operation: Algebra.Ask,
    _context: IActionContext,
  ): Promise<boolean> {
    throw new Error('queryBoolean is not implemented in QuerySourceHdt');
  }

  public queryVoid(
    _operation: Algebra.Update,
    _context: IActionContext,
  ): Promise<void> {
    throw new Error('queryVoid is not implemented in QuerySourceHdt');
  }

  public toString(): string {
    return `QuerySourceHdt(${this.hdtPath})`;
  }

  public dispose(): Promise<void> {
    return this.hdtDocument.close();
  }
}
