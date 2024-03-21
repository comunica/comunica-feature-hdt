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

/**
 * A comunica Hdt Query Source Identify Actor.
 */
export class ActorQuerySourceIdentifyHdt extends ActorQuerySourceIdentify {
  public readonly mediatorMergeBindingsContext: MediatorMergeBindingsContext;

  public constructor(args: IActorQuerySourceIdentifyHdtArgs) {
    super(args);
  }

  public async test(action: IActionQuerySourceIdentify): Promise<IActorTest> {
    const source = action.querySourceUnidentified;
    if (source.type !== undefined && source.type !== 'hdt') {
      throw new Error(`${this.name} requires a single query source with hdt type to be present in the context.`);
    }
    return true;
  }

  public async run(action: IActionQuerySourceIdentify): Promise<IActorQuerySourceIdentifyOutput> {
    return {
      querySource: {
        // eslint-disable-next-line capitalized-comments,style/spaced-comment
        source: <any> undefined, /* new QuerySourceHdt(
          action.querySourceUnidentified.value,
          await BindingsFactory.create(this.mediatorMergeBindingsContext, action.context),
        ),*/
        context: action.querySourceUnidentified.context ?? new ActionContext(),
      },
    };
  }
}

export interface IActorQuerySourceIdentifyHdtArgs extends IActorQuerySourceIdentifyArgs {
  /**
   * A mediator for creating binding context merge handlers
   */
  mediatorMergeBindingsContext: MediatorMergeBindingsContext;
}
