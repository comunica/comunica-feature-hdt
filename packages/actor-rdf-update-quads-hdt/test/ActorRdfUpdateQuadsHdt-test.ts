import { copyFileSync, existsSync, mkdtempSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ActorRdfUpdateQuads } from '@comunica/bus-rdf-update-quads';
import { KeysInitQuery, KeysRdfUpdateQuads } from '@comunica/context-entries';
import { ActionContext, Bus } from '@comunica/core';
import type { IActionContext } from '@comunica/types';
import type * as RDF from '@rdfjs/types';
import { ArrayIterator } from 'asynciterator';
import { HdtDocument } from 'hdt-js';
import { DataFactory } from 'rdf-data-factory';
import { ActorRdfUpdateQuadsHdt } from '../lib/ActorRdfUpdateQuadsHdt';
import { defaultGraphQuads } from '../lib/HdtQuadDestination';
import '@comunica/utils-jest';

const DF = new DataFactory();
const ASSETS = join(__dirname, 'assets');
const EX = 'http://example.org/';

async function quadsOf(path: string, options: { index?: false } = {}): Promise<string[]> {
  const document = await HdtDocument.fromFile(path, options);
  try {
    return (await document.match().toArray())
      .map(quad => `${quad.subject.value} ${quad.predicate.value} ${quad.object.value}`).sort();
  } finally {
    await document.close();
  }
}

