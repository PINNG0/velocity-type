export class InputController {
    constructor(inputElement, onInput, onKeyDown = null) {
        this.inputElement = inputElement;
        this.onInput = onInput;
        this.onKeyDown = onKeyDown;

        // Teclas mortas (´ ~ ^ `) e IME: enquanto o caractere está "em composição" o valor é provisório
        // (ex.: "~" antes do "ã"). Só processamos o resultado final, para não contar erro falso.
        this.composing = false;
        this.boundInput = (event) => {
            if (event.isComposing || this.composing) return;
            this.onInput(event.target.value);
        };
        this.boundCompositionStart = () => { this.composing = true; };
        this.boundCompositionEnd = () => {
            this.composing = false;
            this.onInput(this.inputElement.value); // idempotente: valor igual ao já processado não muda nada
        };

        // Deixa o navegador tratar a digitação nativa no campo; interceptar cada
        // tecla e reescrever o valor causava divergência de cursor em alguns casos.

        // Teclas de controle ficam no document para funcionar mesmo quando
        // o foco estiver fora do input. O input NÃO registra o mesmo handler,
        // evitando que ESC seja processado duas vezes por bubbling.
        this.boundDocumentKeyDown = (event) => {
            if (event.key === 'Escape') {
                this.onKeyDown?.(event);
                return;
            }

            const printableKey = event.key.length === 1 &&
                !event.ctrlKey && !event.altKey && !event.metaKey;
            const activeElement = document.activeElement;
            const focusIsOnControl = activeElement && activeElement !== document.body &&
                activeElement !== document.documentElement &&
                activeElement.matches?.('button, a, input, textarea, select, [contenteditable="true"]');

            // Focar o campo não reaproveita a tecla que já aconteceu. Encaminhamos
            // a primeira tecla também, inclusive espaço, para ela não ser perdida.
            if (printableKey && !focusIsOnControl &&
                activeElement !== this.inputElement && !this.inputElement.disabled) {
                event.preventDefault();
                this.inputElement.focus();
                this.insertFirstKey(event.key);
            }
        };

        this.boundPointerDown = () => {
            if (!this.inputElement.disabled) {
                this.inputElement.focus();
            }
        };

        this.blockTransfer = (event) => {
            event.preventDefault();
        };
    }

    insertFirstKey(key) {
        const start = this.inputElement.selectionStart ?? this.inputElement.value.length;
        const end = this.inputElement.selectionEnd ?? start;
        this.inputElement.setRangeText(key, start, end, 'end');
        const event = typeof InputEvent === 'function'
            ? new InputEvent('input', { bubbles: true, inputType: 'insertText', data: key })
            : new Event('input', { bubbles: true });
        this.inputElement.dispatchEvent(event);
    }

    enable() {
        this.disable();

        this.inputElement.addEventListener('input', this.boundInput);
        this.inputElement.addEventListener('compositionstart', this.boundCompositionStart);
        this.inputElement.addEventListener('compositionend', this.boundCompositionEnd);
        this.inputElement.addEventListener('paste', this.blockTransfer);
        this.inputElement.addEventListener('drop', this.blockTransfer);
        this.inputElement.addEventListener('pointerdown', this.boundPointerDown);
        document.addEventListener('keydown', this.boundDocumentKeyDown);
    }

    disable() {
        this.inputElement.removeEventListener('input', this.boundInput);
        this.inputElement.removeEventListener('compositionstart', this.boundCompositionStart);
        this.inputElement.removeEventListener('compositionend', this.boundCompositionEnd);
        this.composing = false;
        this.inputElement.removeEventListener('paste', this.blockTransfer);
        this.inputElement.removeEventListener('drop', this.blockTransfer);
        this.inputElement.removeEventListener('pointerdown', this.boundPointerDown);
        document.removeEventListener('keydown', this.boundDocumentKeyDown);
    }

    clear() {
        this.inputElement.value = '';
    }

    setValue(value) {
        this.inputElement.value = value;
        this.inputElement.setSelectionRange?.(value.length, value.length);
    }
}
