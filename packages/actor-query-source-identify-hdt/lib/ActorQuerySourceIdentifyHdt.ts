import { QuerySourceRdfJs } from '@comunica/actor-query-source-identify-rdfjs';
import type { MediatorHttp } from '@comunica/bus-http';
import type { ActorHttpInvalidateListenable, IActionHttpInvalidate } from '@comunica/bus-http-invalidate';
import type { MediatorMergeBindingsContext } from '@comunica/bus-merge-bindings-context';
import type {
  IActionQuerySourceIdentify,
  IActorQuerySourceIdentifyOutput,
  IActorQuerySourceIdentifyArgs,
} from '@comunica/bus-query-source-identify';
import { ActorQuerySourceIdentify } from '@comunica/bus-query-source-identify';
import { KeysInitQuery } from '@comunica/context-entries';
import type { IActorTest, TestResult } from '@comunica/core';
import { ActionContext, failTest, passTestVoid } from '@comunica/core';
import type { ComunicaDataFactory, IActionContext } from '@comunica/types';
import { BindingsFactory } from '@comunica/utils-bindings-factory';
import { HdtDocument } from 'hdt-js';

/**
 * A comunica HDT Query Source Identify Actor.
 *
 * HDT files can be local files, or remote files that are read via HTTP Range requests.
 * They are queried via the extended RDF/JS source interface of hdt.js.
 */
export class ActorQuerySourceIdentifyHdt extends ActorQuerySourceIdentify {
  public readonly httpInvalidator: ActorHttpInvalidateListenable;
  public readonly mediatorMergeBindingsContext: MediatorMergeBindingsContext;
  public readonly mediatorHttp: MediatorHttp;
  // Weak references, so that documents that are not used anymore can be garbage collected
  private documents: WeakRef<HdtDocument>[] = [];

  public constructor(args: IActorQuerySourceIdentifyHdtArgs) {
    super(args);
    this.httpInvalidator = args.httpInvalidator;
    this.mediatorMergeBindingsContext = args.mediatorMergeBindingsContext;
    this.mediatorHttp = args.mediatorHttp;
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
    const value = <string> action.querySourceUnidentified.value;
    const document = await this.openDocument(value, dataFactory, action.context);
    this.documents.push(new WeakRef(document));
    const source = new QuerySourceRdfJs(
      document,
      dataFactory,
      await BindingsFactory.create(this.mediatorMergeBindingsContext, action.context, dataFactory),
    );
    source.toString = () => `QuerySourceHdt(${value})`;
    source.referenceValue = value;
    return {
      querySource: {
        source,
        context: action.querySourceUnidentified.context ?? new ActionContext(),
      },
    };
  }

  /**
   * Open an HDT document from a local path, or from an HTTP(S) URL via the HTTP mediator.
   */
  protected openDocument(
    value: string,
    dataFactory: ComunicaDataFactory,
    context: IActionContext,
  ): Promise<HdtDocument> {
    if (/^https?:\/\//u.test(value)) {
      return HdtDocument.fromUrl(value, {
        dataFactory,
        fetch: (input, init) => this.mediatorHttp.mediate({ input: <RequestInfo> input, init, context }),
      });
    }
    return HdtDocument.fromFile(value, { dataFactory });
  }

  /**
   * Close all opened documents that are still in use.
   */
  public async clearCache(): Promise<void> {
    const documents = this.documents;
    this.documents = [];
    await Promise.all(documents.map(document => document.deref()?.close()));
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
   * The HTTP mediator, via which the Range requests of remote HDT files are performed.
   */
  mediatorHttp: MediatorHttp;
}
