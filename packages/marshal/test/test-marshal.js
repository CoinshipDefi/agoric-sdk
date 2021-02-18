import '@agoric/install-ses';
import test from 'ava';
import {
  Remotable,
  Far,
  // Data,
  getInterfaceOf,
  makeMarshal,
  passStyleOf,
  REMOTE_STYLE,
} from '../src/marshal';

const { is, isFrozen, create, prototype: objectPrototype } = Object;

// this only includes the tests that do not use liveSlots

/**
 * A list of `[plain, encoding]` pairs, where plain serializes to the
 * stringification of `encoding`, which unserializes to something deepEqual
 * to `plain`.
 */
export const roundTripPairs = harden([
  // Simple JSON data encodes as itself
  [
    [1, 2],
    [1, 2],
  ],
  [{ foo: 1 }, { foo: 1 }],
  [
    { a: 1, b: 2 },
    { a: 1, b: 2 },
  ],
  [
    { a: 1, b: { c: 3 } },
    { a: 1, b: { c: 3 } },
  ],
  [true, true],
  [1, 1],
  ['abc', 'abc'],
  [null, null],

  // Scalars not represented in JSON
  [undefined, { '@qclass': 'undefined' }],
  [NaN, { '@qclass': 'NaN' }],
  [Infinity, { '@qclass': 'Infinity' }],
  [-Infinity, { '@qclass': '-Infinity' }],
  [4n, { '@qclass': 'bigint', digits: '4' }],
  // Does not fit into a number
  [9007199254740993n, { '@qclass': 'bigint', digits: '9007199254740993' }],
  // Well known supported symbols
  [Symbol.asyncIterator, { '@qclass': '@@asyncIterator' }],

  // Normal json reviver cannot make properties with undefined values
  [[undefined], [{ '@qclass': 'undefined' }]],
  [{ foo: undefined }, { foo: { '@qclass': 'undefined' } }],

  // errors
  [
    Error(),
    {
      '@qclass': 'error',
      message: '',
      name: 'Error',
    },
  ],
  [
    ReferenceError('msg'),
    {
      '@qclass': 'error',
      message: 'msg',
      name: 'ReferenceError',
    },
  ],

  // Hilbert hotel
  [
    { '@qclass': 8 },
    {
      '@qclass': 'hilbert',
      original: 8,
    },
  ],
  [
    { '@qclass': '@qclass' },
    {
      '@qclass': 'hilbert',
      original: '@qclass',
    },
  ],
  [
    { '@qclass': { '@qclass': 8 } },
    {
      '@qclass': 'hilbert',
      original: {
        '@qclass': 'hilbert',
        original: 8,
      },
    },
  ],
  [
    {
      '@qclass': {
        '@qclass': 8,
        foo: 'foo1',
      },
      bar: { '@qclass': undefined },
    },
    {
      '@qclass': 'hilbert',
      original: {
        '@qclass': 'hilbert',
        original: 8,
        rest: { foo: 'foo1' },
      },
      rest: {
        bar: {
          '@qclass': 'hilbert',
          original: { '@qclass': 'undefined' },
        },
      },
    },
  ],
]);

test('serialize unserialize round trip pairs', t => {
  const { serialize, unserialize } = makeMarshal(undefined, undefined, {
    // TODO errorTagging will only be recognized once we merge with PR #2437
    // We're turning it off only for the round trip test, not in general.
    errorTagging: 'off',
  });
  for (const [plain, encoded] of roundTripPairs) {
    const { body } = serialize(plain);
    const encoding = JSON.stringify(encoded);
    t.is(body, encoding);
    const decoding = unserialize({ body, slots: [] });
    t.deepEqual(decoding, plain);
    t.assert(isFrozen(decoding));
  }
});

test('serialize static data', t => {
  const m = makeMarshal();
  const ser = val => m.serialize(val);
  t.throws(() => ser([1, 2]), {
    message: /Cannot pass non-frozen objects like/,
  });
  // -0 serialized as 0
  t.deepEqual(ser(0), { body: '0', slots: [] });
  t.deepEqual(ser(-0), { body: '0', slots: [] });
  t.deepEqual(ser(-0), ser(0));
  // registered symbols
  t.throws(() => ser(Symbol.for('sym1')), { message: /Unsupported symbol/ });
  // unregistered symbols
  t.throws(() => ser(Symbol('sym2')), { message: /Unsupported symbol/ });
  // well known unsupported symbols
  t.throws(() => ser(Symbol.iterator), { message: /Unsupported symbol/ });

  t.deepEqual(ser(harden(Error())), {
    body:
      '{"@qclass":"error","errorId":"error:anon-marshal#1","message":"","name":"Error"}',
    slots: [],
  });

  t.deepEqual(ser(harden(ReferenceError('msg'))), {
    body:
      '{"@qclass":"error","errorId":"error:anon-marshal#2","message":"msg","name":"ReferenceError"}',
    slots: [],
  });

  const cd = ser(harden([1, 2]));
  t.is(isFrozen(cd), true);
  t.is(isFrozen(cd.slots), true);
});