describe('ActorRdfUpdateQuadsHdt', () => {
  let bus: any;
  let mediatorHttpInvalidate: any;
  let actor: ActorRdfUpdateQuadsHdt;
  let directory: string;
  let path: string;
  let original: string[];

  function contextFor(destination: any): IActionContext {
    return new ActionContext({
      [KeysInitQuery.dataFactory.name]: DF,
      [KeysRdfUpdateQuads.destination.name]: destination,
    });
  }

  async function update(
    insert?: RDF.Quad[],
    remove?: RDF.Quad[],
    graphs: Record<string, any> = {},
  ): Promise<void> {
    const { execute } = await actor.run({
      quadStreamInsert: insert && new ArrayIterator(insert, { autoStart: false }),
      quadStreamDelete: remove && new ArrayIterator(remove, { autoStart: false }),
      ...graphs,
      context: contextFor({ type: 'hdt', value: path }),
    });
    await execute();
  }

  beforeAll(async() => {
    original = await quadsOf(join(ASSETS, 'edge.hdt'), { index: false });
  });

  beforeEach(() => {
    bus = new Bus({ name: 'bus' });
    mediatorHttpInvalidate = { mediate: jest.fn(async() => ({})) };
    actor = new ActorRdfUpdateQuadsHdt({ name: 'actor', bus, mediatorHttpInvalidate });
    directory = mkdtempSync(join(tmpdir(), 'hdt-update-'));
    path = join(directory, 'edge.hdt');
    copyFileSync(join(ASSETS, 'edge.hdt'), path);
    copyFileSync(join(ASSETS, 'edge.hdt.index.v1-1'), `${path}.index.v1-1`);
  });

  it('should be a ActorRdfUpdateQuads actor', () => {
    expect(actor).toBeInstanceOf(ActorRdfUpdateQuadsHdt);
    expect(actor).toBeInstanceOf(ActorRdfUpdateQuads);
  });

  describe('test', () => {
    it.each([
      [ 'no destination', undefined ],
      [ 'a string destination', 'file.hdt' ],
      [ 'a store destination', { remove: () => {} }],
      [ 'a destination of another type', { type: 'sparql', value: 'file.hdt' }],
      [ 'a destination without string value', { type: 'hdt', value: {}}],
    ])('should fail on %s', async(_name, destination) => {
      await expect(actor.test(<any> { context: contextFor(destination) })).resolves
        .toFailTest('actor requires a destination with hdt type to be present in the context.');
    });

    it('should fail on remote files', async() => {
      await expect(actor.test(<any> { context: contextFor({ type: 'hdt', value: 'https://example.org/a.hdt' }) }))
        .resolves.toFailTest('actor can only update local HDT files.');
    });

    it('should pass on local files', async() => {
      await expect(actor.test(<any> { context: contextFor({ type: 'hdt', value: path }) })).resolves.toPassTestVoid();
    });
  });

  describe('run', () => {
    it('should delete and insert quads, and regenerate the index', async() => {
      const [ subject, predicate, object ] = [ 's1', 'p1', 'o1' ].map(name => `http://ex.org/${name}`);
      expect(original).toContain(`${subject} ${predicate} ${object}`);
      await update(
        [ DF.quad(DF.namedNode(`${EX}s`), DF.namedNode(`${EX}p`), DF.literal('o')) ],
        [
          DF.quad(DF.namedNode(subject), DF.namedNode(predicate), DF.namedNode(object)),
          DF.quad(DF.namedNode(subject), DF.namedNode(predicate), DF.namedNode(object), DF.namedNode(`${EX}g`)),
        ],
      );
      const expected = [
        ...original.filter(quad => quad !== `${subject} ${predicate} ${object}`),
        `${EX}s ${EX}p o`,
      ].sort();
      await expect(quadsOf(path, { index: false })).resolves.toEqual(expected);

      // The regenerated index is used for patterns without subject
      const document = await HdtDocument.fromFile(path, { generateIndex: false });
      expect((await document.match(null, DF.namedNode(`${EX}p`)).toArray()).map(quad => quad.subject.value))
        .toEqual([ `${EX}s` ]);
      await document.close();

      expect(mediatorHttpInvalidate.mediate).toHaveBeenCalledWith({ url: path, context: expect.anything() });
      expect(readdirSync(directory).sort()).toEqual([ 'edge.hdt', 'edge.hdt.index.v1-1' ]);
    });

    it('should only insert quads', async() => {
      await update([ DF.quad(DF.namedNode(`${EX}s`), DF.namedNode(`${EX}p`), DF.literal('o')) ]);
      await expect(quadsOf(path)).resolves.toEqual([ ...original, `${EX}s ${EX}p o` ].sort());
    });

    it('should not create an index if none exists, and replace legacy indexes', async() => {
      copyFileSync(`${path}.index.v1-1`, `${path}.index`);
      await update(undefined, []);
      expect(readdirSync(directory).sort()).toEqual([ 'edge.hdt', 'edge.hdt.index.v1-1' ]);

      const plain = join(directory, 'plain.hdt');
      copyFileSync(path, plain);
      const { execute } = await actor.run({
        quadStreamDelete: new ArrayIterator<RDF.Quad>([], { autoStart: false }),
        context: contextFor({ type: 'hdt', value: plain }),
      });
      await execute();
      expect(existsSync(`${plain}.index.v1-1`)).toBe(false);
      await expect(quadsOf(plain)).resolves.toEqual(original);
    });

    it('should not rewrite without quads', async() => {
      await update();
      expect(mediatorHttpInvalidate.mediate).not.toHaveBeenCalled();
    });

    it('should reject quads inserted in named graphs, and keep the file', async() => {
      await expect(update([
        DF.quad(DF.namedNode(`${EX}s`), DF.namedNode(`${EX}p`), DF.literal('o'), DF.namedNode(`${EX}g`)),
      ])).rejects.toThrow(`HDT files only have a default graph, but a quad was inserted in graph ${EX}g`);
      await expect(quadsOf(path)).resolves.toEqual(original);
      expect(readdirSync(directory).sort()).toEqual([ 'edge.hdt', 'edge.hdt.index.v1-1' ]);
      expect(mediatorHttpInvalidate.mediate).not.toHaveBeenCalled();
    });

    it('should reject missing files', async() => {
      path = join(directory, 'missing.hdt');
      await expect(update([])).rejects.toThrow('ENOENT');
    });

    it('should run updates of the same file one after another', async() => {
      const quad = (i: number): RDF.Quad => DF.quad(DF.namedNode(`${EX}s`), DF.namedNode(`${EX}p`), DF.literal(`${i}`));
      await Promise.all([
        update([ quad(1) ]),
        expect(update([ DF.quad(quad(0).subject, quad(0).predicate, quad(0).object, DF.namedNode(`${EX}g`)) ]))
          .rejects.toThrow('default graph'),
        update([ quad(2) ]),
        update(undefined, [ quad(1) ]),
      ]);
      await expect(quadsOf(path)).resolves.toEqual([ ...original, `${EX}s ${EX}p 2` ].sort());
    });

    it.each([
      [ 'all graphs', 'ALL' ],
      [ 'the default graph', DF.defaultGraph() ],
    ])('should delete %s', async(_name, graphs) => {
      await update(undefined, undefined, { deleteGraphs: { graphs, requireExistence: true, dropGraphs: true }});
      await expect(quadsOf(path)).resolves.toEqual([]);
    });

    it.each([
      [ 'named graphs', 'NAMED' ],
      [ 'a named graph', [ DF.namedNode(`${EX}g`) ]],
    ])('should not delete %s', async(_name, graphs) => {
      await update(undefined, undefined, { deleteGraphs: { graphs, requireExistence: true, dropGraphs: true }});
      await expect(quadsOf(path)).resolves.toEqual(original);
      expect(mediatorHttpInvalidate.mediate).not.toHaveBeenCalled();
    });

    it('should create graphs without changes', async() => {
      await update(undefined, undefined, {
        createGraphs: { graphs: [ DF.namedNode(`${EX}g`) ], requireNonExistence: true },
      });
      await expect(quadsOf(path)).resolves.toEqual(original);
    });

    it('should remove temporary files if writing the index fails', async() => {
      writeFileSync(`${path}.index`, '');
      jest.spyOn(HdtDocument.prototype, 'serializeIndex').mockImplementationOnce(async function* () {
        yield new Uint8Array(0);
        throw new Error('index failure');
      });
      await expect(update(undefined, [])).rejects.toThrow('index failure');
      expect(readdirSync(directory).sort()).toEqual([ 'edge.hdt', 'edge.hdt.index', 'edge.hdt.index.v1-1' ]);
    });
  });
});

describe('defaultGraphQuads', () => {
  it('should skip quads in named graphs', async() => {
    const quads = [
      DF.quad(DF.namedNode(`${EX}s`), DF.namedNode(`${EX}p`), DF.literal('o')),
      DF.quad(DF.namedNode(`${EX}s`), DF.namedNode(`${EX}p`), DF.literal('o'), DF.namedNode(`${EX}g`)),
    ];
    const result: RDF.Quad[] = [];
    for await (const quad of defaultGraphQuads(new ArrayIterator(quads), false)) {
      result.push(quad);
    }
    expect(result).toEqual([ quads[0] ]);
  });
});
