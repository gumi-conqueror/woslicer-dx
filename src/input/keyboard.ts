import type { AppCommand, CommandArgs, CommandResult } from '../app/commands';
import { keyBinding, type InputLayer } from './bindings';
import { keyOwnedByControl, visibleDialog } from './context';

interface KeyboardTarget {
  run<C extends AppCommand>(id: C, args?: CommandArgs<C>): Promise<CommandResult>;
  /** Opens the command wheel while the key with this code is held. */
  holdWheel?(code: string): void;
}

/** Editor keyboard input: focused controls and dialogs keep their own keys. */
export function handleKeyDown(
  event: KeyboardEvent,
  layer: InputLayer,
  target: KeyboardTarget,
): void {
  if (event.defaultPrevented || event.isComposing || event.key === 'Process') return;
  if (keyOwnedByControl(event.target, event.key) || visibleDialog()) return;
  const binding = keyBinding(event, layer);
  if (!binding?.command) return;
  event.preventDefault();
  const { command, args } = binding;
  if (command === 'open-wheel' && target.holdWheel) {
    if (!event.repeat) target.holdWheel(event.code || event.key);
    return;
  }
  // A held recording key places one marker; seeking keeps repeating.
  if (
    binding.layer === 'recording' &&
    event.repeat &&
    command !== 'seek-backward' &&
    command !== 'seek-forward'
  )
    return;
  if (command === 'recording-tap' && args)
    void target.run(command, { keys: args.keys, time: event.timeStamp });
  else void target.run(command);
}
