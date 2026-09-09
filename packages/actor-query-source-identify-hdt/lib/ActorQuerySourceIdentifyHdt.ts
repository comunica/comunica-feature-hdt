import type { ActorHttpInvalidateListenable, IActionHttpInvalidate } from '@comunica/bus-http-invalidate';
import type { MediatorMergeBindingsContext } from '@comunica/bus-merge-bindings-context';
import type {
  IActionQuerySourceIdentify,
  IActorQuerySourceIdentifyOutput,
  IActorQuerySourceIdentifyArgs,
} from '@comunica/bus-query-source-identify';
import {
  ActorQuerySourceIdentify,
} from '@comunica/bus-query-source-identify';
import { KeysInitQuery } from '@comunica/context-entries';
import type { IActorTest, TestResult } from '@comunica/core';
import { ActionContext, failTest, passTestVoid } from '@comunica/core';
import { BindingsFactory } from '@comunica/utils-bindings-factory';
import * as HDT from 'hdt';
import { QuerySourceHdt } from './QuerySourceHdt';

/**
 * A comunica Hdt Query Source Identify Actor.
 */
export class ActorQuerySourceIdentifyHdt extends ActorQuerySourceIdentify {
  public readonly httpInvalidator: ActorHttpInvalidateListenable;
  private createdSources: WeakRef<QuerySourceHdt>[] = [];

  public readonly mediatorMergeBindingsContext: MediatorMergeBindingsContext;
  public readonly maxBufferSize: number;
  public readonly pageSize: number;

  public constructor(args: IActorQuerySourceIdentifyHdtArgs) {
    super(args);
    this.httpInvalidator = args.httpInvalidator;
    this.mediatorMergeBindingsContext = args.mediatorMergeBindingsContext;
    this.maxBufferSize = args.maxBufferSize;
    this.pageSize = args.pageSize ?? 8192;
    this.httpInvalidator.addInvalidateListener(
      ({ url }: IActionHttpInvalidate) => {
        if (!url) {
          // eslint-disable-next-line ts/no-floating-promises
          this.clearCache();
        }
      },
    );
  }

  public async test(action: IActionQuerySourceIdentify): Promise<TestResult<IActorTest>> {
    const source = action.querySourceUnidentified;
    if (source.type !== 'hdt') {
      return failTest(`${this.name} requires a single query source with hdt type to be present in the context.`);
    }
    if (typeof source.value !== 'string') {
      return failTest(`${this.name} received an invalid hdt query source.`);
    }
    return passTestVoid();
  }

  public async run(action: IActionQuerySourceIdentify): Promise<IActorQuerySourceIdentifyOutput> {
    const dataFactory = action.context.getSafe(KeysInitQuery.dataFactory);
    const path = <string> action.querySourceUnidentified.value;
    const source = new QuerySourceHdt(
      path,
      await HDT.fromFile(path),
      dataFactory,
      await BindingsFactory.create(this.mediatorMergeBindingsContext, action.context, dataFactory),
      this.maxBufferSize,
      this.pageSize,
    );
    this.createdSources.push(new WeakRef(source));

    return {
      querySource: {
        source,
        context: action.querySourceUnidentified.context ?? new ActionContext(),
      },
    };
  }

  public async clearCache(): Promise<any> {
    for (const source of this.createdSources) {
      await source.deref()?.dispose();
    }
    this.createdSources = [];
  }
}

export interface IActorQuerySourceIdentifyHdtArgs extends IActorQuerySourceIdentifyArgs {
  /* eslint-disable max-len */
  /**
   * An actor that listens to HTTP invalidation events
   * @default {<default_invalidator> a <npmd:@comunica/bus-http-invalidate/^5.0.0/components/ActorHttpInvalidateListenable.jsonld#ActorHttpInvalidateListenable>}
   */
  httpInvalidator: ActorHttpInvalidateListenable;
  /* eslint-enable max-len */
  /**
   * A mediator for creating binding context merge handlers
   */
  mediatorMergeBindingsContext: MediatorMergeBindingsContext;
  /**
   * The number of bindings this actor's iterators buffer ahead of their consumer.
   * @default {128}
   */
  maxBufferSize: number;
  // TODO: make mandatory in next/major.
  /**
   * The number of triples to request from an HDT document in a single call.
   * Every call seeks to its offset inside the document, and for patterns with a bound predicate
   * that seek is linear in the offset, so small pages make a full traversal quadratic.
   * @range {integer}
   * @default {8192}
   */
  pageSize?: number;
}
