import type { ActorHttpInvalidateListenable } from '@comunica/bus-http-invalidate';
import { ActorQuerySourceIdentify } from '@comunica/bus-query-source-identify';
import { KeysInitQuery } from '@comunica/context-entries';
import { ActionContext, Bus } from '@comunica/core';
import type { IActionContext } from '@comunica/types';
import { DataFactory } from 'rdf-data-factory';
import { ActorQuerySourceIdentifyHdt } from '../lib/ActorQuerySourceIdentifyHdt';
import { QuerySourceHdt } from '../lib/QuerySourceHdt';
import 'jest-rdf';
import { MockedHdtDocument } from './MockedHdtDocument';
import '@comunica/utils-jest';

const mediatorMergeBindingsContext: any = {
  mediate(arg: any) {
    return {};
  },
};

const DF = new DataFactory();

describe('ActorQuerySourceIdentifyHdt', () => {
  let bus: any;
  let context: IActionContext;
  let httpInvalidator: ActorHttpInvalidateListenable;
  let listener: any = null;

  beforeEach(() => {
    bus = new Bus({ name: 'bus' });
    context = new ActionContext();
    const hdtDocument = new MockedHdtDocument([]);
    jest.spyOn(hdtDocument, 'close');
    // eslint-disable-next-line jest/no-mocks-import
    require('./__mocks__/hdt').__setMockedDocument(hdtDocument);
    httpInvalidator = <any>{
      addInvalidateListener: (l: any) => listener = l,
    };
  });

  describe('The ActorQuerySourceIdentifyHdt module', () => {
    it('should be a function', () => {
      expect(ActorQuerySourceIdentifyHdt).toBeInstanceOf(Function);
    });

    it('should be a ActorQuerySourceIdentifyHdt constructor', () => {
      expect(new (<any> ActorQuerySourceIdentifyHdt)({ name: 'actor', bus, httpInvalidator }))
        .toBeInstanceOf(ActorQuerySourceIdentifyHdt);
      expect(new (<any> ActorQuerySourceIdentifyHdt)({ name: 'actor', bus, httpInvalidator }))
        .toBeInstanceOf(ActorQuerySourceIdentify);
    });

    it('should not be able to create new ActorQuerySourceIdentifyHdt objects without \'new\'', () => {
      expect(() => {
        (<any> ActorQuerySourceIdentifyHdt)();
      }).toThrow(`Class constructor ActorQuerySourceIdentifyHdt cannot be invoked without 'new'`);
    });
  });

  describe('An ActorQuerySourceIdentifyHdt instance', () => {
    let actor: ActorQuerySourceIdentifyHdt;

    beforeEach(() => {
      actor = new ActorQuerySourceIdentifyHdt({
        name: 'actor',
        bus,
        httpInvalidator,
        mediatorMergeBindingsContext,
        maxBufferSize: 128,
      });
    });

    describe('test', () => {
      it('should test', async() => {
        await expect(actor.test({
          querySourceUnidentified: { type: 'hdt', value: 'path/' },
          context: new ActionContext(),
        })).resolves.toPassTestVoid();
      });

      it('should not test with sparql type', async() => {
        await expect(actor.test({
          querySourceUnidentified: { type: 'sparql', value: 'bla' },
          context: new ActionContext(),
        })).resolves.toFailTest(`actor requires a single query source with hdt type to be present in the context.`);
      });

      it('should not test with invalid source value', async() => {
        await expect(actor.test({
          querySourceUnidentified: { type: 'hdt', value: <any>{}},
          context: new ActionContext(),
        })).resolves.toFailTest(`actor received an invalid hdt query source.`);
      });
    });

    describe('run', () => {
      it('should get the source', async() => {
        const contextIn = new ActionContext({ [KeysInitQuery.dataFactory.name]: DF });
        const ret = await actor.run({
          querySourceUnidentified: { type: 'hdt', value: 'path/' },
          context: contextIn,
        });
        expect(ret.querySource.source).toBeInstanceOf(QuerySourceHdt);
        expect(ret.querySource.context).not.toBe(contextIn);
      });

      it('should get the source with context', async() => {
        const contextIn = new ActionContext({ [KeysInitQuery.dataFactory.name]: DF });
        const contextSource = new ActionContext();
        const ret = await actor.run({
          querySourceUnidentified: { type: 'hdt', value: 'path/', context: contextSource },
          context: contextIn,
        });
        expect(ret.querySource.source).toBeInstanceOf(QuerySourceHdt);
        expect(ret.querySource.context).not.toBe(contextIn);
        expect(ret.querySource.context).toBe(contextSource);
      });

      it('should get the same source', async() => {
        const contextIn = new ActionContext({ [KeysInitQuery.dataFactory.name]: DF });
        const ret1 = await actor.run({
          querySourceUnidentified: { type: 'hdt', value: 'path/' },
          context: contextIn,
        });
        const ret2 = await actor.run({
          querySourceUnidentified: { type: 'hdt', value: 'path/' },
          context: contextIn,
        });
        expect((<any> ret1.querySource.source).hdtDocument).toBe((<any> ret2.querySource.source).hdtDocument);
      });

      it('should get the same source after cache invalidation for one url', async() => {
        const contextIn = new ActionContext({ [KeysInitQuery.dataFactory.name]: DF });
        const ret1 = await actor.run({
          querySourceUnidentified: { type: 'hdt', value: 'path/' },
          context: contextIn,
        });
        listener({ url: 'x' });
        expect((<any> ret1.querySource.source).hdtDocument.close).toHaveBeenCalledTimes(0);
        const ret2 = await actor.run({
          querySourceUnidentified: { type: 'hdt', value: 'path/' },
          context: contextIn,
        });
        expect((<any> ret1.querySource.source).hdtDocument).toBe((<any> ret2.querySource.source).hdtDocument);
      });

      it('should get the same source after cache invalidation for all urls', async() => {
        const contextIn = new ActionContext({ [KeysInitQuery.dataFactory.name]: DF });
        const ret1 = await actor.run({
          querySourceUnidentified: { type: 'hdt', value: 'path/' },
          context: contextIn,
        });
        listener({});
        expect((<any> ret1.querySource.source).hdtDocument.close).toHaveBeenCalledTimes(1);
        const ret2 = await actor.run({
          querySourceUnidentified: { type: 'hdt', value: 'path/' },
          context: contextIn,
        });
        expect((<any> ret1.querySource.source).hdtDocument).toBe((<any> ret2.querySource.source).hdtDocument);
      });
    });

    describe('clearCache', () => {
      it('runs when no sources were created', async() => {
        await actor.clearCache();
      });

      it('runs when weakrefs are empty', async() => {
        (<any> actor).createdSources.push({
          deref: () => undefined,
        });
        await actor.clearCache();
        expect((<any> actor).createdSources).toEqual([]);
      });

      it('runs with created sources', async() => {
        const { querySource: { source: source1 }} = await actor.run({
          querySourceUnidentified: { type: 'hdt', value: 'path1/', context: new ActionContext() },
          context: new ActionContext({ [KeysInitQuery.dataFactory.name]: DF }),
        });
        const { querySource: { source: source2 }} = await actor.run({
          querySourceUnidentified: { type: 'hdt', value: 'path2/', context: new ActionContext() },
          context: new ActionContext({ [KeysInitQuery.dataFactory.name]: DF }),
        });

        const spy1 = jest.spyOn(<any> source1, 'dispose');
        const spy2 = jest.spyOn(<any> source2, 'dispose');

        await actor.clearCache();
        expect((<any> actor).createdSources).toEqual([]);

        expect(spy1).toHaveBeenCalledTimes(1);
        expect(spy2).toHaveBeenCalledTimes(1);
      });
    });
  });
});
