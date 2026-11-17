import test from 'node:test';
import assert from 'node:assert/strict';
import { arrange, defaultSettings, beatsToTicks } from '../src/core/notes/arrangement.js';
import { groupSounds, sortSounds } from '../src/core/notes/sound-groups.js';
import type { SourceNote, Sound, SortKey } from '../src/core/notes/sound-groups.js';
const note = (
  sourceId: string,
  onset: number,
  duration: number,
  velocity = 70,
  pitch = 60,
): SourceNote => ({ sourceId, onset, duration, velocity, pitch });
test('defaults, timing conversion and grouped means preserve every association', () => {
  assert.deepEqual(defaultSettings(480), {
    resolution: 480,
    headMargin: 0,
    spacing: 480,
    durationTolerance: 60,
    velocityTolerance: 5,
    sort: ['pitch', 'duration', 'velocity'],
    numbering: 'extended',
    sharing: true,
    firstDefinition: 1,
    freeGap: 240,
    sourceCopy: false,
  });
  assert.equal(beatsToTicks(1.234, 480), 592);
  const input = [note('a', 0, 100), note('b', 1000, 104, 72)];
  const before = JSON.stringify(input);
  const r = arrange(input, { ...defaultSettings(480), durationTolerance: 10 });
  assert.equal(r.sounds.length, 1);
  assert.equal(r.sounds[0]?.duration, 102);
  assert.equal(r.sounds[0]?.velocity, 71);
  assert.equal(r.definitions.length, 1);
  assert.equal(r.assignments.length, 2);
  assert.equal(JSON.stringify(input), before);
});
test('recording placement, source-copy chronology and repeated use spacing', () => {
  const r = arrange([note('a', 0, 90), note('b', 1000, 150, 70, 61)], {
    ...defaultSettings(240),
    headMargin: 120,
  });
  assert.deepEqual(
    r.sounds.map((s) => s.onset),
    [120, 480],
  );
  const copy = arrange([note('b', 390, 10), note('a', 75, 10)], {
    ...defaultSettings(240),
    headMargin: 120,
    sourceCopy: true,
  });
  assert.deepEqual(
    copy.sounds.map((s) => s.onset),
    [195, 510],
  );
  const notes = [note('a', 0, 240), note('b', 240, 240)];
  for (const sharing of [true, false]) {
    const result = arrange(notes, { ...defaultSettings(480), freeGap: 120, sharing });
    assert.equal(result.sounds.length, 1);
    assert.equal(result.definitions.length, 2);
    assert.ok(result.definitions.every((d) => d.soundId === result.sounds[0]?.soundId));
  }
  const cyc = arrange(
    [note('a', 0, 100), note('b', 50, 100), note('c', 200, 100), note('d', 250, 100)],
    { ...defaultSettings(480), freeGap: 100 },
  );
  assert.equal(cyc.definitions.length, 2);
  assert.equal(cyc.assignments[0]?.definitionId, cyc.assignments[2]?.definitionId);
});
test('inclusive tolerances, deterministic broad ranges, no merging and stable priority sorting', () => {
  const grouped = groupSounds([note('a', 0, 100, 70), note('b', 1, 110, 75)], 10, 5);
  assert.equal(grouped.length, 1);
  const broad = groupSounds([note('a', 0, 100), note('b', 1, 120), note('bridge', 2, 110)], 10, 5);
  assert.deepEqual(
    broad.map((s) => s.sourceIds),
    [['a', 'bridge'], ['b']],
  );
  const sounds = groupSounds(
    [note('a', 0, 90, 70), note('b', 1, 100, 70), note('c', 2, 100, 80)],
    0,
    0,
  );
  assert.deepEqual(
    sortSounds(sounds, ['pitch', 'duration', 'velocity']).map((s) => s.sourceIds[0]),
    ['c', 'b', 'a'],
  );
  assert.deepEqual(
    sortSounds(sounds, []).map((s) => s.sourceIds[0]),
    ['a', 'b', 'c'],
  );
  assert.throws(() => arrange([note('a', -1, 10)], defaultSettings(480)));
});

