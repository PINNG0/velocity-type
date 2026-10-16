import fs from 'node:fs';

// DOM mínimo (sem dependências) montado a partir dos ids reais do index.html.
// Serve para exercitar o UIManager de verdade em testes de integração.
const html = fs.readFileSync(new URL('../../index.html', import.meta.url), 'utf8');
export const htmlIds = [...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
const initiallyHidden = new Set([...html.matchAll(/<[^>]*\sid="([^"]+)"[^>]*>/g)].filter(m => /\shidden(\s|>|=|\/)/.test(m[0])).map(m => m[1]));

const gradient = { addColorStop() {} };
const ctx = Object.fromEntries(['clearRect', 'fillRect', 'beginPath', 'moveTo', 'lineTo', 'stroke', 'fill', 'setLineDash', 'setTransform', 'save', 'restore', 'arc', 'closePath']
    .map(name => [name, () => {}]));
ctx.createLinearGradient = () => gradient;

export function makeElement(id = '') {
    const listeners = {};
    const el = {
        id, hidden: false, value: '', disabled: false, textContent: '', innerHTML: '', className: '', children: [], dataset: {}, attrs: {}, offsetWidth: 0, parentNode: null,
        get firstChild() { return el.children[0] ?? null; },
        style: { props: {}, setProperty(k, v) { this.props[k] = v; } },
        classList: {
            set: new Set(),
            add(...c) { c.forEach(x => this.set.add(x)); }, remove(...c) { c.forEach(x => this.set.delete(x)); },
            toggle(c, force) { const on = force === undefined ? !this.set.has(c) : force; on ? this.set.add(c) : this.set.delete(c); return on; },
            contains(c) { return this.set.has(c); }
        },
        addEventListener(name, fn) { (listeners[name] ??= []).push(fn); }, removeEventListener() {},
        dispatch(name, extra = {}) { (listeners[name] || []).forEach(fn => fn({ target: el, preventDefault() {}, ...extra })); },
        click() { el.dispatch('click'); }, focus() {}, blur() {}, remove() { const p = el.parentNode; if (p) p.children.splice(p.children.indexOf(el), 1); }, matches: () => false,
        setAttribute(k, v) { el.attrs[k] = String(v); }, getAttribute: k => el.attrs[k],
        appendChild(child) { child.parentNode = el; el.children.push(child); return child; }, querySelectorAll: () => [], querySelector: () => null,
        getBoundingClientRect: () => ({ width: 800, height: 300 }), getContext: () => ctx, setRangeText() {}, dispatchEvent() {}
    };
    return el;
}

// Elementos com data-i18n / data-i18n-attr, lidos do HTML real (para testar I18n.apply).
function i18nElements() {
    const out = { text: [], attr: [] };
    for (const m of html.matchAll(/<(\w+)([^>]*\sdata-i18n="([^"]+)"[^>]*)>/g)) {
        const el = makeElement(); el.attrs['data-i18n'] = m[3]; out.text.push(el);
    }
    for (const m of html.matchAll(/<(\w+)[^>]*\sdata-i18n-attr="([^"]+)"[^>]*>/g)) {
        const el = makeElement(); el.attrs['data-i18n-attr'] = m[2]; out.attr.push(el);
    }
    return out;
}

export function installFakeDom() {
    const saved = { document: globalThis.document, window: globalThis.window, raf: globalThis.requestAnimationFrame };
    const elements = new Map(htmlIds.map(id => [id, Object.assign(makeElement(id), { hidden: initiallyHidden.has(id) })]));
    const topics = ['mixed', 'computing', 'science', 'people', 'code'].map(value => Object.assign(makeElement(), { value, checked: true }));
    const documentStub = {
        hidden: false, body: makeElement('body'), documentElement: makeElement('html'), activeElement: null,
        getElementById: id => elements.get(id) ?? null,
        querySelectorAll: selector => selector === '[data-content-category]' ? topics : selector === '[data-i18n]' ? i18n.text : selector === '[data-i18n-attr]' ? i18n.attr : [],
        createElement: () => makeElement(), addEventListener() {}, removeEventListener() {}
    };
    const i18n = i18nElements();
    const alerts = [];
    globalThis.document = documentStub;
    globalThis.window = { addEventListener() {}, confirm: () => true, alert: m => alerts.push(m) };
    globalThis.requestAnimationFrame = cb => { cb(0); return 1; };
    return {
        el: id => elements.get(id), elements, topics, alerts, i18n,
        restore() {
            for (const [k, v] of Object.entries({ document: saved.document, window: saved.window, requestAnimationFrame: saved.raf })) {
                if (v === undefined) delete globalThis[k]; else globalThis[k] = v;
            }
        }
    };
}
