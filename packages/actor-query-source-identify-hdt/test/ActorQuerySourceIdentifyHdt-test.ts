import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { QuerySourceRdfJs } from '@comunica/actor-query-source-identify-rdfjs';
import type { ActorHttpInvalidateListenable } from '@comunica/bus-http-invalidate';
import { ActorQuerySourceIdentify } from '@comunica/bus-query-source-identify';
import { KeysInitQuery } from '@comunica/context-entries';
import { ActionContext, Bus } from '@comunica/core';
import type { BindingsStream, IActionContext } from '@comunica/types';
import { AlgebraFactory } from '@comunica/utils-algebra';
import { DataFactory } from 'rdf-data-factory';
import { ActorQuerySourceIdentifyHdt } from '../lib/ActorQuerySourceIdentifyHdt';
import '@comunica/utils-jest';

const DF = new DataFactory();
const AF = new AlgebraFactory(DF);
const PATH = join(__dirname, 'assets', 'edge.hdt');
const BYTES = readFileSync(PATH);
const URL = 'https://example.org/edge.hdt';

const mediatorMergeBindingsContext: any = {
  mediate: () => ({}),
};

/**
 * An HTTP mediator that serves the test file with support for Range requests.
 */
function createMediatorHttp(): any {
  return {
    mediate: jest.fn(async({ input, init }: { input: string; init?: RequestInit }) => {
      const range = (<Record<string, string>> init?.headers ?? {}).range;
      if (input !== URL) {
        return new Response(null, { status: 404 });
      }
      const match = /bytes=(\d+)-(\d+)/u.exec(range ?? '');
      if (!match) {
        return new Response(BYTES, { status: 200 });
      }
      const start = Number(match[1]);
      const end = Math.min(Number(match[2]), BYTES.length - 1);
      return new Response(BYTES.subarray(start, end + 1), {
        status: 206,
        headers: { 'content-range': `bytes ${start}-${end}/${BYTES.length}` },
      });
    }),
  };
}

async function subjects(stream: BindingsStream): Promise<string[]> {
  return (await stream.toArray()).map(bindings => bindings.get('s')!.value).sort();
}

describe('ActorQuerySourceIdentifyHdt', () => {
  let bus: any;
  let httpInvalidator: ActorHttpInvalidateListenable;
  let listener: any;

  beforeEach(() => {
    bus = new Bus({ name: 'bus' });
    httpInvalidator = <any> {
      addInvalidateListener: (l: any) => listener = l,
    };
  });

  describe('The ActorQuerySourceIdentifyHdt module', () => {
    it('should be a ActorQuerySourceIdentifyHdt constructor', () => {
      expect(new (<any> ActorQuerySourceIdentifyHdt)({ name: 'actor', bus, httpInvalidator }))
        .toBeInstanceOf(ActorQuerySourceIdentify);
    });
  });

  describe('An ActorQuerySourceIdentifyHdt instance', () => {
    let actor: ActorQuerySourceIdentifyHdt;
    let mediatorHttp: any;
    let context: IActionContext;

    beforeEach(() => {
      mediatorHttp = createMediatorHttp();
      actor = new ActorQuerySourceIdentifyHdt({
        name: 'actor',
        bus,
        httpInvalidator,
        mediatorMergeBindingsContext,
        mediatorHttp,
      });
      context = new ActionContext({ [KeysInitQuery.dataFactory.name]: DF });
    });

    describe('test', () => {
      it('should test', async() => {
        await expect(actor.test({
          querySourceUnidentified: { type: 'hdt', value: 'path' },
          context,
        })).resolves.toPassTestVoid();
      });

      it('should not test with sparql type', async() => {
        await expect(actor.test({
          querySourceUnidentified: { type: 'sparql', value: 'bla' },
          context,
        })).resolves.toFailTest(`actor requires a single query source with hdt type to be present in the context.`);
      });

      it('should not test with invalid source value', async() => {
        await expect(actor.test({
          querySourceUnidentified: { type: 'hdt', value: <any> {}},
          context,
        })).resolves.toFailTest(`actor received an invalid hdt query source.`);
      });
    });

    describe('run', () => {
      const pattern = AF.createPattern(
        DF.variable('s'),
        DF.namedNode('http://ex.org/p1'),
        DF.variable('o'),
        DF.defaultGraph(),
      );

      it('should get a source for a local file', async() => {
        const { querySource } = await actor.run({ querySourceUnidentified: { type: 'hdt', value: PATH }, context });
        expect(querySource.source).toBeInstanceOf(QuerySourceRdfJs);
        expect(querySource.source.referenceValue).toBe(PATH);
        expect(querySource.source.toString()).toBe(`QuerySourceHdt(${PATH})`);
        expect(querySource.context).not.toBe(context);
        await expect(subjects(querySource.source.queryBindings(pattern, context))).resolves
          .toEqual([ 'b1', 'http://ex.org/o1', 'http://ex.org/s1', 'http://ex.org/s1' ]);
        expect(mediatorHttp.mediate).not.toHaveBeenCalled();
      });

      it('should get a source for a URL via the HTTP mediator', async() => {
        const { querySource } = await actor.run({ querySourceUnidentified: { type: 'hdt', value: URL }, context });
        await expect(subjects(querySource.source.queryBindings(pattern, context))).resolves
          .toEqual([ 'b1', 'http://ex.org/o1', 'http://ex.org/s1', 'http://ex.org/s1' ]);
        const range = expect.objectContaining({ range: expect.stringMatching(/^bytes=/u) });
        expect(mediatorHttp.mediate).toHaveBeenCalledWith(expect.objectContaining({
          input: URL,
          init: expect.objectContaining({ headers: range }),
          context,
        }));
      });

      it('should keep the context of the source', async() => {
        const sourceContext = new ActionContext();
        const { querySource } = await actor.run({
          querySourceUnidentified: { type: 'hdt', value: PATH, context: sourceContext },
          context,
        });
        expect(querySource.context).toBe(sourceContext);
      });

      it('should reject for files that do not exist', async() => {
        await expect(actor.run({ querySourceUnidentified: { type: 'hdt', value: `${PATH}.missing` }, context }))
          .rejects.toThrow('ENOENT');
      });
    });

    describe('clearCache', () => {
      it('closes opened documents when all URLs are invalidated', async() => {
        const { querySource } = await actor.run({ querySourceUnidentified: { type: 'hdt', value: PATH }, context });
        const document = (<any> querySource.source).source;
        const close = jest.spyOn(document, 'close');
        listener({ url: 'x' });
        expect(close).not.toHaveBeenCalled();
        listener({});
        expect(close).toHaveBeenCalledTimes(1);
      });

      it('ignores documents that were garbage collected', async() => {
        (<any> actor).documents.push({ deref: () => undefined });
        await expect(actor.clearCache()).resolves.toBeUndefined();
      });
    });
  });
});
