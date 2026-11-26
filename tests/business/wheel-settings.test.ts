import { afterEach, expect, it } from 'vitest';
import { createPinia } from 'pinia';
import { useWheelLayout } from '../../src/input/wheel-layout';
import { DEFAULT_WHEELS } from '../../src/input/wheel';
import { nextTick } from 'vue';

afterEach(() => localStorage.clear());

it('keeps a changed wheel on this device and forgets it when restored to defaults', async () => {
  const layout = useWheelLayout(createPinia());
  layout.setSlot(0, 0, 'save-project');
  layout.addWheel();
  layout.setSlot(2, 4, 'help');
  await nextTick();
  const stored: unknown = JSON.parse(localStorage.getItem('woslicer.wheels') ?? 'null');
  expect(stored).toMatchObject({ version: 1 });
  // A new app start reads the stored layout.
  const reopened = useWheelLayout(createPinia());
  expect(reopened.wheels[0]?.[0]).toBe('save-project');
  expect(reopened.wheels).toHaveLength(3);
  expect(reopened.wheels[2]?.[4]).toBe('help');
  reopened.removeWheel(1);
  expect(reopened.wheels).toHaveLength(2);
  reopened.reset();
  await nextTick();
  expect(reopened.wheels).toEqual(DEFAULT_WHEELS);
  expect(localStorage.getItem('woslicer.wheels')).toBeNull();
});
