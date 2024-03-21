import { Bus } from '@comunica/core';
import { ActorQuerySourceIdentifyHdt } from '../lib/ActorQuerySourceIdentifyHdt';

describe('ActorQuerySourceIdentifyHdt', () => {
  let bus: any;

  beforeEach(() => {
    bus = new Bus({ name: 'bus' });
  });

  describe('An ActorQuerySourceIdentifyHdt instance', () => {
    let actor: ActorQuerySourceIdentifyHdt;

    beforeEach(() => {
      actor = new ActorQuerySourceIdentifyHdt({ name: 'actor', bus });
    });

    it('should test', async() => {
      await expect(actor.test({ todo: true })).resolves.toEqual({ todo: true });
    });

    it('should run', async() => {
      await expect(actor.run({ todo: true })).resolves.toMatchObject({ todo: true });
    });
  });
});
