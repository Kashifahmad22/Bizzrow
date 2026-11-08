export function createLatestRequest() {
  let current = null;

  function cancel() {
    if (!current) return;
    current.abort();
    current = null;
  }

  return {
    start() {
      cancel();
      const controller = new AbortController();
      current = controller;
      return {
        signal: controller.signal,
        isCurrent: () => current === controller && !controller.signal.aborted,
      };
    },
    cancel,
  };
}
