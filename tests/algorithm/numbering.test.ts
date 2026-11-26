import { test } from 'vitest';
import assert from 'node:assert/strict';
import { stepId, formatId, renumber, markerNextId } from '../../src/core/formats/numbering';
import { assignDefinitions } from '../../src/core/notes/definition-assignment';
import { arrange, defaultSettings } from '../../src/core/notes/arrangement';

/** Reads a two-character base-36 number in the test text. */
const parseId = (text: string): number => parseInt(text, 36);
test('restricted numbering steps through hexadecimal digits and wraps after FF', () => {
  assert.equal(formatId(stepId(15, 1, 'restricted')), '10');
  assert.equal(formatId(stepId(parseId('FF'), 1, 'restricted')), '00');
  assert.equal(formatId(stepId(0, -1, 'restricted')), 'FF');
  assert.deepEqual(renumber([30, 900], 14, 'restricted'), [14, 15]);
});

test('extended numbering wraps after ZZ', () => {
  assert.equal(stepId(1295, 1, 'extended'), 0);
  assert.deepEqual(renumber([1295, 0], 1, 'extended'), [1, 2]);
});

test('formats numbers as two uppercase base-36 digits', () => {
  assert.deepEqual([0, 10, 36, 1295].map(formatId), ['00', '0A', '10', 'ZZ']);
});

test('marker clip numbers skip low digits G-Z only in restricted numbering', () => {
  assert.equal(markerNextId(parseId('0F'), 'restricted'), parseId('10'));
  assert.equal(markerNextId(parseId('FF'), 'restricted'), parseId('G0'));
  assert.equal(markerNextId(parseId('0F'), 'extended'), parseId('0G'));
});
test('approved restricted entry transitions', () => {
  const cases = [
    ['0G', '10', '0F'],
    ['0H', '10', 'F0'],
    ['0Z', '10', 'F0'],
    ['1Z', '20', '00'],
    ['FG', '00', 'FF'],
    ['FZ', '00', 'E0'],
    ['G0', '01', 'FF'],
    ['G1', '02', '00'],
    ['GF', '00', '0E'],
    ['GG', '00', '0F'],
    ['Z0', '01', '0F'],
    ['ZZ', '00', '00'],
  ] as const;
  for (const [input, forward, backward] of cases) {
    assert.equal(formatId(stepId(parseId(input), 1, 'restricted')), forward, input);
    assert.equal(formatId(stepId(parseId(input), -1, 'restricted')), backward, input);
  }
});

test('all restricted entries retain zero and compose directional steps', () => {
  for (let id = 0; id < 1296; id++) {
    assert.equal(stepId(id, 0, 'restricted'), id);
    assert.deepEqual(renumber([0], id, 'restricted'), [id]);
    for (const direction of [-1, 1]) {
      let successive = id;
      for (let count = 1; count <= 513; count++) {
        successive = stepId(successive, direction, 'restricted');
        assert.ok(Number.isInteger(successive) && successive >= 0 && successive < 1296);
        assert.equal(stepId(id, direction * count, 'restricted'), successive);
      }
    }
  }
});

test('invalid numeric identifiers and offsets retain rejection conventions', () => {
  for (const id of [-1, 0.5, NaN, Infinity, -Infinity, 1296]) {
    for (const mode of ['restricted', 'extended'] as const) {
      for (const offset of [-1, 0, 1]) {
        assert.throws(() => stepId(id, offset, mode), {
          name: 'RangeError',
          message: 'Invalid definition identifier',
        });
      }
      assert.throws(() => renumber([0], id, mode), RangeError);
    }
  }
  for (const delta of [0.5, NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => stepId(parseId('0Z'), delta, 'restricted'), {
      name: 'RangeError',
      message: 'Invalid step',
    });
  }
});

