import { MetadataValidationState } from '@comunica/metadata';
import type * as RDF from '@rdfjs/types';
import type { BufferedIteratorOptions } from 'asynciterator';
import { BufferedIterator } from 'asynciterator';
import type * as HDT from 'hdt';

/**
 * Iterates over an HDT document in chunks for a triple pattern query.
 */
export class HdtIterator extends BufferedIterator<RDF.Quad> {
  protected readonly hdtDocument: HDT.Document;
  protected readonly subject: RDF.Term;
  protected readonly predicate: RDF.Term;
  protected readonly object: RDF.Term;

  protected position: number;

  public constructor(
    hdtDocument: HDT.Document,
    subject: RDF.Term,
    predicate: RDF.Term,
    object: RDF.Term,
    options: BufferedIteratorOptions,
  ) {
    super(options);
    this.hdtDocument = hdtDocument;
    this.subject = subject;
    this.predicate = predicate;
    this.object = object;
    this.position = 0;

    this.hdtDocument.countTriples(subject, predicate, object)
      .then(({ totalCount, hasExactCount }) => {
        this.setProperty('metadata', {
          state: new MetadataValidationState(),
          cardinality: { type: hasExactCount ? 'exact' : 'estimate', value: totalCount },
          canContainUndefs: false,
        });
      })
      .catch(error => this.destroy(error));
  }

  public override _read(count: number, done: () => void): void {
    if ((<any> this.hdtDocument).closed) {
      this.close();
      return done();
    }
    this.hdtDocument.searchTriples(this.subject, this.predicate, this.object, { offset: this.position, limit: count })
      .then((searchResult: HDT.SearchResult) => {
        for (const t of searchResult.triples) {
          this._push(t);
        }
        if (searchResult.triples.length < count) {
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
