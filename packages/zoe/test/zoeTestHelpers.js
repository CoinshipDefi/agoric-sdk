import { E } from '@agoric/eventual-send';

import '../exported';
import strSetMathHelpers from '@agoric/ertp/src/mathHelpers/strSetMathHelpers';
import setMathHelpers from '@agoric/ertp/src/mathHelpers/setMathHelpers';
import { MathKind } from '@agoric/ertp';

import { q } from '@agoric/assert';

export const assertAmountsEqual = (
  t,
  amount,
  expected,
  mathKind = MathKind.NAT,
  label = '',
) => {
  const brandsEqual = amount.brand === expected.brand;
  let valuesEqual;
  switch (mathKind) {
    case MathKind.NAT:
      valuesEqual = amount.value === expected.value;
      break;
    case MathKind.STRING_SET:
      valuesEqual = strSetMathHelpers.doIsEqual(amount.value, expected.value);
      break;
    case MathKind.SET:
      valuesEqual = setMathHelpers.doIsEqual(amount.value, expected.value);
      break;
    default:
      valuesEqual = false;
  }

  const l = label ? `${label} ` : '';
  if (brandsEqual && !valuesEqual) {
    t.fail(
      `${l}value (${q(amount.value)}) expected to equal ${q(expected.value)}`,
    );
  } else if (!brandsEqual && valuesEqual) {
    t.fail(`${l}brand (${amount.brand}) expected to equal ${expected.brand}`);
  } else if (!brandsEqual && !valuesEqual) {
    t.fail(`${l}Neither brand nor value matched: ${q(amount)}, ${q(expected)}`);
  }

  // In tests with a fakeT, we'll get here even after failing, otherwise not.
  // assert pass() in case there are no other tests.
  t.pass(`values are equal`);
};

export const assertPayoutAmount = async (
  t,
  issuer,
  payout,
  expectedAmount,
  label = '',
) => {
  const amount = await issuer.getAmountOf(payout);
  const amountMathKind = issuer.getAmountMathKind();
  assertAmountsEqual(t, amount, expectedAmount, amountMathKind, label);
};

// Returns a promise that can be awaited in tests to ensure the check completes.
export const assertPayoutDeposit = (t, payout, purse, amount) => {
  return payout.then(payment => {
    E(purse)
      .deposit(payment)
      .then(payoutAmount =>
        assertAmountsEqual(t, payoutAmount, amount, MathKind.NAT, 'payout'),
      );
  });
};

export const assertOfferResult = (t, seat, expected, msg = expected) => {
  E(seat)
    .getOfferResult()
    .then(
      result => t.is(result, expected, msg),
      e => t.fail(`expecting offer result to be ${expected}, ${e}`),
    );
};

export const assertRejectedOfferResult = (
  t,
  seat,
  expected,
  msg = `offer result rejects as expected`,
) => t.throwsAsync(() => E(seat).getOfferResult(), expected, msg);