test('ordinary restricted cycle and extended offsets remain exhaustive', () => {
  const digits = '0123456789ABCDEF';
  const cycle = [...digits].flatMap((high) => [...digits].map((low) => parseId(high + low)));
  for (const [index, id] of cycle.entries()) {
    assert.equal(stepId(id, 1, 'restricted'), cycle[(index + 1) % 256]);
    assert.equal(stepId(id, -1, 'restricted'), cycle[(index + 255) % 256]);
    assert.equal(stepId(stepId(id, 1, 'restricted'), -1, 'restricted'), id);
    assert.equal(stepId(stepId(id, -1, 'restricted'), 1, 'restricted'), id);
    assert.equal(stepId(id, 256, 'restricted'), id);
    assert.equal(stepId(id, -256, 'restricted'), id);
  }
  for (let id = 0; id < 1296; id++) {
    for (const delta of [-2593, -1296, -1, 0, 1, 1296, 2593]) {
      assert.equal(stepId(id, delta, 'extended'), (((id + delta) % 1296) + 1296) % 1296);
    }
    const expectedMarker = (id + (id % 36 === 15 ? 21 : 1)) % 1296;
    assert.equal(markerNextId(id, 'restricted'), expectedMarker);
    assert.equal(markerNextId(id, 'extended'), (id + 1) % 1296);
  }
});

test('restricted lists and assignment consumers preserve associations and ordering', () => {
  const notes = [
    { sourceId: 'later', onset: 480, duration: 90, pitch: 62, velocity: 80 },
    { sourceId: 'earlier', onset: 0, duration: 60, pitch: 60, velocity: 70 },
  ];
  const sounds = [
    { soundId: 7, sourceIds: ['later'], onset: 900, duration: 90, pitch: 62, velocity: 80 },
    { soundId: 3, sourceIds: ['earlier'], onset: 100, duration: 60, pitch: 60, velocity: 70 },
  ];
  const before = structuredClone({ notes, sounds });
  for (const [start, expected] of [
    ['0Z', ['0Z', '10']],
    ['FG', ['FG', '00']],
  ] as const) {
    const ids = expected.map(parseId);
    assert.deepEqual(renumber([100, 900], parseId(start), 'restricted'), ids);
    const result = assignDefinitions(notes, sounds, false, 0, parseId(start), 'restricted');
    assert.deepEqual(result.definitions, [
      { definitionId: ids[0], soundId: 7 },
      { definitionId: ids[1], soundId: 3 },
    ]);
    assert.deepEqual(result.assignments, [
      { sourceId: 'later', definitionId: ids[0] },
      { sourceId: 'earlier', definitionId: ids[1] },
    ]);
    const shifted = result.definitions.map((d) => ({
      ...d,
      definitionId: stepId(d.definitionId, 1, 'restricted'),
    }));
    if (start === '0Z')
      assert.deepEqual(shifted, [
        { definitionId: parseId('10'), soundId: 7 },
        { definitionId: parseId('11'), soundId: 3 },
      ]);
    assert.deepEqual(
      result.definitions.map((d) => d.soundId),
      shifted.map((d) => d.soundId),
    );
  }
  assert.deepEqual({ notes, sounds }, before);
  const settings = { ...defaultSettings(480), sourceCopy: true, numbering: 'restricted' as const };
  const baseline = arrange(notes, { ...settings, firstDefinition: 0 });
  const entered = arrange(notes, { ...settings, firstDefinition: parseId('0Z') });
  assert.deepEqual(entered.sounds, baseline.sounds);
  assert.deepEqual(entered.definitions, [
    { definitionId: parseId('0Z'), soundId: 0 },
    { definitionId: parseId('10'), soundId: 1 },
  ]);
  assert.deepEqual(entered.assignments, [
    { sourceId: 'earlier', definitionId: parseId('0Z') },
    { sourceId: 'later', definitionId: parseId('10') },
  ]);
});

test('heterogeneous list shifts act independently and retain other data', () => {
  const list = ['0Z', 'FG', 'G1', 'ZZ', '0F'].map((id, index) => ({
    definitionId: parseId(id),
    soundId: 20 - index,
    label: 'sound-' + index,
  }));
  const before = structuredClone(list);
  for (const delta of [-513, -2, 0, 2, 513]) {
    const shifted = list.map((d) => ({
      ...d,
      definitionId: stepId(d.definitionId, delta, 'restricted'),
    }));
    let successive = structuredClone(list);
    for (let i = 0; i < Math.abs(delta); i++) {
      successive = successive.map((d) => ({
        ...d,
        definitionId: stepId(d.definitionId, Math.sign(delta), 'restricted'),
      }));
    }
    assert.deepEqual(shifted, successive);
    assert.deepEqual(
      shifted.map(({ soundId, label }) => ({ soundId, label })),
      list.map(({ soundId, label }) => ({ soundId, label })),
    );
  }
  assert.deepEqual(list, before);
});
