import type { HidBackend, HidFilter } from './contracts';

export function createWebHid(filter: HidFilter): HidBackend {
  return {
    available: typeof navigator !== 'undefined' && 'hid' in navigator,
    async open(_id, receive, signal) {
      const selected = await navigator.hid.requestDevice({ filters: [filter] });
      signal.throwIfAborted();
      const device = selected.find(
        (item) =>
          item.vendorId === filter.vendorId &&
          item.productId === filter.productId &&
          item.collections.some(
            (collection) =>
              collection.usagePage === filter.usagePage && collection.usage === filter.usage,
          ),
      );
      if (!device) return null;
      if (!device.opened) await device.open();
      if (signal.aborted) {
        if (device.opened) await device.close();
        signal.throwIfAborted();
      }
      function report(event: HIDInputReportEvent): void {
        if (event.device === device)
          receive({
            kind: 'report',
            reportId: event.reportId,
            data: event.data,
            time: event.timeStamp,
          });
      }
      function disconnected(event: HIDConnectionEvent): void {
        if (event.device === device) {
          detach();
          receive({ kind: 'disconnected' });
        }
      }
      function detach(): void {
        device?.removeEventListener('inputreport', report);
        navigator.hid.removeEventListener('disconnect', disconnected);
      }
      device.addEventListener('inputreport', report);
      navigator.hid.addEventListener('disconnect', disconnected);
      return {
        async close() {
          detach();
          if (device.opened) await device.close();
        },
      };
    },
  };
}
