import { afterEach, describe, expect, it, vi } from 'vitest';
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils';
import ElementPlus, { ElCheckbox, ElInput, ElInputNumber } from 'element-plus';
import { createI18n } from 'vue-i18n';
import en from '../../src/i18n/en.json';
import MarkerList from '../../src/slicing/MarkerList.vue';
import StatusBar from '../../src/app/components/StatusBar.vue';
import { useInputState } from '../../src/input/state';
import OutputPanel from '../../src/export/OutputPanel.vue';
import DetectionPanel from '../../src/detection/DetectionPanel.vue';
import DocumentOptions from '../../src/app/components/DocumentOptions.vue';
import { createEmptyProject } from '../../src/project/codec';
import { workspaceKey } from '../../src/workspace/workspace';
import { fixture, audioFile } from '../support/app';

const fixtures: ReturnType<typeof fixture>[] = [];
const wrappers: VueWrapper[] = [];
function setup() {
  const f = fixture();
  fixtures.push(f);
  const options = {
    global: {
      plugins: [
        f.pinia,
        ElementPlus,
        createI18n({ legacy: false, locale: 'en', messages: { en } }),
      ],
      provide: { [workspaceKey]: f.workspace },
    },
  };
  return { f, options };
}
afterEach(async () => {
  vi.restoreAllMocks();
  for (const wrapper of wrappers.splice(0)) wrapper.unmount();
  for (const f of fixtures.splice(0)) await f.dispose();
});

