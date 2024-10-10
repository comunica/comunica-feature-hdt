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

  public constructor(args: IActorQuerySourceIdentifyHdtArgs) {
    super(args);
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
   * @default {<default_invalidator> a <npmd:@comunica/bus-http-invalidate/^4.0.0/components/ActorHttpInvalidateListenable.jsonld#ActorHttpInvalidateListenable>}
   */
  httpInvalidator: ActorHttpInvalidateListenable;
  /* eslint-enable max-len */
  /**
   * A mediator for creating binding context merge handlers
   */
  mediatorMergeBindingsContext: MediatorMergeBindingsContext;
  /**
   * The maximum number of triples that can be retrieved from HDT files in a single call.
   * @default {128}
   */
  maxBufferSize: number;
}