test('odd-sum means truncate and retain both source associations', () => {
  const result = arrange([note('odd-a', 0, 100, 70), note('odd-b', 1000, 101, 71)], {
    ...defaultSettings(480),
    durationTolerance: 10,
    velocityTolerance: 5,
  });
  // The independent means are 100.5 ticks and 70.5 velocity units.
  assert.deepEqual(result.sounds, [
    {
      soundId: 0,
      onset: 0,
      pitch: 60,
      duration: 100,
      velocity: 70,
      sourceIds: ['odd-a', 'odd-b'],
    },
  ]);
  assert.deepEqual(result.definitions, [{ definitionId: 1, soundId: 0 }]);
  assert.deepEqual(result.assignments, [
    { sourceId: 'odd-a', definitionId: 1 },
    { sourceId: 'odd-b', definitionId: 1 },
  ]);
});

test('all six sort permutations resolve conflicting ranks and preserve full ties', () => {
  const sound = (
    id: number,
    label: string,
    pitch: number,
    duration: number,
    velocity: number,
  ): Sound => ({ soundId: id, sourceIds: [label], onset: 0, pitch, duration, velocity });
  // All eight combinations force comparisons at each of the three priorities.
  const sounds = [
    sound(7, 'h', 61, 200, 90),
    sound(0, 'a', 60, 100, 70),
    sound(5, 'f', 61, 100, 90),
    sound(2, 'c', 60, 200, 70),
    sound(1, 'b', 60, 100, 90),
    sound(6, 'g', 61, 200, 70),
    sound(3, 'd', 60, 200, 90),
    sound(4, 'e', 61, 100, 70),
  ];
  const cases: readonly { priorities: readonly SortKey[]; expected: readonly string[] }[] = [
    {
      priorities: ['pitch', 'duration', 'velocity'],
      expected: ['d', 'c', 'b', 'a', 'h', 'g', 'f', 'e'],
    },
    {
      priorities: ['pitch', 'velocity', 'duration'],
      expected: ['d', 'b', 'c', 'a', 'h', 'f', 'g', 'e'],
    },
    {
      priorities: ['duration', 'pitch', 'velocity'],
      expected: ['d', 'c', 'h', 'g', 'b', 'a', 'f', 'e'],
    },
    {
      priorities: ['duration', 'velocity', 'pitch'],
      expected: ['d', 'h', 'c', 'g', 'b', 'f', 'a', 'e'],
    },
    {
      priorities: ['velocity', 'pitch', 'duration'],
      expected: ['d', 'b', 'h', 'f', 'c', 'a', 'g', 'e'],
    },
    {
      priorities: ['velocity', 'duration', 'pitch'],
      expected: ['d', 'h', 'b', 'f', 'c', 'g', 'a', 'e'],
    },
  ];
  // IDs, labels and onsets deliberately disagree with established input order.
  const tied = [
    { ...sound(9, 'z', 60, 100, 70), onset: 200 },
    { ...sound(2, 'a', 60, 100, 70), onset: 0 },
    { ...sound(7, 'm', 60, 100, 70), onset: 100 },
  ];
  for (const { priorities, expected } of cases) {
    assert.deepEqual(
      sortSounds(sounds, priorities).map((s) => s.sourceIds[0]),
      expected,
      priorities.join('/'),
    );
    assert.deepEqual(
      sortSounds(tied, priorities).map((s) => s.soundId),
      [9, 2, 7],
      'full ties: ' + priorities.join('/'),
    );
  }
  assert.deepEqual(
    sortSounds(sounds, []).map((s) => s.sourceIds[0]),
    ['h', 'a', 'f', 'c', 'b', 'g', 'd', 'e'],
  );
});
