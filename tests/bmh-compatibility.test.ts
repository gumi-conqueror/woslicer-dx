import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readBmh, writeBmh, type BmhNameChange } from '@gumi-conqueror/bmh-file';
import { createDivision, defaultDivisionSetting } from '../src/core/bmhelper.js';
const original = new Uint8Array(readFileSync('tests/fixtures/bmh/original.bmh'));

test('preserves pitch, controller lanes and multiple divisions verified by the original program', () => {
  const fixture = new Uint8Array(readFileSync('tests/fixtures/bmh/original-events.bmh'));
  const project = readBmh(original);
  project.source.pitches = [
    { position: 120, value: 2048 },
    { position: 960, value: -4096 },
  ];
  // Deliberately interleave lanes: original output orders by CC, then lane order.
  project.source.controls = [
    { position: 720, value: 100, cc: 7 },
    { position: 240, value: 64, cc: 1 },
    { position: 960, value: 0, cc: 1 },
  ];
  project.divisions.push(
    createDivision(project.source, {
      ...defaultDivisionSetting('copy', 480),
      srcCopy: true,
      headMargin: 240,
    }),
  );
  assert.deepEqual(writeBmh(project), fixture);
  const restored = readBmh(fixture);
  assert.deepEqual(restored.source.pitches, project.source.pitches);
  assert.deepEqual(restored.source.controls, [
    { position: 240, value: 64, cc: 1 },
    { position: 960, value: 0, cc: 1 },
    { position: 720, value: 100, cc: 7 },
  ]);
  assert.deepEqual(restored.divisions[1], project.divisions[1]);
  assert.deepEqual(writeBmh(restored), fixture);
});

test('matches original lossy CP932 conversion and reports changed names without mutating the project', () => {
  const project = readBmh(
    new Uint8Array(readFileSync('tests/fixtures/bmh/original-long-name.bmh')),
  );
  const name = 'A🎵B한C¥D〜E简F';
  project.divisions.push(createDivision(project.source, defaultDivisionSetting(name, 480)));
  const changes: BmhNameChange[] = [];
  assert.deepEqual(
    writeBmh(project, (change) => changes.push(change)),
    new Uint8Array(readFileSync('tests/fixtures/bmh/original-lossy-name.bmh')),
  );
  assert.deepEqual(changes, [{ original: name, exported: 'A??B?C\\D?E?F' }]);
  assert.equal(project.divisions[1].name, name);
});
