import { BindingsFactory } from '@comunica/bindings-factory';
import type { MediatorMergeBindingsContext } from '@comunica/bus-merge-bindings-context';
import type {
  IActionQuerySourceIdentify,
  IActorQuerySourceIdentifyOutput,
  IActorQuerySourceIdentifyArgs,
} from '@comunica/bus-query-source-identify';
import {
  ActorQuerySourceIdentify,
} from '@comunica/bus-query-source-identify';
import type { IActorTest } from '@comunica/core';
import { ActionContext } from '@comunica/core';
import * as HDT from 'hdt';
import { QuerySourceHdt } from './QuerySourceHdt';

/**
 * A comunica Hdt Query Source Identify Actor.
 */
export class ActorQuerySourceIdentifyHdt extends ActorQuerySourceIdentify {
  private createdSources: WeakRef<QuerySourceHdt>[] = [];

  public readonly mediatorMergeBindingsContext: MediatorMergeBindingsContext;
  public readonly maxBufferSize: number;

  public constructor(args: IActorQuerySourceIdentifyHdtArgs) {
    super(args);
  }

  public async test(action: IActionQuerySourceIdentify): Promise<IActorTest> {
    const source = action.querySourceUnidentified;
    if (source.type !== 'hdt') {
      throw new Error(`${this.name} requires a single query source with hdt type to be present in the context.`);
    }
    if (typeof source.value !== 'string') {
      throw new TypeError(`${this.name} received an invalid hdt query source.`);
    }
    return true;
  }

  public async run(action: IActionQuerySourceIdentify): Promise<IActorQuerySourceIdentifyOutput> {
    const path = <string> action.querySourceUnidentified.value;
    const source = new QuerySourceHdt(
      path,
      await HDT.fromFile(path),
      await BindingsFactory.create(this.mediatorMergeBindingsContext, action.context),
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

  public override async deinitialize(): Promise<any> {
    for (const source of this.createdSources) {
      await source.deref()?.dispose();
    }
    this.createdSources = [];
    return super.deinitialize();
  }
}

export interface IActorQuerySourceIdentifyHdtArgs extends IActorQuerySourceIdentifyArgs {
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
