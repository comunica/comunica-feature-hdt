import type {
  BindingsStream,
  ComunicaDataFactory,
  FragmentSelectorShape,
  IActionContext,
  IQuerySource,
} from '@comunica/types';
import type { BindingsFactory } from '@comunica/utils-bindings-factory';
import { MetadataValidationState } from '@comunica/utils-metadata';
import type * as RDF from '@rdfjs/types';
import type { AsyncIterator } from 'asynciterator';
import { ArrayIterator } from 'asynciterator';
import type * as HDT from 'hdt';
import type { Algebra } from 'sparqlalgebrajs';
import { Factory } from 'sparqlalgebrajs';
import { HdtIterator } from './HdtIterator';

const AF = new Factory();

/**
 * A query source over an HDT file.
 */
export class QuerySourceHdt implements IQuerySource {
  public referenceValue: string;
  protected readonly hdtPath: string;
  protected readonly hdtDocument: HDT.Document;
  private readonly dataFactory: ComunicaDataFactory;
  private readonly bindingsFactory: BindingsFactory;
  private readonly maxBufferSize: number;
  private readonly selectorShape: FragmentSelectorShape;

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
    this.selectorShape = {
      type: 'operation',
      operation: {
        operationType: 'pattern',
        pattern: AF.createPattern(
          this.dataFactory.variable('s'),
          this.dataFactory.variable('p'),
          this.dataFactory.variable('o'),
        ),
      },
      variablesOptional: [
        this.dataFactory.variable('s'),
        this.dataFactory.variable('p'),
        this.dataFactory.variable('o'),
      ],
    }; ;
  }

  public async getSelectorShape(): Promise<FragmentSelectorShape> {
    return this.selectorShape;
  }

  public queryBindings(operation: Algebra.Operation, _context: IActionContext): BindingsStream {
    if (operation.type !== 'pattern') {
      throw new Error(`Attempted to pass non-pattern operation '${operation.type}' to QuerySourceRdfJs`);
    }

    let it: AsyncIterator<RDF.Bindings>;
    if (operation.graph.termType === 'NamedNode') {
      it = new ArrayIterator<RDF.Bindings>([], { autoStart: false });
      it.setProperty('metadata', {
        state: new MetadataValidationState(),
        cardinality: { type: 'exact', value: 0 },
        variables: [],
      });
    } else {
      // Create an iterator over the HDT document
      it = new HdtIterator(
        this.hdtDocument,
        this.bindingsFactory,
        operation.subject,
        operation.predicate,
        operation.object,
        { autoStart: false, maxBufferSize: this.maxBufferSize },
      );
    }

    return it;
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