test('unserialize static data', t => {
  const m = makeMarshal();
  const uns = body => m.unserialize({ body, slots: [] });

  const em1 = uns(
    '{"@qclass":"error","message":"msg","name":"ReferenceError"}',
  );
  t.truthy(em1 instanceof ReferenceError);
  t.is(em1.message, 'msg');
  t.truthy(isFrozen(em1));

  const em2 = uns('{"@qclass":"error","message":"msg2","name":"TypeError"}');
  t.truthy(em2 instanceof TypeError);
  t.is(em2.message, 'msg2');

  const em3 = uns('{"@qclass":"error","message":"msg3","name":"Unknown"}');
  t.truthy(em3 instanceof Error);
  t.is(em3.message, 'msg3');

  // should be frozen
  const arr = uns('[1,2]');
  t.truthy(isFrozen(arr));
  const a = uns('{"b":{"c":{"d": []}}}');
  t.truthy(isFrozen(a));
  t.truthy(isFrozen(a.b));
  t.truthy(isFrozen(a.b.c));
  t.truthy(isFrozen(a.b.c.d));
});

test('serialize ibid cycle', t => {
  const m = makeMarshal();
  const ser = val => m.serialize(val);
  const cycle = ['a', 'x', 'c'];
  cycle[1] = cycle;
  harden(cycle);

  t.deepEqual(ser(cycle), {
    body: '["a",{"@qclass":"ibid","index":0},"c"]',
    slots: [],
  });
});

test('forbid ibid cycle', t => {
  const m = makeMarshal();
  const uns = body => m.unserialize({ body, slots: [] });
  t.throws(() => uns('["a",{"@qclass":"ibid","index":0},"c"]'), {
    message: /Ibid cycle at 0/,
  });
});

test('unserialize ibid cycle', t => {
  const m = makeMarshal();
  const uns = body => m.unserialize({ body, slots: [] }, 'warnOfCycles');
  const cycle = uns('["a",{"@qclass":"ibid","index":0},"c"]');
  t.truthy(is(cycle[1], cycle));
});

test('serialize marshal ibids', t => {
  const m = makeMarshal();
  const ser = val => m.serialize(val);

  const cycle1 = {};
  cycle1['@qclass'] = cycle1;
  harden(cycle1);
  t.deepEqual(ser(cycle1), {
    body: '{"@qclass":"hilbert","original":{"@qclass":"ibid","index":0}}',
    slots: [],
  });

  const cycle2 = { '@qclass': 8 };
  cycle2.foo = cycle2;
  harden(cycle2);
  t.deepEqual(ser(cycle2), {
    body:
      '{"@qclass":"hilbert","original":8,"rest":{"foo":{"@qclass":"ibid","index":0}}}',
    slots: [],
  });
});

test('unserialize marshal ibids', t => {
  const m = makeMarshal();
  const uns = body => m.unserialize({ body, slots: [] }, 'allowCycles');

  const cycle1 = uns(
    '{"@qclass":"hilbert","original":{"@qclass":"ibid","index":0}}',
  );
  t.truthy(is(cycle1['@qclass'], cycle1));

  const cycle2 = uns(
    '{"@qclass":"hilbert","original":8,"rest":{"foo":{"@qclass":"ibid","index":0}}}',
  );
  t.truthy(is(cycle2.foo, cycle2));

  // No input serializes to the `impossible*`s but there's no reason not
  // to unserialize them.
  const impossible1 = uns(
    '{"bar":9,"foo":{"@qclass":"hilbert","original":8,"rest":{"@qclass":"ibid","index":0}}}',
  );
  t.deepEqual(impossible1, {
    bar: 9,
    foo: {
      '@qclass': 8,
      bar: 9,
    },
  });

  // The cyclic rest reference mixes in array nature from the cycle
  // resulting in an invalid pass-by-copy object. It is neither a
  // copyRecord nor a copyArray.
  // TODO this error should have been detected during unserialization.
  // See corresponding TODO in the code.
  const impossible2 = uns(
    '["x",{"@qclass":"hilbert","original":8,"rest":{"@qclass":"ibid","index":0}}]',
  );
  t.is(JSON.stringify(impossible2), '["x",{"0":"x","@qclass":8}]');
  t.is(impossible2[1].length, 1);
  t.throws(() => passStyleOf(impossible2[1]), {
    message: /Record fields must be enumerable: "length"/,
  });

  t.throws(
    () =>
      uns(
        '{"@qclass":"hilbert","original":8,"rest":{"@qclass":"ibid","index":0}}',
      ),
    { message: /Rest must not contain its own definition of "@qclass"/ },
  );
});

