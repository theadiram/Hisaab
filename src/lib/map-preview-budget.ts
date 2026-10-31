// Loading tiles and capturing a settled frame have different budgets. A slow
// renderer must not spend the capture budget before imagery is ready.
export function mapPreviewBudget(onTimeout: () => void) {
  let finished = false;
  let capture: ReturnType<typeof setTimeout> | undefined;
  const cancel = () => {
    finished = true;
    clearTimeout(loading);
    clearTimeout(capture);
  };
  const expire = () => {
    if (finished) return;
    cancel();
    onTimeout();
  };
  const loading = setTimeout(expire, 60_000);
  return {
    settled() {
      if (finished || capture !== undefined) return;
      capture = setTimeout(expire, 20_000);
    },
    cancel,
  };
}