describe('editor panels with real Element Plus controls', () => {
  it('keeps document controls in sync across edits, undo, redo and document replacement', async () => {
    const { f, options } = setup();
    const toolbar = mount(DocumentOptions, options);
    const output = mount(OutputPanel, options);
    wrappers.push(toolbar, output);
    const toolbarFields = toolbar.findAllComponents(ElInputNumber);
    const outputFields = output.findAllComponents(ElInputNumber);
    const toolbarValues = () => toolbarFields.map((field) => field.props('modelValue'));
    const outputValues = () => outputFields.map((field) => field.props('modelValue'));
    const initialToolbar = toolbarValues();
    const initialOutput = outputValues();

    f.editor.setDocumentOptions({ bpm: 175, shift: 12, fadeoutMs: 25, noisegateDb: -18 });
    await flushPromises();
    expect(toolbarValues()).toEqual([175, 12, 25, -18]);
    expect(outputValues()).toEqual([25, -18, 1]);
    f.editor.undo();
    await flushPromises();
    expect(toolbarValues()).toEqual(initialToolbar);
    expect(outputValues()).toEqual(initialOutput);
    f.editor.redo();
    await flushPromises();
    expect(toolbarValues()).toEqual([175, 12, 25, -18]);
    expect(outputValues()).toEqual([25, -18, 1]);

    const fade = toolbarFields[2];
    const gate = outputFields[1];
    if (!fade || !gate) throw new Error('Missing document controls');
    fade.vm.$emit('update:modelValue', 40);
    gate.vm.$emit('update:modelValue', -24);
    await flushPromises();
    expect(toolbarValues()).toEqual([175, 12, 40, -24]);
    expect(outputValues()).toEqual([40, -24, 1]);

    const replacement = createEmptyProject();
    replacement.timing.bpm = 90;
    replacement.timing.shiftTicks = -6;
    replacement.tracks[0].slicing.fadeoutMs = 80;
    replacement.tracks[0].slicing.noisegateDb = -42;
    replacement.tracks[0].output.clipStartNumber = 7;
    f.editor.replaceDocument(replacement);
    await flushPromises();
    expect(toolbarValues()).toEqual([90, -6, 80, -42]);
    expect(outputValues()).toEqual([80, -42, 7]);
  });
  it('routes output controls through undoable document edits and reflects undo in the form', async () => {
    const { f, options } = setup();
    const wrapper = mount(OutputPanel, options);
    wrappers.push(wrapper);
    const input = wrapper.getComponent(ElInput);
    input.vm.$emit('update:modelValue', 'custom');
    await flushPromises();
    expect(f.editor.document.tracks[0].output.baseName).toBe('custom');
    f.workspace.actions.undo();
    await flushPromises();
    expect(input.props('modelValue')).toBe('slice');
    f.workspace.actions.redo();
    await flushPromises();
    expect(input.props('modelValue')).toBe('custom');
    input.vm.$emit('update:modelValue', '');
    await flushPromises();
    expect(f.editor.baseName).toBe('');
    f.workspace.actions.undo();
    expect(f.editor.baseName).toBe('custom');
    const checks = wrapper.findAllComponents(ElCheckbox);
    checks[0].vm.$emit('update:modelValue', false);
    await flushPromises();
    expect(f.editor.noisegateEnabled).toBe(false);
    f.workspace.actions.undo();
    await flushPromises();
    expect(checks[0].props('modelValue')).toBe(true);
    checks[1].vm.$emit('update:modelValue', true);
    await flushPromises();
    expect(f.editor.useFfNumbering).toBe(true);
    f.workspace.actions.undo();
    expect(f.editor.useFfNumbering).toBe(false);
    const numbers = wrapper.findAllComponents(ElInputNumber);
    numbers[2].vm.$emit('update:modelValue', 17);
    await flushPromises();
    expect(f.editor.clipStartNumber).toBe(17);
    f.workspace.actions.undo();
    expect(f.editor.clipStartNumber).toBe(1);
  });
  it('virtualizes large cut lists and selects a clicked cut', async () => {
    vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(640);
    const { f, options } = setup();
    f.editor.addTicks(Array.from({ length: 10000 }, (_, i) => i));
    const wrapper = mount(MarkerList, options);
    wrappers.push(wrapper);
    await flushPromises();
    expect(wrapper.findAll('.marker-row')).toHaveLength(26);
    await wrapper.findAll('.marker-row')[5].trigger('click');
    expect(f.editor.cursorTick).toBe(5);
    expect(f.editor.selectedTicks).toEqual([5]);
    await wrapper.findAll('.marker-row')[7].trigger('click', { ctrlKey: true });
    expect(f.editor.selectedTicks).toEqual([5, 7]);
    f.workspace.actions.clearMarkers();
    await flushPromises();
    expect(wrapper.findAll('.marker-row')).toHaveLength(0);
  });
  it('toggles cuts with ctrl and meta, freezes the playhead while playing, and numbers measures at 192 ticks', async () => {
    const { f, options } = setup();
    f.editor.setSource({
      name: 'example',
      reference: null,
      sampleRate: 48000,
      channels: 1,
      length: 48000,
      data: [new Int16Array(48000)],
      sourceFormat: { kind: 'pcm' as const, bits: 16 },
      floatData: [new Float32Array(48000)],
    });
    f.editor.addTicks([191, 192, 383]);
    const wrapper = mount(MarkerList, options);
    wrappers.push(wrapper);
    const rows = wrapper.findAll('.marker-row');
    // Tick 191 closes measure 1; tick 192 opens measure 2.
    expect(rows[0].text()).toContain('M1');
    expect(rows[0].text()).toContain('191');
    expect(rows[1].text()).toContain('M2');
    // Plain click replaces; Ctrl adds; Meta removes the already-selected tick.
    await rows[0].trigger('click');
    expect(f.editor.selectedTicks).toEqual([191]);
    await rows[1].trigger('click', { ctrlKey: true });
    expect(f.editor.selectedTicks).toEqual([191, 192]);
    await rows[1].trigger('click', { metaKey: true });
    expect(f.editor.selectedTicks).toEqual([191]);
    // The playhead only follows clicks while playback is stopped.
    f.editor.setPlaying(true);
    f.editor.setPlayheadSample(12345);
    await rows[2].trigger('click');
    expect(f.editor.cursorTick).toBe(383);
    expect(f.editor.playheadSample).toBe(12345);
    f.editor.setPlaying(false);
    await rows[2].trigger('click');
    expect(f.editor.playheadSample).not.toBe(12345);
  });
  it('links and unlinks points in the marker list and wraps track cells after eight tracks', async () => {
    const { f, options } = setup();
    // Track markers: tick 24 on two tracks, not linked.
    f.editor.sharedMarkers = false;
    f.editor.transact((draft) => {
      const second = structuredClone(draft.tracks[0]);
      second.trackId = 'second';
      draft.tracks.push(second);
    });
    f.editor.setTicks([24]);
    f.editor.selectTrack('second');
    f.editor.setTicks([24]);
    const wrapper = mount(MarkerList, options);
    wrappers.push(wrapper);
    await flushPromises();
    const links = () => f.editor.document.tracks.map((track) => track.slicing.links ?? []);
    const cell = (name: string) => wrapper.get(`[aria-label="${name}"]`);
    // A right click on a point links it with the other markers at its tick.
    await cell('1: marker').trigger('contextmenu');
    expect(links()).toEqual([[24], [24]]);
    // A right click on a linked point unlinks it.
    await cell('1: linked marker').trigger('contextmenu');
    expect(links()).toEqual([[], []]);
    // Left clicks pick points; a right click on a picked point links the picked points.
    await cell('1: marker').trigger('click');
    await cell('2: marker').trigger('click');
    expect(wrapper.findAll('.marker-cell.picked')).toHaveLength(2);
    await cell('2: marker').trigger('contextmenu');
    expect(links()).toEqual([[24], [24]]);
    // A double click picks every marker at the tick; a right click then unlinks them all.
    await cell('1: linked marker').trigger('dblclick');
    expect(wrapper.findAll('.marker-cell.picked')).toHaveLength(2);
    await cell('2: linked marker').trigger('contextmenu');
    expect(links()).toEqual([[], []]);
    // Ten tracks need two lines of cells, so rows grow from 32 px to 46 px.
    f.editor.transact((draft) => {
      for (let index = 3; index <= 10; index++) {
        const track = structuredClone(draft.tracks[0]);
        track.trackId = `track-${index}`;
        draft.tracks.push(track);
      }
    });
    await flushPromises();
    expect(wrapper.get('.marker-row').attributes('style')).toContain('height: 46px');
  });
  it('shows the actions of the area under the pointer, or the controller buttons, in the status bar', async () => {
    const { f, options } = setup();
    const area = document.createElement('div');
    area.dataset.hintArea = 'track';
    document.body.append(area);
    const wrapper = mount(StatusBar, { ...options, props: { identity: null } });
    wrappers.push(wrapper);
    area.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
    await flushPromises();
    const hints = wrapper.get('[role="note"]');
    expect(hints.text()).toContain('Right-click: track menu');
    expect(hints.text()).toContain('F2: Rename track');
    // Moving onto the status bar keeps the hints; an area without hints clears them.
    wrapper
      .get('.statusbar')
      .element.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
    await flushPromises();
    expect(wrapper.find('[role="note"]').exists()).toBe(true);
    document.body.dispatchEvent(new PointerEvent('pointerover', { bubbles: true }));
    await flushPromises();
    expect(wrapper.find('[role="note"]').exists()).toBe(false);
    // With a controller, the status bar shows the common controller buttons.
    useInputState(f.pinia).device = 'gamepad';
    await flushPromises();
    expect(wrapper.get('[role="note"]').attributes('aria-label')).toBe('Controller buttons');
    area.remove();
  });
  it('disables export without audio and exports real WAV bytes through its button', async () => {
    const { f, options } = setup();
    const wrapper = mount(OutputPanel, options);
    wrappers.push(wrapper);
    const button = wrapper.findAll('button').find((item) => item.text() === 'Export');
    if (!button) throw new Error('Missing export button');
    expect(button.attributes('disabled')).toBeDefined();
    await f.workspace.loadAudio(audioFile());
    f.workspace.actions.setMarker(0);
    await flushPromises();
    expect(button.attributes('disabled')).toBeUndefined();
    await button.trigger('click');
    await flushPromises();
    expect(f.exported).toHaveLength(1);
    expect(new TextDecoder().decode(f.exported[0].bytes.slice(0, 4))).toBe('RIFF');
  });
  it('keeps detection disabled without a source and performs real band analysis after load', async () => {
    const { f, options } = setup();
    const wrapper = mount(DetectionPanel, options);
    wrappers.push(wrapper);
    const button = wrapper.findAll('button').find((item) => item.text() === 'Detect');
    if (!button) throw new Error('Missing detect button');
    expect(button.attributes('disabled')).toBeDefined();
    await f.workspace.loadAudio(audioFile('short.wav', 4800));
    await flushPromises();
    expect(button.attributes('disabled')).toBeUndefined();
    await button.trigger('click');
    await flushPromises();
    expect(f.editor.bandAnalysis).not.toBeNull();
    expect(f.editor.bandBusy).toBe(false);
    expect(f.editor.bandEstimate).not.toBeNull();
  });
});
