import { createAudioProcessor, type AudioRequest } from './audio-jobs';

const process = createAudioProcessor();
// Queue requests: a decode must finish before dependent analysis or rendering.
let queue = Promise.resolve();
self.onmessage = (event: MessageEvent<AudioRequest>): void => {
  queue = queue.then(async () => {
    const reply = await process(event.data);
    // The worker keeps its PCM for later slices. Data only the page uses is moved,
    // not copied, so a long file does not stall the page while it receives the reply.
    if (reply.kind === 'slice') self.postMessage(reply, { transfer: [reply.bytes.buffer] });
    else if (reply.kind === 'decoded')
      self.postMessage(reply, {
        transfer: [
          ...reply.floatData.map((channel) => channel.buffer),
          ...reply.peaks.levels.flatMap((level) => [level.minMax.buffer, level.rms.buffer]),
        ],
      });
    else self.postMessage(reply);
  });
};
