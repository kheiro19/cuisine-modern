// jsdom is not a browser: the few APIs a React UI silently assumes are provided here, so a component can mount.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
(globalThis as any).ResizeObserver = (globalThis as any).ResizeObserver ?? ResizeObserverStub;

if (!(globalThis as any).matchMedia) {
  (globalThis as any).matchMedia = () => ({
    matches: false, media: '', onchange: null,
    addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {}, dispatchEvent: () => false,
  });
}

// jsdom has no canvas 2D/WebGL: enough for a component that asks, without pretending to draw.
if (typeof HTMLCanvasElement !== 'undefined' && !HTMLCanvasElement.prototype.getContext) {
  (HTMLCanvasElement.prototype as any).getContext = () => null;
}
