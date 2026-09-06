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
 * The most bindings a single pattern may be materialised into, to bound what one query can hold in memory.
 */
const MAX_INDEXED_BINDINGS = 10_000;

/**
 * Materialising a pattern allocates one bindings object per triple, which costs far more than the page reads it
 * saves, so a step must be probed a good fraction of its size before it is worth indexing.
 */
const INDEX_PROBE_DIVISOR = 32;

/**
 * One pattern of a join, together with what is known about how it will be evaluated.
 */
interface IJoinStep {
  pattern: Algebra.Pattern;
  /**
   * The number of triples the pattern matches on its own.
   */
  count: number;
  /**
   * The pattern's variables that are already bound when this step runs, in other words the join key.
   */
  keyVariables: RDF.Variable[];
  /**
   * How often this step has been evaluated against a fresh set of bindings.
   */
  probes: number;
  /**
   * The pattern's bindings, grouped by join key. Only set once looking them up one by one stops paying off.
   */
  index?: Promise<Map<string, RDF.Bindings[]>>;
}

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
   * A key that identifies a term within one document, so that bindings can be grouped by their join key.
   */
  protected static termKey(term: RDF.Term): string {
    return term.termType === 'Literal' ?
      `"${term.value}"${term.language}|${term.datatype.value}` :
      `${term.termType}|${term.value}`;
  }

  protected static indexKey(variables: RDF.Variable[], bindings: RDF.Bindings): string | undefined {
    const keys: string[] = [];
    for (const variable of variables) {
      const term = bindings.get(variable);
      // A variable the metadata announced but that this binding leaves open cannot be looked up in the index
      if (!term) {
        return undefined;
      }
      keys.push(QuerySourceHdt.termKey(term));
    }
    return keys.join(' ');
  }

  /**
   * Read a step's pattern once and group its bindings by join key.
   */
  protected async buildIndex(step: IJoinStep): Promise<Map<string, RDF.Bindings[]>> {
    const index = new Map<string, RDF.Bindings[]>();
    const all = await new HdtIterator(
      this.hdtDocument,
      this.bindingsFactory,
      step.pattern.subject,
      step.pattern.predicate,
      step.pattern.object,
      { autoStart: false, maxBufferSize: this.maxBufferSize },
    ).toArray();
    for (const bindings of all) {
      const key = QuerySourceHdt.indexKey(step.keyVariables, bindings)!;
      const bucket = index.get(key);
      if (bucket) {
        bucket.push(bindings);
      } else {
        index.set(key, [ bindings ]);
      }
    }
    return index;
  }

  /**
   * Evaluate one step of the join against the bindings produced so far.
   *
   * A step starts out as an index nested loop: one lookup per incoming binding. That is the right shape while the
   * bindings are few, but a step reached many times ends up looking the same pattern up over and over. Reading the
   * whole pattern once costs `count / pageSize` lookups, so once that many probes have been paid the pattern is
   * materialised and grouped by join key, and the remaining probes are answered from memory.
   */
  protected evaluateStep(step: IJoinStep, bindings: RDF.Bindings): AsyncIterator<RDF.Bindings> {
    step.probes++;
    if (!step.index &&
      step.keyVariables.length > 0 &&
      step.count <= MAX_INDEXED_BINDINGS &&
      step.probes > Math.ceil(step.count / INDEX_PROBE_DIVISOR)) {
      step.index = this.buildIndex(step);
    }

    if (step.index) {
      const key = QuerySourceHdt.indexKey(step.keyVariables, bindings);
      if (key !== undefined) {
        const index = step.index;
        return new TransformIterator<RDF.Bindings>(
          async() => new ArrayIterator<RDF.Bindings>(
            // The join key is equal by construction, so merging can never conflict
            (await index).get(key)?.map(indexed => indexed.merge(bindings)!) ?? [],
            { autoStart: false },
          ),
          { autoStart: false, maxBufferSize: this.maxBufferSize },
        );
      }
    }

    return this.evaluatePattern(step.pattern, bindings);
  }

  /**
   * Evaluate the steps of a join in the order they were given.
   *
   * The caller has already ordered them, so no planning happens here. Each step is matched with the bindings
   * produced so far substituted in, which is the same work a bind join does, without re-entering the engine for
   * every binding.
   */
  protected evaluateSteps(steps: IJoinStep[], bindings: RDF.Bindings): AsyncIterator<RDF.Bindings> {
    const head = this.evaluateStep(steps[0], bindings);
    if (steps.length === 1) {
      return head;
    }
    const tail = steps.slice(1);
    return new MultiTransformIterator(head, {
      autoStart: false,
      multiTransform: (headBindings: RDF.Bindings) => this.evaluateSteps(tail, headBindings),
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
  ): Promise<{ steps: IJoinStep[]; counts: number[] }> {
    const dataFactory = this.dataFactory;
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
    const steps: IJoinStep[] = [];
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
      steps.push({
        pattern: chosen.pattern,
        count: chosen.count,
        keyVariables: chosen.variables
          .filter(variable => bound.has(variable))
          .map(variable => dataFactory.variable(variable)),
        probes: 0,
      });
      for (const variable of chosen.variables) {
        bound.add(variable);
      }
    }
    return { steps, counts };
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
          async() => this.evaluateSteps((await ordered).steps, bindings),
          { autoStart: false, maxBufferSize: this.maxBufferSize },
        ),
      });
    }

    const it = new TransformIterator<RDF.Bindings>(
      async() => this.evaluateSteps((await ordered).steps, this.bindingsFactory.bindings([])),
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
