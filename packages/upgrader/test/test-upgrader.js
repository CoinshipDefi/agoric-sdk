// @ts-check
import '@agoric/install-ses';
import { E } from '@agoric/eventual-send';

import test from 'tape-promise/tape';
import { makeUpgraderKit } from '../src/index';

import '../src/types';

/**
 * @typedef {Object} Hello
 * @property {(name: string) => string} hello
 */

test('upgrader - wait until initialized', async t => {
  t.plan(3);
  /** @type {UpgraderKit<Hello>} */
  const { upgradableP: helloObj, upgrader } = makeUpgraderKit();

  const msgP = E(helloObj).hello('World');
  await upgrader.upgrade({
    async upgradeFromLast(lastInstance) {
      t.equals(lastInstance, undefined, `initial instance has no lastInstance`);
      return harden({
        hello(name) {
          return `Hello, ${name}!`;
        },
      });
    },
  });

  const msg = await msgP;
  t.equals(msg, `Hello, World!`, `delayed message is returned`);

  const msg2 = await E(helloObj).hello('foo');
  t.equals(msg2, `Hello, foo!`, `fresh message is forwarded`);
  t.end();
});

test('upgrader - upgrade twice', async t => {
  t.plan(5);
  /** @type {UpgraderKit<Hello>} */
  const { upgradableP: helloObj, upgrader } = makeUpgraderKit();

  const msgP = E(helloObj).hello('World');
  await upgrader.upgrade({
    async upgradeFromLast(lastInstance) {
      t.equals(lastInstance, undefined, `initial instance has no lastInstance`);
      return harden({
        hello(name) {
          return `Hello, ${name}!`;
        },
      });
    },
  });

  const msg = await msgP;
  t.equals(msg, `Hello, World!`, `delayed message is returned`);

  const msg2 = await E(helloObj).hello('foo');
  t.equals(msg2, `Hello, foo!`, `fresh message is forwarded`);

  const upP = upgrader.upgrade({
    async upgradeFromLast(lastInstance) {
      t.equals(lastInstance, undefined, `initial instance has no lastInstance`);
      return harden({
        hello(name) {
          return `Goodbye, ${name}!`;
        },
      });
    },
  });
  const msg3P = E(helloObj).hello('cruel World');

  await upP;
  const msg3 = await msg3P;
  t.equals(msg3, `Goodbye, cruel World!`, `upgraded message is returned`);

  t.end();
});