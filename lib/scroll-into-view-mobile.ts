const MOBILE_MAX_WIDTH_PX = 767;

export function scrollIntoViewIfMobile(
  el: HTMLElement | null | undefined,
  options?: ScrollIntoViewOptions,
): void {
  if (!el || typeof window === "undefined") return;
  if (!window.matchMedia(`(max-width: ${MOBILE_MAX_WIDTH_PX}px)`).matches) {
    return;
  }
  el.scrollIntoView(options);
}
