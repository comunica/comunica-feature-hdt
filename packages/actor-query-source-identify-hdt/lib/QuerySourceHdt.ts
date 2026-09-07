import type {
  BindingsStream,
  ComunicaDataFactory,
  FragmentSelectorShape,
  IActionContext,
  IQueryBindingsOptions,
  IQuerySource,
} from '@comunica/types';
import { Algebra, isKnownOperation, AlgebraFactory } from '@comunica/utils-algebra';
import type { BindingsFactory } from '@comunica/utils-bindings-factory';
import { MetadataValidationState } from '@comunica/utils-metadata';
import type * as RDF from '@rdfjs/types';
import type { AsyncIterator } from 'asynciterator';
import { ArrayIterator, MultiTransformIterator } from 'asynciterator';
import type * as HDT from 'hdt';
import { HdtIterator } from './HdtIterator';

const AF = new AlgebraFactory();

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
      joinBindings: true,
    };
  }

  public async getFilterFactor(_context: IActionContext): Promise<number> {
    return 1;
  }

  public async getSelectorShape(): Promise<FragmentSelectorShape> {
    return this.selectorShape;
  }

  /**
   * Bind a pattern term against the given bindings, leaving unbound variables in place.
   */
  protected static bindTerm(term: RDF.Term, bindings: RDF.Bindings): RDF.Term {
    return term.termType === 'Variable' ? bindings.get(term) ?? term : term;
  }

  /**
   * Match the pattern once per incoming binding, merging each binding into its own results.
   *
   * This is the whole point of accepting join bindings: a bind join would otherwise re-enter the query engine for
   * every binding of its left stream, re-planning an operation whose shape never changes. Here each binding costs a
   * term substitution and a lookup.
   */
  protected queryBindingsJoined(
    pattern: Algebra.Pattern,
    joinBindings: NonNullable<IQueryBindingsOptions['joinBindings']>,
  ): BindingsStream {
    return new MultiTransformIterator(joinBindings.bindings, {
      autoStart: false,
      maxBufferSize: this.maxBufferSize,
      multiTransform: (bindings: RDF.Bindings) => new HdtIterator(
        this.hdtDocument,
        this.bindingsFactory,
        QuerySourceHdt.bindTerm(pattern.subject, bindings),
        QuerySourceHdt.bindTerm(pattern.predicate, bindings),
        QuerySourceHdt.bindTerm(pattern.object, bindings),
        { autoStart: false, maxBufferSize: this.maxBufferSize },
      )
        // Every variable these bindings cover was substituted above, so the two can never conflict
        .map(subBindings => subBindings.merge(bindings)!),
    });
  }

  public queryBindings(
    operation: Algebra.Operation,
    _context: IActionContext,
    options?: IQueryBindingsOptions,
  ): BindingsStream {
    if (!isKnownOperation(operation, Algebra.Types.PATTERN)) {
      throw new Error(`Attempted to pass non-pattern operation '${operation.type}' to QuerySourceRdfJs`);
    }

    if (options?.joinBindings && operation.graph.termType !== 'NamedNode') {
      return this.queryBindingsJoined(operation, options.joinBindings);
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
    _operation: Algebra.Operation,
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
