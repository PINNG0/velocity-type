const SELECTOR = 'button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), summary, [tabindex="0"]';
const STEP = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 };

// Navegação por teclado dos menus: ↑ ↓ (e ← →) movem a seleção entre os botões, Enter confirma, Home/End vão ao
// primeiro/último. Só atua quando há um "contêiner de navegação" visível (menus, resultados, pausa): durante a
// corrida não existe contêiner, então a digitação nunca é interceptada.
export class KeyboardNav {
    constructor({ getContainer }) {
        this.getContainer = getContainer;
    }

    bind() {
        document.addEventListener('keydown', event => this.onKeyDown(event));
    }

    // Itens navegáveis (visíveis e habilitados) na ordem em que aparecem na tela.
    items(container) {
        return [...container.querySelectorAll(SELECTOR)].filter(el => !el.disabled && !el.closest?.('[hidden]') && el.tabIndex !== -1);
    }

    onKeyDown(event) {
        if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) return;
        const isArrow = event.key in STEP;
        if (!isArrow && event.key !== 'Home' && event.key !== 'End' && event.key !== 'Enter') return;

        const container = this.getContainer();
        if (!container) return;

        const active = document.activeElement;
        const tag = String(active?.tagName ?? '').toUpperCase();
        const type = String(active?.type ?? '').toLowerCase();
        // Campos de texto, listas nativas e o controle deslizante mantêm as próprias setas.
        if (tag === 'TEXTAREA' || tag === 'SELECT' || (tag === 'INPUT' && ['text', 'search', 'number'].includes(type))) return;
        if (tag === 'INPUT' && type === 'range' && (event.key === 'ArrowLeft' || event.key === 'ArrowRight' || event.key === 'Home' || event.key === 'End')) return;

        // Enter também liga/desliga os interruptores (o navegador só faz isso com Espaço).
        if (event.key === 'Enter') {
            if (tag === 'INPUT' && type === 'checkbox') { event.preventDefault?.(); active.click(); }
            return;
        }

        const items = this.items(container);
        if (!items.length) return;
        event.preventDefault?.();

        const current = items.indexOf(active);
        let next;
        if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = items.length - 1;
        else if (current === -1) next = STEP[event.key] > 0 ? 0 : items.length - 1;
        else next = (current + STEP[event.key] + items.length) % items.length;

        items[next].focus?.();
        items[next].scrollIntoView?.({ block: 'nearest' });
    }
}