test('passStyleOf null is "null"', t => {
  t.assert(passStyleOf(null), 'null');
});

test('mal-formed @qclass', t => {
  const m = makeMarshal();
  const uns = body => m.unserialize({ body, slots: [] });
  t.throws(() => uns('{"@qclass": 0}'), { message: /invalid qclass/ });
});

test('Remotable/getInterfaceOf', t => {
  t.throws(
    () => Remotable({ bar: 29 }),
    { message: /unimplemented/ },
    'object ifaces are not implemented',
  );
  t.throws(
    () => Far('MyHandle', { foo: 123 }),
    { message: /cannot serialize/ },
    'non-function props are not implemented',
  );
  t.throws(
    () => Far('MyHandle', a => a + 1),
    { message: /cannot serialize/ },
    'function presences are not implemented',
  );

  t.is(getInterfaceOf('foo'), undefined, 'string, no interface');
  t.is(getInterfaceOf(null), undefined, 'null, no interface');
  t.is(
    getInterfaceOf(a => a + 1),
    undefined,
    'function, no interface',
  );
  t.is(getInterfaceOf(123), undefined, 'number, no interface');

  // Check that a handle can be created.
  const p = Far('MyHandle');
  harden(p);
  // console.log(p);
  t.is(getInterfaceOf(p), 'Alleged: MyHandle', `interface is MyHandle`);
  t.is(`${p}`, '[Alleged: MyHandle]', 'stringify is [MyHandle]');

  const p2 = Far('Thing', {
    name() {
      return 'cretin';
    },
    birthYear(now) {
      return now - 64;
    },
  });
  t.is(getInterfaceOf(p2), 'Alleged: Thing', `interface is Thing`);
  t.is(p2.name(), 'cretin', `name() method is presence`);
  t.is(p2.birthYear(2020), 1956, `birthYear() works`);

  // Remotables and Fars can be serialized, of course
  function convertValToSlot(_val) {
    return 'slot';
  }
  const m = makeMarshal(convertValToSlot);
  t.deepEqual(m.serialize(p2), {
    body: JSON.stringify({
      '@qclass': 'slot',
      iface: 'Alleged: Thing',
      index: 0,
    }),
    slots: ['slot'],
  });
});

const GOOD_PASS_STYLE = Symbol.for('passStyle');
const BAD_PASS_STYLE = Symbol('passStyle');

const goodRemotableProto = harden({
  [GOOD_PASS_STYLE]: REMOTE_STYLE,
  toString: Object, // Any function will do
  [Symbol.toStringTag]: 'Alleged: Good remotable proto',
});

const badRemotableProto1 = harden({
  [BAD_PASS_STYLE]: REMOTE_STYLE,
  toString: Object, // Any function will do
  [Symbol.toStringTag]: 'Alleged: Good remotable proto',
});
const badRemotableProto2 = harden({
  [GOOD_PASS_STYLE]: 'string',
  toString: Object, // Any function will do
  [Symbol.toStringTag]: 'Alleged: Good remotable proto',
});
const badRemotableProto3 = harden({
  [GOOD_PASS_STYLE]: REMOTE_STYLE,
  toString: {}, // Any function will do
  [Symbol.toStringTag]: 'Alleged: Good remotable proto',
});
const badRemotableProto4 = harden({
  [GOOD_PASS_STYLE]: REMOTE_STYLE,
  toString: Object, // Any function will do
  [Symbol.toStringTag]: 'Bad remotable proto',
});

const sub = sup => harden({ __proto__: sup });

test('getInterfaceOf validation', t => {
  t.is(getInterfaceOf(goodRemotableProto), undefined);
  t.is(getInterfaceOf(badRemotableProto1), undefined);
  t.is(getInterfaceOf(badRemotableProto2), undefined);
  t.is(getInterfaceOf(badRemotableProto3), undefined);
  t.is(getInterfaceOf(badRemotableProto4), undefined);

  t.is(
    getInterfaceOf(sub(goodRemotableProto)),
    'Alleged: Good remotable proto',
  );
  t.is(getInterfaceOf(sub(badRemotableProto1)), undefined);
  t.is(getInterfaceOf(sub(badRemotableProto2)), undefined);
  t.is(getInterfaceOf(sub(badRemotableProto3)), undefined);
  t.is(getInterfaceOf(sub(badRemotableProto4)), undefined);
});

