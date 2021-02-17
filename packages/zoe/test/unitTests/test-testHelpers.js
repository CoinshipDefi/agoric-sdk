// eslint-disable-next-line import/no-extraneous-dependencies
import '@agoric/install-ses';

import test from 'ava';

import { MathKind } from '@agoric/ertp';
import { assertAmountsEqual } from '../zoeTestHelpers';
import { setup } from './setupBasicMints';
import { setupNonFungible } from './setupNonFungibleMints';

function makeFakeT() {
  let message;
  let error;
  return harden({
    fail: msg => (error = msg),
    pass: msg => (message = msg),
    getError: () => error,
    getMessage: () => message,
  });
}

test('assertAmountsEqual - Nat dup', t => {
  const { moola } = setup();

  const fakeT = makeFakeT();
  assertAmountsEqual(fakeT, moola(0), moola(0));
  t.is(fakeT.getMessage(), 'values are equal');
  t.falsy(fakeT.getError());
});

test('assertAmountsEqual - Nat manual', t => {
  const {
    moola,
    moolaR: { brand: moolaBrand },
  } = setup();

  const fakeT = makeFakeT();
  assertAmountsEqual(fakeT, moola(0), { value: 0, brand: moolaBrand });
  t.is(fakeT.getMessage(), 'values are equal');
  t.falsy(fakeT.getError());
});

test('assertAmountsEqual - false Nat', t => {
  const { moola } = setup();
  const fakeT = makeFakeT();

  assertAmountsEqual(fakeT, moola(0), moola(1));
  t.is(fakeT.getError(), 'value (0) expected to equal 1');
});

test('assertAmountsEqual - Set', t => {
  const { createRpgItem, rpgItems } = setupNonFungible();

  const shinyHat = createRpgItem('hat', 'shiny');
  const shinyAmount = rpgItems(shinyHat);
  const fakeT = makeFakeT();
  assertAmountsEqual(fakeT, shinyAmount, shinyAmount, MathKind.SET);
  t.is(fakeT.getMessage(), 'values are equal');
  t.falsy(fakeT.getError());
});

test('assertAmountsEqual - false Set', t => {
  const { createRpgItem, rpgItems } = setupNonFungible();

  const shinyHat = createRpgItem('hat', 'shiny');
  const shinyAmount = rpgItems(shinyHat);
  const sparklyHat = createRpgItem('hat', 'sparkly');
  const sparklyAmount = rpgItems(sparklyHat);
  const fakeT = makeFakeT();
  assertAmountsEqual(fakeT, shinyAmount, sparklyAmount, MathKind.SET);
  t.is(
    fakeT.getError(),
    'value ([{"name":"hat","description":"hat","power":"shiny"}]) expected to equal [{"name":"hat","description":"hat","power":"sparkly"}]',
  );
});

test('assertAmountsEqual - StrSet dupe', t => {
  const { cryptoCats } = setupNonFungible();

  const felix = cryptoCats(harden(['Felix']));
  const fakeT = makeFakeT();
  assertAmountsEqual(fakeT, felix, felix, MathKind.STRING_SET);
  t.is(fakeT.getMessage(), 'values are equal');
  t.falsy(fakeT.getError());
});

test('assertAmountsEqual - StrSet copy', t => {
  const { cryptoCats } = setupNonFungible();

  const felix = cryptoCats(harden(['Felix']));
  const felixAgain = cryptoCats(harden(['Felix']));
  const fakeT = makeFakeT();
  assertAmountsEqual(fakeT, felix, felixAgain, MathKind.STRING_SET);
  t.is(fakeT.getMessage(), 'values are equal');
  t.falsy(fakeT.getError());
});

test('assertAmountsEqual - false StrSet', t => {
  const { cryptoCats } = setupNonFungible();

  const felix = cryptoCats(harden(['Felix']));
  const sylvester = cryptoCats(harden(['Sylvester']));
  const fakeT = makeFakeT();
  assertAmountsEqual(fakeT, felix, sylvester, MathKind.STRING_SET);
  t.is(fakeT.getError(), 'value (["Felix"]) expected to equal ["Sylvester"]');
});

test('assertAmountsEqual - brand mismatch', t => {
  const { moola, bucks } = setup();
  const fakeT = makeFakeT();
  assertAmountsEqual(fakeT, moola(0), bucks(0));
  t.is(
    fakeT.getError(),
    'brand ([Alleged: moola brand]) expected to equal [Alleged: bucks brand]',
  );
});

test('assertAmountsEqual - both mismatch', t => {
  const { moola } = setup();
  const { cryptoCats } = setupNonFungible();

  const fakeT = makeFakeT();
  assertAmountsEqual(fakeT, moola(0), cryptoCats(harden(['Garfield'])));
  t.is(
    fakeT.getError(),
    'Neither brand nor value matched: {"brand":{},"value":0}, {"brand":{},"value":["Garfield"]}',
  );
});
