import { MetadataValidationState } from '@comunica/utils-metadata';
import arrayifyStream from 'arrayify-stream';
import { DataFactory } from 'rdf-data-factory';
import { HdtIterator } from '../lib/HdtIterator';
import { MockedHdtDocument } from './MockedHdtDocument';

const quad = require('rdf-quad');

const DF = new DataFactory();

describe('HdtIterator', () => {
  let hdtDocument: any;

  beforeEach(() => {
    hdtDocument = new MockedHdtDocument([
      quad('s1', 'p1', 'o1'),
      quad('s1', 'p1', 'o2'),
      quad('s1', 'p2', 'o1'),
      quad('s1', 'p2', 'o2'),
      quad('s2', 'p1', 'o1'),
      quad('s2', 'p1', 'o2'),
      quad('s2', 'p2', 'o1'),
      quad('s2', 'p2', 'o2'),
    ]);
  });

  it('should be instantiatable', () => {
    expect(() => new HdtIterator(
      hdtDocument,
      DF.namedNode('s1'),
      DF.namedNode('p1'),
      DF.namedNode('o1'),
      { autoStart: false },
    )).not.toThrow();
  });

  it('should return the correct stream for ? ? ?', async() => {
    await expect(arrayifyStream(new HdtIterator(
      hdtDocument,
      DF.variable('s'),
      DF.variable('p'),
      DF.variable('o'),
      {},
    ))).resolves
      .toEqual([
        quad('s1', 'p1', 'o1'),
        quad('s1', 'p1', 'o2'),
        quad('s1', 'p2', 'o1'),
        quad('s1', 'p2', 'o2'),
        quad('s2', 'p1', 'o1'),
        quad('s2', 'p1', 'o2'),
        quad('s2', 'p2', 'o1'),
        quad('s2', 'p2', 'o2'),
      ]);
  });

  it('should return the correct stream for s1 ? ?', async() => {
    await expect(arrayifyStream(new HdtIterator(
      hdtDocument,
      DF.namedNode('s1'),
      DF.variable('p'),
      DF.variable('o'),
      {},
    ))).resolves
      .toEqual([
        quad('s1', 'p1', 'o1'),
        quad('s1', 'p1', 'o2'),
        quad('s1', 'p2', 'o1'),
        quad('s1', 'p2', 'o2'),
      ]);
  });

  it('should return the correct stream for ? p1 ?', async() => {
    await expect(arrayifyStream(new HdtIterator(
      hdtDocument,
      DF.variable('s'),
      DF.namedNode('p1'),
      DF.variable('o'),
      {},
    ))).resolves
      .toEqual([
        quad('s1', 'p1', 'o1'),
        quad('s1', 'p1', 'o2'),
        quad('s2', 'p1', 'o1'),
        quad('s2', 'p1', 'o2'),
      ]);
  });

  it('should return the correct stream for s1 p1 ?', async() => {
    await expect(arrayifyStream(new HdtIterator(
      hdtDocument,
      DF.namedNode('s1'),
      DF.namedNode('p1'),
      DF.variable('o'),
      {},
    ))).resolves
      .toEqual([
        quad('s1', 'p1', 'o1'),
        quad('s1', 'p1', 'o2'),
      ]);
  });

  it('should return the correct stream for ? p1 o1', async() => {
    await expect(arrayifyStream(new HdtIterator(
      hdtDocument,
      DF.variable('s'),
      DF.namedNode('p1'),
      DF.namedNode('o1'),
      {},
    ))).resolves
      .toEqual([
        quad('s1', 'p1', 'o1'),
        quad('s2', 'p1', 'o1'),
      ]);
  });

  it('should return the correct stream for s1 p1 o1', async() => {
    await expect(arrayifyStream(new HdtIterator(
      hdtDocument,
      DF.namedNode('s1'),
      DF.namedNode('p1'),
      DF.namedNode('o1'),
      {},
    ))).resolves
      .toEqual([
        quad('s1', 'p1', 'o1'),
      ]);
  });

  it('should not return anything when the document is closed', async() => {
    hdtDocument.close();
    await expect(arrayifyStream(new HdtIterator(
      hdtDocument,
      DF.variable('s'),
      DF.variable('p'),
      DF.variable('o'),
      {},
    ))).resolves
      .toEqual([]);
  });

  it('should resolve to an error if the document emits an error', async() => {
    const e = new Error('HdtIterator-test');
    hdtDocument.setError(e);
    await expect(arrayifyStream(new HdtIterator(
      hdtDocument,
      DF.variable('s'),
      DF.variable('p'),
      DF.variable('o'),
      {},
    )))
      .rejects.toBe(e);
  });

  it('should expose the metadata property', async() => {
    const it = new HdtIterator(
      hdtDocument,
      DF.variable('s'),
      DF.variable('p'),
      DF.variable('o'),
      { autoStart: false },
    );
    const metadata = await new Promise(resolve => it.getProperty('metadata', resolve));
    expect(metadata).toEqual({
      state: new MetadataValidationState(),
      cardinality: { type: 'exact', value: 8 },
      canContainUndefs: false,
    });
  });

  it('should expose the metadata property for non-exact count', async() => {
    const it = new HdtIterator(
      hdtDocument,
      DF.namedNode('s1'),
      DF.namedNode('p1'),
      DF.namedNode('o1'),
      { autoStart: false },
    );
    const metadata = await new Promise(resolve => it.getProperty('metadata', resolve));
    expect(metadata).toEqual({
      state: new MetadataValidationState(),
      cardinality: { type: 'estimate', value: 1 },
      canContainUndefs: false,
    });
  });
});