const NON_METHOD = {
  message: /cannot serialize objects with non-methods like .* in .*/,
};
const TO_STRING_NONFUNC = {
  message: /toString must be a function/,
};
const IFACE_ALLEGED = {
  message: /For now, iface "Bad remotable proto" must be "Remotable" or begin with "Alleged: "; unimplemented/,
};
const UNEXPECTED_PROPS = {
  message: /Unexpected properties on Remotable Proto .*/,
};
const EXPECTED_PRESENCE = {
  message: /Expected "presence", not "string"/,
};

// Parallels the getInterfaceOf validation cases, explaining why
// each failure failed.
test('passStyleOf validation of remotables', t => {
  t.throws(() => passStyleOf(goodRemotableProto), NON_METHOD);
  t.throws(() => passStyleOf(badRemotableProto1), NON_METHOD);
  t.throws(() => passStyleOf(badRemotableProto2), NON_METHOD);
  t.throws(() => passStyleOf(badRemotableProto3), NON_METHOD);
  t.throws(() => passStyleOf(badRemotableProto4), NON_METHOD);

  t.is(passStyleOf(sub(goodRemotableProto)), REMOTE_STYLE);
  t.throws(() => passStyleOf(sub(badRemotableProto1)), UNEXPECTED_PROPS);
  t.throws(() => passStyleOf(sub(badRemotableProto2)), EXPECTED_PRESENCE);
  t.throws(() => passStyleOf(sub(badRemotableProto3)), TO_STRING_NONFUNC);
  t.throws(() => passStyleOf(sub(badRemotableProto4)), IFACE_ALLEGED);
});

