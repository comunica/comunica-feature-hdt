import { ActionContext } from '@comunica/core';
import type { IActionContext } from '@comunica/types';
import { AlgebraFactory } from '@comunica/utils-algebra';
import { BindingsFactory } from '@comunica/utils-bindings-factory';
import { MetadataValidationState } from '@comunica/utils-metadata';
import type * as HDT from 'hdt';
import { DataFactory } from 'rdf-data-factory';
import { QuerySourceHdt } from '../lib/QuerySourceHdt';
import { MockedHdtDocument } from './MockedHdtDocument';
import '@comunica/utils-jest';

const DF = new DataFactory();
const BF = new BindingsFactory(DF);
const AF = new AlgebraFactory();

describe('QuerySourceHdt', () => {
  let hdtDocument: HDT.Document;
  let ctx: IActionContext;
  let source: QuerySourceHdt;

  beforeEach(() => {
    hdtDocument = new MockedHdtDocument([
      DF.quad(DF.namedNode('s1'), DF.namedNode('p'), DF.namedNode('o1')),
      DF.quad(DF.namedNode('s2'), DF.namedNode('p'), DF.namedNode('o2')),
      DF.quad(DF.namedNode('s3'), DF.namedNode('px'), DF.namedNode('o3')),
    ]);
    ctx = new ActionContext({});
    source = new QuerySourceHdt(
      'path',
      hdtDocument,
      DF,
      BF,
      128,
    );
  });

  describe('getSelectorShape', () => {
    it('should return a selector shape', async() => {
      await expect(source.getSelectorShape()).resolves.toEqual({
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
      });
    });
  });

  describe('getFilterFactor', () => {
    it('should return a string representation', async() => {
      await expect(source.getFilterFactor(ctx)).resolves.toBe(1);
    });
  });

  describe('toString', () => {
    it('should return a string representation', async() => {
      expect(source.toString()).toBe('QuerySourceHdt(path)');
    });
  });

  describe('queryQuads', () => {
    it('should throw', () => {
      expect(() => source.queryQuads(<any> undefined, ctx))
        .toThrow(`queryQuads is not implemented in QuerySourceHdt`);
    });

    describe('queryBindings', () => {
      it('should throw when passing non-pattern', async() => {
        expect(() => source.queryBindings(
          AF.createNop(),
          ctx,
        )).toThrow(`Attempted to pass non-pattern operation 'nop' to QuerySourceRdfJs`);
      });

      it('should return triples in the default graph', async() => {
        const data = source.queryBindings(
          AF.createPattern(DF.variable('s'), DF.namedNode('p'), DF.variable('o')),
          ctx,
        );
        await expect(data).toEqualBindingsStream([
          BF.fromRecord({
            s: DF.namedNode('s1'),
            o: DF.namedNode('o1'),
          }),
          BF.fromRecord({
            s: DF.namedNode('s2'),
            o: DF.namedNode('o2'),
          }),
        ]);
        await expect(new Promise(resolve => data.getProperty('metadata', resolve))).resolves
          .toEqual({
            cardinality: { type: 'exact', value: 2 },
            state: expect.any(MetadataValidationState),
            variables: [
              {
                variable: DF.variable('s'),
                canBeUndef: false,
              },
              {
                variable: DF.variable('o'),
                canBeUndef: false,
              },
            ],
          });
      });

      it('should not return triples in a named graph', async() => {
        const data = source.queryBindings(
          AF.createPattern(DF.variable('s'), DF.namedNode('p'), DF.variable('o'), DF.namedNode('g1')),
          ctx,
        );
        await expect(data).toEqualBindingsStream([]);
        await expect(new Promise(resolve => data.getProperty('metadata', resolve))).resolves
          .toEqual({
            cardinality: { type: 'exact', value: 0 },
            state: expect.any(MetadataValidationState),
            variables: [],
          });
      });
    });
  });

  describe('queryBoolean', () => {
    it('should throw', () => {
      expect(() => source.queryBoolean(<any> undefined, ctx))
        .toThrow(`queryBoolean is not implemented in QuerySourceHdt`);
    });
  });

  describe('queryVoid', () => {
    it('should throw', () => {
      expect(() => source.queryVoid(<any> undefined, ctx))
        .toThrow(`queryVoid is not implemented in QuerySourceHdt`);
    });
  });
});
