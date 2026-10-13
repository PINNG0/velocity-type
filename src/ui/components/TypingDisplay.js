import { TypingStream } from '../../domain/typing/TypingStream.js';

export class TypingDisplay {
    constructor(element) {
        this.element = element;
        this.viewport = null;
        this.line = null;
        this.lastCurrentText = '';
        this.lastInputLength = 0;
        this.historyText = '';
        this.lastRenderText = '';
    }

    renderQueue(currentText, upcomingTexts = [], input = '') {
        const current = String(currentText ?? '');
        const typed = Array.from(String(input ?? '')).slice(0, Array.from(current).length).join('');
        if (this.lastCurrentText && current !== this.lastCurrentText) {
            // Keep only a small visual tail: the full race history belongs to the
            // domain/storage layer, not to an ever-growing DOM tape.
            this.historyText = Array.from(this.historyText + this.lastCurrentText + '   ').slice(-600).join('');
        }
        const currentStart = Array.from(this.historyText).length;
        const currentLength = Array.from(current).length;
        const stream = new TypingStream(this.historyText + current, upcomingTexts, '   ');
        const fullText = stream.text;
        if (!this.viewport || !this.line) this.mount();
        if (fullText !== this.lastRenderText) {
            this.renderCharacters(fullText, currentStart, currentLength, typed);
        } else {
            this.updateCharacters(currentStart, currentLength, typed);
        }
        this.animateFlow(currentStart, Array.from(typed).length, Array.from(typed).length - this.lastInputLength);
        this.lastCurrentText = current;
        this.lastInputLength = Array.from(typed).length;
        this.lastRenderText = fullText;
    }

    mount() {
        this.element.innerHTML = '<div class="typing-stream-viewport" aria-label="Texto contínuo da corrida"><div class="typing-stream-line"></div></div>';
        this.viewport = this.element.querySelector('.typing-stream-viewport');
        this.line = this.element.querySelector('.typing-stream-line');
    }

    renderCharacters(text, start, length, typed) {
        const typedChars = Array.from(typed);
        const typedEnd = start + typedChars.length;
        this.line.innerHTML = [...text].map((char, i) => {
            let state = 'pending';
            if (i < start) state = 'consumed';
            else if (i < typedEnd) state = typedChars[i - start] === char ? 'consumed' : 'consumed incorrect';
            else if (i === typedEnd) state = 'current';
            else if (i >= start + length) state = 'future';
            return `<span class="typing-character ${state}" data-index="${i}">${this.escape(char)}</span>`;
        }).join('');
        // Start the caret inside the reading area, not flush against the edge.
        this.line.style.paddingLeft = `${Math.round(this.viewport.clientWidth * 0.24)}px`;
        this.line.style.paddingRight = `${Math.round(this.viewport.clientWidth * 0.42)}px`;
    }

    updateCharacters(start, length, typed) {
        const typedChars = Array.from(typed);
        const end = start + typedChars.length;
        this.line.querySelectorAll('.typing-character').forEach((node, i) => {
            let state = 'pending';
            if (i < start) state = 'consumed';
            else if (i < end) state = typedChars[i - start] === node.textContent ? 'consumed' : 'consumed incorrect';
            else if (i === end) state = 'current';
            else if (i >= start + length) state = 'future';
            node.className = `typing-character ${state}`;
        });
    }

    animateFlow(start, typedLength, delta) {
        if (!this.viewport || !this.line) return;
        const active = this.line.querySelector(`.typing-character[data-index="${start + typedLength}"]`);
        if (active) {
            const anchor = this.viewport.clientWidth * 0.24;
            // offsetLeft can be relative to the viewport rather than the long tape.
            // Compute the character's true scroll-content coordinate instead.
            const viewportRect = this.viewport.getBoundingClientRect();
            const characterRect = active.getBoundingClientRect();
            const contentX = characterRect.left - viewportRect.left + this.viewport.scrollLeft;
            // A rolagem suave repetida por tecla ficava atrasada em digitação rápida.
            this.viewport.scrollTo({ left: Math.max(0, contentX - anchor), behavior: 'auto' });
        }
        if (delta > 0) {
            this.line.classList.remove('stream-tick');
            void this.line.offsetWidth;
            this.line.classList.add('stream-tick');
        }
    }

    render(session, upcomingTexts = []) { this.renderQueue(session.challenge.text, upcomingTexts, session.input); }

    reset() {
        this.viewport = null; this.line = null; this.lastCurrentText = ''; this.lastInputLength = 0;
        this.historyText = ''; this.lastRenderText = ''; this.element.innerHTML = '';
    }

    escape(value) {
        return String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#039;');
    }
}
