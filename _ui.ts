import { JSDOM } from 'jsdom';
const dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost:3000/', pretendToBeVisual: true });
const g = globalThis as any;
const define = (k: string, v: any) => Object.defineProperty(g, k, { value: v, configurable: true, writable: true });
define('window', dom.window); define('document', dom.window.document);
define('navigator', dom.window.navigator); define('HTMLElement', dom.window.HTMLElement);
define('Element', dom.window.Element); define('Node', dom.window.Node);
define('Event', dom.window.Event); define('MouseEvent', dom.window.MouseEvent);
define('getComputedStyle', dom.window.getComputedStyle);
define('requestAnimationFrame', (cb: any) => setTimeout(() => cb(Date.now()), 0));
define('cancelAnimationFrame', (id: any) => clearTimeout(id));
define('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
define('matchMedia', () => ({ matches: false, addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {} }));
(g as any).IS_REACT_ACT_ENVIRONMENT = true;

const React = (await import('react')).default;
const { createRoot } = await import('react-dom/client');
const App = (await import('./src/App')).default;
const el = dom.window.document.createElement('div');
dom.window.document.body.appendChild(el);
const root = createRoot(el);
try {
  root.render(React.createElement(App));
  await new Promise((r) => setTimeout(r, 800));
  const text = el.textContent || '';
  console.log('APP RENDERED, chars =', text.length);
  console.log('sample:', text.slice(0, 300).replace(/\s+/g, ' '));
} catch (e: any) {
  console.log('APP FAILED:', e?.message);
}
