import type { MediatorHttpInvalidate } from '@comunica/bus-http-invalidate';
import type { IActionRdfUpdateQuads, IActorRdfUpdateQuadsArgs, IQuadDestination } from '@comunica/bus-rdf-update-quads';
import { ActorRdfUpdateQuadsDestination } from '@comunica/bus-rdf-update-quads';
import type { IActorTest, TestResult } from '@comunica/core';
import { failTest, passTestVoid } from '@comunica/core';
import type { IActionContext } from '@comunica/types';
import { getContextDestination } from '@comunica/utils-query-operation';
import { HdtQuadDestination } from './HdtQuadDestination';

/**
 * A comunica HDT RDF Update Quads Actor.
 *
 * Local HDT files are updated by rewriting them via hdt.js,
 * after which identified sources of the file are invalidated.
 */
export class ActorRdfUpdateQuadsHdt extends ActorRdfUpdateQuadsDestination {
  public readonly mediatorHttpInvalidate: MediatorHttpInvalidate;
  // The last update per file, so that updates of the same file run one after another
  private readonly updates = new Map<string, Promise<void>>();

  public constructor(args: IActorRdfUpdateQuadsHdtArgs) {
    super(args);
    this.mediatorHttpInvalidate = args.mediatorHttpInvalidate;
  }

  public override async test(action: IActionRdfUpdateQuads): Promise<TestResult<IActorTest>> {
    const destination = getContextDestination(action.context);
    if (!destination || typeof destination === 'string' || 'remove' in destination || destination.type !== 'hdt' ||
      typeof destination.value !== 'string') {
      return failTest(`${this.name} requires a destination with hdt type to be present in the context.`);
    }
    if (/^https?:\/\//u.test(destination.value)) {
      return failTest(`${this.name} can only update local HDT files.`);
    }
    return passTestVoid();
  }

  protected async getDestination(context: IActionContext): Promise<IQuadDestination> {
    const path = (<{ value: string }> getContextDestination(context)).value;
    return new HdtQuadDestination(
      path,
      task => this.lock(path, task),
      async() => {
        await this.mediatorHttpInvalidate.mediate({ url: path, context });
      },
    );
  }

  /**
   * Run a task once all earlier tasks for the same file have finished.
   */
  protected async lock(path: string, task: () => Promise<void>): Promise<void> {
    const previous = this.updates.get(path);
    const current = previous ? previous.catch(() => {}).then(task) : task();
    this.updates.set(path, current);
    try {
      await current;
    } finally {
      if (this.updates.get(path) === current) {
        this.updates.delete(path);
      }
    }
  }
}

export interface IActorRdfUpdateQuadsHdtArgs extends IActorRdfUpdateQuadsArgs {
  /**
   * The HTTP invalidate mediator, via which cached sources of updated files are invalidated.
   */
  mediatorHttpInvalidate: MediatorHttpInvalidate;
}
