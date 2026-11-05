'use strict';
// Headless harness for the isolated six-mechanic lab. No external deps.
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

function createHarness({ width = 360, height = 640, reduced = false } = {}) {
  const listeners = new Map();
  const elements = new Map();
  let now = 1000;
  let frameCb = null;
  let serial = 0;

  function makeClassList() {
    const set = new Set();
    return {
      add(...names) { names.forEach((n) => set.add(n)); },
      remove(...names) { names.forEach((n) => set.delete(n)); },
      toggle(name, force) {
        const on = force === undefined ? !set.has(name) : !!force;
        if (on) set.add(name); else set.delete(name);
        return on;
      },
      contains(name) { return set.has(name); }
    };
  }

  function makeElement(id, rect = { left: 0, top: 0, width: 360, height: 49 }) {
    const el = {
      id,
      tagName: id,
      textContent: '',
      value: '',
      disabled: false,
      checked: id === 'impactHaptic',
      hidden: false,
      dataset: {},
      children: [],
      innerHTML: '',
      style: { setProperty() {}, width: '', height: '' },
      classList: makeClassList(),
      getBoundingClientRect() { return { ...rect }; },
      setAttribute() {},
      removeAttribute() {},
      focus() {},
      appendChild(child) { this.children.push(child); },
      replaceChildren(...list) { this.children = list; },
      querySelectorAll() { return []; },
    getElementById(id) { return el(id); },
      addEventListener(type, fn) { listeners.set(id + ':' + type, fn); },
      setPointerCapture() {},
      releasePointerCapture() {},
      parentElement: { classList: makeClassList(), children: [] },
      remove() {}
    };
    return el;
  }

  function el(id) {
    if (!elements.has(id)) {
      const rect = id === 'game'
        ? { left: 0, top: 0, width, height }
        : id === '.topbar' ? { left: 0, top: 0, width, height: 49 }
          : id === '.shell' ? { left: 0, top: 0, width, height }
            : { left: 0, top: 0, width: 360, height: 49 };
      elements.set(id, makeElement(id, rect));
    }
    return elements.get(id);
  }

  const canvas = el('game');
  const ctxTarget = {
    createLinearGradient() { return { addColorStop() {} }; },
    createRadialGradient() { return { addColorStop() {} }; },
    measureText() { return { width: 10 }; },
    getImageData() { return { data: new Uint8ClampedArray(4) }; },
    canvas
  };
  const ctx = new Proxy(ctxTarget, {
    get(target, key) {
      if (key in target) return target[key];
      return () => {};
    },
    set(target, key, value) { target[key] = value; return true; }
  });
  canvas.getContext = () => ctx;

  const document = {
    hidden: false,
    body: el('body'),
    documentElement: el('html'),
    activeElement: null,
    querySelector(selector) {
      if (typeof selector !== 'string') return null;
      if (selector.startsWith('#')) return el(selector.slice(1));
      if (selector.startsWith('.')) return el(selector);
      return el(selector);
    },
    querySelectorAll() { return []; },
    getElementById(id) { return el(id); },
    createElement(tag) { return makeElement(tag + ':' + (++serial)); },
    addEventListener(type, fn) { listeners.set('document:' + type, fn); }
  };

  const storage = new Map();
  const window = {
    __PINBALL_TEST__: true,
    innerWidth: width,
    innerHeight: height,
    devicePixelRatio: 1,
    location: { search: '' },
    document,
    matchMedia() { return { matches: reduced }; },
    addEventListener(type, fn) { listeners.set('window:' + type, fn); },
    localStorage: {
      getItem(k) { return storage.has(k) ? storage.get(k) : null; },
      setItem(k, v) { storage.set(k, String(v)); }
    },
    navigator: { vibrate() { return false; } },
    requestAnimationFrame(fn) { frameCb = fn; },
    cancelAnimationFrame() {},
    URL: { createObjectURL() { return 'blob:lab'; }, revokeObjectURL() {} },
    Blob: function Blob() {}
  };

  const sandbox = {
    window,
    document,
    navigator: window.navigator,
    performance: { now: () => now },
    requestAnimationFrame(fn) { frameCb = fn; },
    cancelAnimationFrame() {},
    console,
    URL: window.URL,
    Blob: window.Blob,
    Math,
    Date,
    JSON,
    Set,
    Map,
    WeakMap,
    Object,
    Array,
    Number,
    String,
    Boolean,
    Error,
    TypeError,
    RangeError,
    parseInt,
    parseFloat,
    isFinite,
    isNaN
  };
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);

  const root = path.join(__dirname, '..');
  for (const file of ['juice-fx.js', 'builds.js', 'lab-config.js', 'game.js']) {
    vm.runInContext(fs.readFileSync(path.join(root, file), 'utf8'), sandbox, { filename: file });
  }

  function frame(count = 1, stepMs = 1000 / 60) {
    for (let i = 0; i < count; i++) {
      now += stepMs;
      if (!frameCb) throw new Error('requestAnimationFrame callback missing');
      frameCb(now);
    }
  }

  function click(id) {
    const fn = listeners.get(id + ':click');
    if (!fn) throw new Error('No click listener for ' + id);
    fn({ preventDefault() {} });
  }

  function pointer(x) {
    const down = listeners.get('game:pointerdown');
    const up = listeners.get('game:pointerup');
    if (!down) throw new Error('No pointerdown listener');
    down({ pointerId: 1, clientX: x, clientY: 100, preventDefault() {} });
    up?.({ pointerId: 1 });
  }

  return {
    window,
    document,
    sandbox,
    el,
    ctx,
    frame,
    click,
    pointer,
    lab: window.__pinballLabTest,
    test: window.__pinballTest,
    state: window.__pinballState,
    elements
  };
}

module.exports = { createHarness };
