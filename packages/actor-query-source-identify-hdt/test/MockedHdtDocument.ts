import type * as RDF from '@rdfjs/types';
import type * as HDT from 'hdt';
import { DataFactory } from 'rdf-data-factory';

export class MockedHdtDocument implements HDT.Document {
  public closed = false;

  private readonly triples: RDF.BaseQuad[];
  private error: Error | undefined;

  public constructor(triples: RDF.BaseQuad[]) {
    this.triples = triples;
  }

  protected static triplesMatch(left: RDF.BaseQuad, right: RDF.BaseQuad): boolean {
    return MockedHdtDocument.termsMatch(left.subject, right.subject) &&
      MockedHdtDocument.termsMatch(left.predicate, right.predicate) &&
      MockedHdtDocument.termsMatch(left.object, right.object);
  }

  protected static termsMatch(left: RDF.Term, right: RDF.Term): boolean {
    return !left || left.termType === 'Variable' || !right || right.termType === 'Variable' || left.equals(right);
  }

  public async searchTriples(
    subject: RDF.Term,
    predicate: RDF.Term,
    object: RDF.Term,
    options: Record<string, any>,
  ): Promise<HDT.SearchResult> {
    if (this.error) {
      throw this.error;
    }
    const tripleIn = new DataFactory<RDF.BaseQuad>().quad(subject, predicate, object);
    const offset: number = options.offset || 0;
    const limit = Math.min(options.limit, this.triples.length);
    let i = 0;
    const triples: RDF.Quad[] = [];
    for (const triple of this.triples) {
      if (MockedHdtDocument.triplesMatch(tripleIn, triple)) {
        if (i >= offset && i < offset + limit) {
          triples.push(<RDF.Quad> triple);
        }
        i++;
      }
    }
    return { triples, totalCount: i, hasExactCount: true };
  }

  public async countTriples(subject?: RDF.Term, predicate?: RDF.Term, object?: RDF.Term): Promise<HDT.SearchResult> {
    if (this.error) {
      throw this.error;
    }
    const tripleIn = new DataFactory<RDF.BaseQuad>().quad(subject!, predicate!, object!);
    let i = 0;
    for (const triple of this.triples) {
      if (MockedHdtDocument.triplesMatch(tripleIn, triple)) {
        i++;
      }
    }
    return { triples: [], totalCount: i, hasExactCount: i > 1 };
  }

  public async searchLiterals(substring: string, opts?: HDT.SearchLiteralsOpts): Promise<HDT.SearchLiteralsResult> {
    return <any> undefined;
  }

  public searchTerms(opts?: HDT.SearchTermsOpts): Promise<string[]> {
    return <any> undefined;
  }

  public async close(): Promise<void> {
    this.closed = true;
  }

  public setError(error: Error): void {
    this.error = error;
  }

  public async readHeader(): Promise<string> {
    return <any> undefined;
  }

  public async changeHeader(triples: string, outputFile: string): Promise<HDT.Document> {
    return <any> undefined;
  }
}
