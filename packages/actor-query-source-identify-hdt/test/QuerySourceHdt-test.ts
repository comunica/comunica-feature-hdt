import { ActionContext } from '@comunica/core';
import type { IActionContext } from '@comunica/types';
import { AlgebraFactory } from '@comunica/utils-algebra';
import { BindingsFactory } from '@comunica/utils-bindings-factory';
import { MetadataValidationState } from '@comunica/utils-metadata';
import { ArrayIterator } from 'asynciterator';
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
        type: 'disjunction',
        children: [
          {
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
            joinBindings: true,
          },
          {
            type: 'operation',
            operation: { operationType: 'type', type: 'join' },
            joinBindings: true,
          },
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
        )).toThrow(`Attempted to pass non-pattern operation 'nop' to QuerySourceHdt`);
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

      it('should throw when passing an operation nested in a join that is not a pattern', () => {
        expect(() => source.queryBindings(
          AF.createJoin([
            AF.createPattern(DF.variable('s'), DF.namedNode('p'), DF.variable('o')),
            <any> AF.createNop(),
          ]),
          ctx,
        )).toThrow(`Attempted to pass non-pattern operation 'nop' to QuerySourceHdt`);
      });

      it('should join two patterns', async() => {
        const data = source.queryBindings(
          AF.createJoin([
            AF.createPattern(DF.variable('s'), DF.namedNode('p'), DF.variable('o')),
            AF.createPattern(DF.variable('s'), DF.namedNode('p'), DF.namedNode('o1')),
          ]),
          ctx,
        );
        await expect(data).toEqualBindingsStream([
          BF.fromRecord({ s: DF.namedNode('s1'), o: DF.namedNode('o1') }),
        ]);
      });

      it('should expose metadata for a join', async() => {
        const data = source.queryBindings(
          AF.createJoin([
            AF.createPattern(DF.variable('s'), DF.namedNode('p'), DF.variable('o')),
            AF.createPattern(DF.variable('s'), DF.namedNode('px'), DF.variable('o2')),
          ]),
          ctx,
        );
        await expect(new Promise(resolve => data.getProperty('metadata', resolve))).resolves
          .toEqual({
            // The smallest of the two patterns' cardinalities
            cardinality: { type: 'estimate', value: 1 },
            state: expect.any(MetadataValidationState),
            variables: [
              { variable: DF.variable('s'), canBeUndef: false },
              { variable: DF.variable('o'), canBeUndef: false },
              { variable: DF.variable('o2'), canBeUndef: false },
            ],
          });
      });

      it('should flatten nested joins', async() => {
        const data = source.queryBindings(
          AF.createJoin([
            AF.createJoin([
              AF.createPattern(DF.variable('s'), DF.namedNode('p'), DF.variable('o')),
              AF.createPattern(DF.variable('s'), DF.namedNode('p'), DF.namedNode('o2')),
            ]),
          ]),
          ctx,
        );
        await expect(data).toEqualBindingsStream([
          BF.fromRecord({ s: DF.namedNode('s2'), o: DF.namedNode('o2') }),
        ]);
      });

      it('should not return anything for a join touching a named graph', async() => {
        const data = source.queryBindings(
          AF.createJoin([
            AF.createPattern(DF.variable('s'), DF.namedNode('p'), DF.variable('o')),
            AF.createPattern(DF.variable('s'), DF.namedNode('p'), DF.variable('o2'), DF.namedNode('g1')),
          ]),
          ctx,
        );
        await expect(data).toEqualBindingsStream([]);
      });

      it('should error when the cardinalities behind a join can not be determined', async() => {
        const error = new Error('QuerySourceHdt-test count');
        (<any> hdtDocument).setError(error);
        const data = source.queryBindings(
          AF.createJoin([
            AF.createPattern(DF.variable('s'), DF.namedNode('p'), DF.variable('o')),
            AF.createPattern(DF.variable('s'), DF.namedNode('px'), DF.variable('o2')),
          ]),
          ctx,
        );
        await expect(data.toArray()).rejects.toThrow(error);
      });

      describe('with bindings joined in', () => {
        it('should join a single pattern against them', async() => {
          const data = source.queryBindings(
            AF.createPattern(DF.variable('s'), DF.namedNode('p'), DF.variable('o')),
            ctx,
            {
              joinBindings: {
                bindings: new ArrayIterator([
                  BF.fromRecord({ s: DF.namedNode('s2'), extra: DF.namedNode('e') }),
                ], { autoStart: false }),
                metadata: <any> { variables: [{ variable: DF.variable('s'), canBeUndef: false }]},
              },
            },
          );
          await expect(data).toEqualBindingsStream([
            BF.fromRecord({ s: DF.namedNode('s2'), o: DF.namedNode('o2'), extra: DF.namedNode('e') }),
          ]);
        });

        it('should join several patterns against them', async() => {
          const data = source.queryBindings(
            AF.createJoin([
              AF.createPattern(DF.variable('s'), DF.namedNode('p'), DF.variable('o')),
              AF.createPattern(DF.variable('s'), DF.variable('p2'), DF.variable('o')),
            ]),
            ctx,
            {
              joinBindings: {
                bindings: new ArrayIterator([
                  BF.fromRecord({ s: DF.namedNode('s1') }),
                  BF.fromRecord({ s: DF.namedNode('s3') }),
                ], { autoStart: false }),
                metadata: <any> { variables: [{ variable: DF.variable('s'), canBeUndef: false }]},
              },
            },
          );
          await expect(data).toEqualBindingsStream([
            BF.fromRecord({ s: DF.namedNode('s1'), o: DF.namedNode('o1'), p2: DF.namedNode('p') }),
          ]);
        });
      });

      describe('orderPatterns', () => {
        it('should put the smallest pattern first when nothing is bound', async() => {
          const patternSmall = AF.createPattern(DF.variable('a'), DF.namedNode('px'), DF.variable('b'));
          const patternLarge = AF.createPattern(DF.variable('c'), DF.namedNode('p'), DF.variable('d'));
          const { patterns } = await (<any> source).orderPatterns([ patternLarge, patternSmall ], []);
          expect(patterns).toEqual([ patternSmall, patternLarge ]);
        });

        it('should prefer a connected pattern over a smaller unconnected one', async() => {
          const connected = AF.createPattern(DF.variable('bound'), DF.namedNode('p'), DF.variable('x'));
          const smaller = AF.createPattern(DF.variable('y'), DF.namedNode('px'), DF.variable('z'));
          const { patterns } = await (<any> source).orderPatterns([ smaller, connected ], [ 'bound' ]);
          expect(patterns).toEqual([ connected, smaller ]);
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