test('records', t => {
  function convertValToSlot(_val) {
    return 'slot';
  }
  const presence = harden({});
  function convertSlotToVal(_slot) {
    return presence;
  }
  const m = makeMarshal(convertValToSlot, convertSlotToVal);
  const ser = val => m.serialize(val);
  const noIface = {
    body: JSON.stringify({ '@qclass': 'slot', index: 0 }),
    slots: ['slot'],
  };
  const yesIface = {
    body: JSON.stringify({
      '@qclass': 'slot',
      iface: 'Alleged: iface',
      index: 0,
    }),
    slots: ['slot'],
  };
  // const emptyData = { body: JSON.stringify({}), slots: [] };

  // For objects with Symbol-named properties
  const symEnumData = Symbol.for('symEnumData');
  const symEnumFunc = Symbol.for('symEnumFunc');
  const symNonenumData = Symbol.for('symNonenumData');
  const symNonenumFunc = Symbol.for('symNonenumFunc');
  const symNonenumGetFunc = Symbol.for('symNonenumGetFunc');

  function build(...opts) {
    const props = {};
    let mark;
    for (const opt of opts) {
      if (opt === 'enumStringData') {
        props.key1 = { enumerable: true, value: 'data' };
      } else if (opt === 'enumStringFunc') {
        props.enumStringFunc = { enumerable: true, value: () => 0 };
      } else if (opt === 'enumStringGetData') {
        props.enumStringGetData = { enumerable: true, get: () => 0 };
      } else if (opt === 'enumStringGetFunc') {
        props.enumStringGetFunc = { enumerable: true, get: () => () => 0 };
      } else if (opt === 'enumStringSet') {
        props.enumStringSet = { enumerable: true, set: () => undefined };
      } else if (opt === 'enumSymbolData') {
        props[symEnumData] = { enumerable: true, value: 2 };
      } else if (opt === 'enumSymbolFunc') {
        props[symEnumFunc] = { enumerable: true, value: () => 0 };
      } else if (opt === 'nonenumStringData') {
        props.nonEnumStringData = { enumerable: false, value: 3 };
      } else if (opt === 'nonenumStringFunc') {
        props.nonEnumStringFunc = { enumerable: false, value: () => 0 };
      } else if (opt === 'nonenumSymbolData') {
        props[symNonenumData] = { enumerable: false, value: 4 };
      } else if (opt === 'nonenumSymbolFunc') {
        props[symNonenumFunc] = { enumerable: false, value: () => 0 };
      } else if (opt === 'nonenumSymbolGetFunc') {
        props[symNonenumGetFunc] = { enumerable: false, get: () => () => 0 };
      } else if (opt === 'data') {
        mark = 'data';
      } else if (opt === 'far') {
        mark = 'far';
      } else {
        throw Error(`unknown option ${opt}`);
      }
    }
    const o = create(objectPrototype, props);
    // if (mark === 'data') {
    //   return Data(o);
    // }
    if (mark === 'far') {
      return Far('iface', o);
    }
    return harden(o);
  }

  function shouldThrow(opts, message = /XXX/) {
    t.throws(() => ser(build(...opts)), { message });
  }
  const CSO = /cannot serialize objects/;
  const NOACC = /Records must not contain accessors/;
  const RECENUM = /Record fields must be enumerable/;
  const NOMETH = /cannot serialize objects with non-methods/;

  // empty objects

  // rejected because it is not hardened
  t.throws(
    () => ser({}),
    { message: /Cannot pass non-frozen objects/ },
    'non-frozen data cannot be serialized',
  );

  // harden({})
  // old: pass-by-ref without complaint
  // interim1: pass-by-ref with warning
  // interim2: rejected
  // final: pass-by-copy without complaint
  t.deepEqual(ser(build()), noIface); // old+interim1
  // t.throws(() => ser(harden({})), { message: /??/ }, 'unmarked empty object rejected'); // int2
  // t.deepEqual(ser(build()), emptyData); // final

  // Data({})
  // old: not applicable, Data() not yet added
  // interim1: pass-by-copy without warning
  // interim2: pass-by-copy without warning
  // final: not applicable, Data() removed
  // t.deepEqual(build('data'), emptyData); // interim 1+2

  // Far('iface', {})
  // all cases: pass-by-ref
  t.deepEqual(ser(build('far')), yesIface);

  // Far('iface', {key: func})
  // all cases: pass-by-ref
  t.deepEqual(ser(build('far', 'enumStringFunc')), yesIface);
  t.deepEqual(ser(build('far', 'enumSymbolFunc')), yesIface);
  t.deepEqual(ser(build('far', 'nonenumStringFunc')), yesIface);
  t.deepEqual(ser(build('far', 'nonenumSymbolFunc')), yesIface);

  // { key: data }
  // all: pass-by-copy without warning
  t.deepEqual(ser(build('enumStringData')), {
    body: '{"key1":"data"}',
    slots: [],
  });

  // { key: func }
  // old: pass-by-ref without warning
  // interim1: pass-by-ref with warning
  // interim2: reject
  // final: reject
  t.deepEqual(ser(build('enumStringFunc')), noIface);
  t.deepEqual(ser(build('enumSymbolFunc')), noIface);
  t.deepEqual(ser(build('nonenumStringFunc')), noIface);
  t.deepEqual(ser(build('nonenumSymbolFunc')), noIface);

  // Data({ key: data, key: func }) : rejected
  // shouldThrow('data', 'enumStringData', 'enumStringFunc');

  // Far('iface', { key: data, key: func }) : rejected
  // (some day this might add auxilliary data, but not now
  shouldThrow(['far', 'enumStringData', 'enumStringFunc'], CSO);

  // anything with getters is rejected
  shouldThrow(['enumStringGetData'], NOACC);
  shouldThrow(['enumStringGetData', 'enumStringData'], NOACC);
  shouldThrow(['enumStringGetData', 'enumStringFunc'], CSO);
  shouldThrow(['enumStringGetFunc'], NOACC);
  shouldThrow(['enumStringGetFunc', 'enumStringData'], NOACC);
  shouldThrow(['enumStringGetFunc', 'enumStringFunc'], CSO);
  shouldThrow(['enumStringSet'], NOACC);
  shouldThrow(['enumStringSet', 'enumStringData'], NOACC);
  shouldThrow(['enumStringSet', 'enumStringFunc'], CSO);
  shouldThrow(['nonenumSymbolGetFunc'], CSO);
  shouldThrow(['nonenumSymbolGetFunc', 'enumStringData'], CSO);
  shouldThrow(['nonenumSymbolGetFunc', 'enumStringFunc'], CSO);

  // anything with symbols can only be a remotable
  shouldThrow(['enumSymbolData'], NOMETH);
  shouldThrow(['enumSymbolData', 'enumStringData'], NOMETH);
  shouldThrow(['enumSymbolData', 'enumStringFunc'], NOMETH);

  shouldThrow(['nonenumSymbolData'], NOMETH);
  shouldThrow(['nonenumSymbolData', 'enumStringData'], NOMETH);
  shouldThrow(['nonenumSymbolData', 'enumStringFunc'], NOMETH);

  // anything with non-enumerable properties is rejected
  shouldThrow(['nonenumStringData'], RECENUM);
  shouldThrow(['nonenumStringData', 'enumStringData'], RECENUM);
  shouldThrow(['nonenumStringData', 'enumStringFunc'], NOMETH);
});
