import type { MetadataVariable } from '@comunica/types';
import { MetadataValidationState } from '@comunica/utils-metadata';
import type * as RDF from '@rdfjs/types';
import type { BufferedIteratorOptions } from 'asynciterator';
import { BufferedIterator } from 'asynciterator';
import type * as HDT from 'hdt';

/**
 * The largest number of items asynciterator ever asks `_read` for at once.
 */
const MAX_READ_SIZE = 128;

/**
 * Iterates over an HDT document in chunks for a triple pattern query.
 */
export class HdtIterator extends BufferedIterator<RDF.Bindings> {
  protected readonly hdtDocument: HDT.Document;
  protected readonly bindingsFactory: RDF.BindingsFactory;
  protected readonly subject: RDF.Term;
  protected readonly predicate: RDF.Term;
  protected readonly object: RDF.Term;

  protected position: number;
  protected readonly pageSize: number;

  public constructor(
    hdtDocument: HDT.Document,
    bindingsFactory: RDF.BindingsFactory,
    subject: RDF.Term,
    predicate: RDF.Term,
    object: RDF.Term,
    options: BufferedIteratorOptions,
  ) {
    super(options);
    this.hdtDocument = hdtDocument;
    this.bindingsFactory = bindingsFactory;
    this.subject = subject;
    this.predicate = predicate;
    this.object = object;
    this.position = 0;
    this.pageSize = Math.min(this.maxBufferSize, MAX_READ_SIZE);

    const variables: MetadataVariable[] = [];
    if (subject.termType === 'Variable') {
      variables.push({ variable: subject, canBeUndef: false });
    }
    if (predicate.termType === 'Variable' && !variables.some(variable => variable.variable.equals(predicate))) {
      variables.push({ variable: predicate, canBeUndef: false });
    }
    if (object.termType === 'Variable' && !variables.some(variable => variable.variable.equals(object))) {
      variables.push({ variable: object, canBeUndef: false });
    }

    // The count is a native lookup of the same shape as the ones that fetch the results, so its duration is a
    // usable estimate of what a page of results costs. Without it the planner treats HDT as a free local source.
    const countStart = performance.now();
    this.hdtDocument.countTriples(subject, predicate, object)
      .then(({ totalCount, hasExactCount }) => {
        this.setProperty('metadata', {
          state: new MetadataValidationState(),
          cardinality: { type: hasExactCount ? 'exact' : 'estimate', value: totalCount },
          pageSize: this.pageSize,
          requestTime: performance.now() - countStart,
          variables,
        });
      })
      .catch(error => this.destroy(error));
  }

  public override _read(count: number, done: () => void): void {
    if ((<any> this.hdtDocument).closed) {
      this.close();
      return done();
    }
    this.hdtDocument.searchBindings(
      this.bindingsFactory,
      this.subject,
      this.predicate,
      this.object,
      { offset: this.position, limit: count },
    ).then((searchResult: HDT.BindingsResult) => {
      for (const b of searchResult.bindings) {
        this._push(b);
      }
      if (searchResult.bindings.length < count) {
        this.close();
      }
      done();
    })
      .catch((error: Error) => {
        this.emit('error', error);
        return done();
      });
    this.position += count;
  }
}
