import type { MetadataVariable } from '@comunica/types';
import { MetadataValidationState } from '@comunica/utils-metadata';
import type * as RDF from '@rdfjs/types';
import type { BufferedIteratorOptions } from 'asynciterator';
import { BufferedIterator } from 'asynciterator';
import type * as HDT from 'hdt';

/**
 * Iterates over an HDT document in chunks for a triple pattern query.
 */
export class HdtIterator extends BufferedIterator<RDF.Bindings> {
  protected readonly hdtDocument: HDT.Document;
  protected readonly bindingsFactory: RDF.BindingsFactory;
  protected readonly subject: RDF.Term;
  protected readonly predicate: RDF.Term;
  protected readonly object: RDF.Term;
  protected readonly pageSize: number;

  protected position: number;
  protected nextPageSize: number;

  public constructor(
    hdtDocument: HDT.Document,
    bindingsFactory: RDF.BindingsFactory,
    subject: RDF.Term,
    predicate: RDF.Term,
    object: RDF.Term,
    options: BufferedIteratorOptions & {
      /**
       * The number of triples to request from the HDT document in a single call.
       * Larger pages cost fewer seeks into the document, at the cost of reading further ahead.
       */
      pageSize?: number;
    },
  ) {
    super(options);
    this.pageSize = options.pageSize ?? 0;
    this.hdtDocument = hdtDocument;
    this.bindingsFactory = bindingsFactory;
    this.subject = subject;
    this.predicate = predicate;
    this.object = object;
    this.position = 0;
    this.nextPageSize = 0;

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

    this.hdtDocument.countTriples(subject, predicate, object)
      .then(({ totalCount, hasExactCount }) => {
        this.setProperty('metadata', {
          state: new MetadataValidationState(),
          cardinality: { type: hasExactCount ? 'exact' : 'estimate', value: totalCount },
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
    // Read a page instead of just the items that are needed right now.
    const limit = Math.max(count, Math.min(this.pageSize, this.nextPageSize));
    this.nextPageSize = limit * 2;
    this.hdtDocument.searchBindings(
      this.bindingsFactory,
      this.subject,
      this.predicate,
      this.object,
      { offset: this.position, limit },
    ).then((searchResult: HDT.BindingsResult) => {
      for (const b of searchResult.bindings) {
        this._push(b);
      }
      if (searchResult.bindings.length < limit) {
        this.close();
      }
      done();
    })
      .catch((error: Error) => {
        this.emit('error', error);
        return done();
      });
    this.position += limit;
  }
}
