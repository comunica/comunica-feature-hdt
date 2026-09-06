import type {
  BindingsStream,
  MetadataVariable,
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
import { ArrayIterator, MultiTransformIterator, TransformIterator } from 'asynciterator';
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
    const patternShape: FragmentSelectorShape = {
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
    this.selectorShape = {
      type: 'disjunction',
      children: [
        patternShape,
        // A join of patterns is answered here as an index nested loop, so that a bind join can hand over its
        // whole bindings stream instead of re-entering the engine once per binding.
        {
          type: 'operation',
          operation: { operationType: 'type', type: Algebra.Types.JOIN },
          joinBindings: true,
        },
      ],
    };
  }

  public async getFilterFactor(_context: IActionContext): Promise<number> {
    return 1;
  }

  public async getSelectorShape(): Promise<FragmentSelectorShape> {
    return this.selectorShape;
  }

  protected static bindTerm(term: RDF.Term, bindings: RDF.Bindings): RDF.Term {
    return term.termType === 'Variable' ? bindings.get(term) ?? term : term;
  }

  /**
   * Match a single pattern against the document, with the given bindings substituted in and merged into the results.
   */
  protected evaluatePattern(pattern: Algebra.Pattern, bindings: RDF.Bindings): AsyncIterator<RDF.Bindings> {
    return new HdtIterator(
      this.hdtDocument,
      this.bindingsFactory,
      QuerySourceHdt.bindTerm(pattern.subject, bindings),
      QuerySourceHdt.bindTerm(pattern.predicate, bindings),
      QuerySourceHdt.bindTerm(pattern.object, bindings),
      { autoStart: false, maxBufferSize: this.maxBufferSize },
    )
      // Every variable these bindings cover was substituted into the pattern above, so the two can never conflict
      .map(subBindings => subBindings.merge(bindings)!);
  }

  /**
   * Evaluate a list of patterns as an index nested loop, in the order they were given.
   *
   * The caller has already ordered the patterns, so no planning happens here. Each pattern is matched with the
   * bindings produced so far substituted in, which is the same work a bind join does, without re-entering the
   * engine for every binding.
   */
  protected evaluatePatterns(patterns: Algebra.Pattern[], bindings: RDF.Bindings): AsyncIterator<RDF.Bindings> {
    const head = this.evaluatePattern(patterns[0], bindings);
    if (patterns.length === 1) {
      return head;
    }
    const tail = patterns.slice(1);
    return new MultiTransformIterator(head, {
      autoStart: false,
      multiTransform: (headBindings: RDF.Bindings) => this.evaluatePatterns(tail, headBindings),
    });
  }

  /**
   * Collect the patterns of an operation this source advertised support for.
   */
  protected static getPatterns(operation: Algebra.Operation): Algebra.Pattern[] {
    if (isKnownOperation(operation, Algebra.Types.PATTERN)) {
      return [ operation ];
    }
    if (isKnownOperation(operation, Algebra.Types.JOIN)) {
      return operation.input.flatMap(input => QuerySourceHdt.getPatterns(input));
    }
    throw new Error(`Attempted to pass non-pattern operation '${operation.type}' to QuerySourceHdt`);
  }

  protected static getVariables(pattern: Algebra.Pattern): string[] {
    const variables: string[] = [];
    for (const term of [ pattern.subject, pattern.predicate, pattern.object ]) {
      if (term.termType === 'Variable' && !variables.includes(term.value)) {
        variables.push(term.value);
      }
    }
    return variables;
  }

  /**
   * Order the patterns for the nested loop, once, before any binding is evaluated.
   *
   * Greedy and cardinality-driven: always take the cheapest pattern that shares a variable with what is already
   * bound, so every step after the first is an index lookup rather than a scan. Without this the patterns are
   * evaluated in query order, which turns unrelated patterns into cross products.
   */
  protected async orderPatterns(
    patterns: Algebra.Pattern[],
    boundVariables: string[],
  ): Promise<{ patterns: Algebra.Pattern[]; counts: number[] }> {
    const counts = await Promise.all(patterns.map(async pattern => (await this.hdtDocument.countTriples(
      pattern.subject,
      pattern.predicate,
      pattern.object,
    )).totalCount));
    const remaining = patterns.map((pattern, i) => ({
      pattern,
      count: counts[i],
      variables: QuerySourceHdt.getVariables(pattern),
    }));

    const bound = new Set(boundVariables);
    const ordered: Algebra.Pattern[] = [];
    while (remaining.length > 0) {
      let best = 0;
      for (let i = 1; i < remaining.length; i++) {
        const connected = remaining[i].variables.some(variable => bound.has(variable));
        const bestConnected = remaining[best].variables.some(variable => bound.has(variable));
        if (connected === bestConnected ? remaining[i].count < remaining[best].count : connected) {
          best = i;
        }
      }
      const [ chosen ] = remaining.splice(best, 1);
      for (const variable of chosen.variables) {
        bound.add(variable);
      }
      ordered.push(chosen.pattern);
    }
    return { patterns: ordered, counts };
  }

  public queryBindings(
    operation: Algebra.Operation,
    _context: IActionContext,
    options?: IQueryBindingsOptions,
  ): BindingsStream {
    const patterns = QuerySourceHdt.getPatterns(operation);

    if (patterns.some(pattern => pattern.graph.termType === 'NamedNode')) {
      const empty = new ArrayIterator<RDF.Bindings>([], { autoStart: false });
      empty.setProperty('metadata', {
        state: new MetadataValidationState(),
        cardinality: { type: 'exact', value: 0 },
        variables: [],
      });
      return empty;
    }

    // A lone pattern keeps the plain iterator, which reports its own metadata
    if (patterns.length === 1 && !options?.joinBindings) {
      return new HdtIterator(
        this.hdtDocument,
        this.bindingsFactory,
        patterns[0].subject,
        patterns[0].predicate,
        patterns[0].object,
        { autoStart: false, maxBufferSize: this.maxBufferSize },
      );
    }

    // The order is decided once, off the unbound cardinalities, and reused for every binding
    const ordered = this.orderPatterns(
      patterns,
      options?.joinBindings?.metadata.variables.map(({ variable }) => variable.value) ?? [],
    );

    if (options?.joinBindings) {
      return new MultiTransformIterator(options.joinBindings.bindings, {
        autoStart: false,
        multiTransform: (bindings: RDF.Bindings) => new TransformIterator<RDF.Bindings>(
          async() => this.evaluatePatterns((await ordered).patterns, bindings),
          { autoStart: false, maxBufferSize: this.maxBufferSize },
        ),
      });
    }

    const it = new TransformIterator<RDF.Bindings>(
      async() => this.evaluatePatterns((await ordered).patterns, this.bindingsFactory.bindings([])),
      { autoStart: false, maxBufferSize: this.maxBufferSize },
    );
    this.setJoinMetadata(it, patterns, ordered);
    return it;
  }

  /**
   * Publish metadata for a stream of joined patterns.
   *
   * The cardinality is the smallest of the patterns' own cardinalities, which is what an equi-join over a shared
   * variable tends towards, and is enough for the planner to size this source's output.
   */
  protected setJoinMetadata(
    it: AsyncIterator<RDF.Bindings>,
    patterns: Algebra.Pattern[],
    ordered: Promise<{ counts: number[] }>,
  ): void {
    const variables: MetadataVariable[] = [];
    for (const pattern of patterns) {
      for (const term of [ pattern.subject, pattern.predicate, pattern.object ]) {
        if (term.termType === 'Variable' && !variables.some(({ variable }) => variable.equals(term))) {
          variables.push({ variable: term, canBeUndef: false });
        }
      }
    }
    ordered
      .then(({ counts }) => {
        it.setProperty('metadata', {
          state: new MetadataValidationState(),
          cardinality: { type: 'estimate', value: Math.min(...counts) },
          variables,
        });
      })
      .catch(error => it.destroy(error));
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
