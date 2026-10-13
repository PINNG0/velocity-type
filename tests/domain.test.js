import test from 'node:test';
import assert from 'node:assert/strict';

import { ChallengeSequence } from '../src/domain/typing/ChallengeSequence.js';
import { TypingQueue } from '../src/domain/typing/TypingQueue.js';
import { TypingChallenge } from '../src/domain/typing/TypingChallenge.js';
import { TypingSession } from '../src/domain/typing/TypingSession.js';
import { GameConfig } from '../src/config/GameConfig.js';

test('TypingQueue mantém frases futuras e as repõe infinitamente', () => {
    const sequence = new ChallengeSequence([
        'one',
        'two',
        'three',
        'four'
    ]);

    const queue = new TypingQueue(sequence, 3);

    assert.equal(queue.currentText, 'one');
    assert.deepEqual(queue.upcomingTexts, ['two', 'three', 'four']);

    queue.advance();

    assert.equal(queue.currentText, 'two');
    assert.deepEqual(queue.upcomingTexts, ['three', 'four', 'one']);
});

test('TypingSession preserva estatísticas ao trocar de frase', () => {
    const session = new TypingSession(
        new TypingChallenge('abc'),
        GameConfig.typing
    );

    session.start();
    session.processInput('abc');

    assert.equal(session.isComplete, true);
    assert.equal(session.totalTypedCharacters, 3);
    assert.equal(session.correctCharacters, 3);

    session.advanceTo(new TypingChallenge('de'));
    session.processInput('de');

    assert.equal(session.isComplete, true);
    assert.equal(session.totalTypedCharacters, 5);
    assert.equal(session.correctCharacters, 5);
    assert.equal(session.incorrectCharacters, 0);
    assert.equal(session.accuracy, 1);
});

test('TypingSession aceita backspace sem apagar histórico da corrida', () => {
    const session = new TypingSession(
        new TypingChallenge('abcd'),
        GameConfig.typing
    );

    session.start();
    session.processInput('ab');
    session.processInput('a');
    session.processInput('abcd');

    assert.equal(session.totalTypedCharacters, 5);
    assert.equal(session.correctCharacters, 5);
    assert.equal(session.isComplete, true);
});

test('ChallengeSequence é cíclica para suportar uma corrida longa', () => {
    const sequence = new ChallengeSequence(['A', 'B']);

    assert.equal(sequence.current(), 'A');
    assert.equal(sequence.next(), 'B');
    assert.equal(sequence.next(), 'A');
    assert.equal(sequence.next(), 'B');
});

import { Race } from '../src/domain/race/Race.js';
import { RaceSystem } from '../src/systems/RaceSystem.js';

test('Race usa velocidade em km/h convertida para metros por segundo', () => {
    const race = new Race(GameConfig);
    race.start();
    race.car.setSpeed(36);
    race.update(1);

    assert.equal(Math.round(race.car.position), 10);
});

test('Race termina quando qualquer piloto cruza a chegada', () => {
    const race = new Race({
        race: { ...GameConfig.race, targetDistance: 10 },
        opponents: [
            { id: 'npc', name: 'Nova', color: 'red', baseSpeed: 200, skill: 1 }
        ]
    });

    race.start();
    race.opponents[0].position = 11;
    race.update(0.016);

    assert.equal(race.finished, true);
    assert.equal(race.winnerName, 'Nova');
    assert.equal(race.playerWon, false);
});

test('RaceSystem transforma WPM em velocidade sem exceder o limite', () => {
    const race = new Race(GameConfig);
    race.start();

    const session = new TypingSession(
        new TypingChallenge('abcdef'),
        GameConfig.typing
    );
    session.start();
    session.processInput('abcdef');

    const system = new RaceSystem(race, session, GameConfig);
    system.update(0.016);

    assert.ok(race.car.speed >= 0);
    assert.ok(race.car.speed <= GameConfig.race.maxSpeedKmh);
});

test('TypingSession completa palavras sem reiniciar o histórico da corrida', () => {
    const session = new TypingSession(
        new TypingChallenge('The engine wakes'),
        GameConfig.typing
    );

    session.start();
    session.processInput('The ');

    assert.equal(session.input, 'The ');
    assert.equal(session.correctCharacters, 4);
    assert.equal(session.isComplete, false);

    session.processInput('The engine ');
    assert.equal(session.correctCharacters, 11);
    assert.equal(session.isComplete, false);

    session.processInput('The engine wakes');
    assert.equal(session.isComplete, true);
    assert.equal(session.correctCharacters, 16);
});

import { TypingStream } from '../src/domain/typing/TypingStream.js';

test('TypingStream cria uma fita contínua com a próxima frase já nascendo à direita', () => {
    const stream = new TypingStream(
        'The engine wakes',
        ['up as the road opens.', 'Every accurate keystroke.']
    );

    assert.equal(
        stream.text,
        'The engine wakes   up as the road opens.   Every accurate keystroke.'
    );
    assert.equal(stream.currentLength, 16);
    assert.equal(stream.nextText, 'up as the road opens.');
});

test('TypingStream limita o input à frase atual sem cortar o fluxo futuro', () => {
    const stream = new TypingStream('abc', ['def', 'ghi']);

    assert.equal(stream.clampInput('abcdef'), 'abc');
    assert.equal(stream.globalOffset('abcdef'), 3);
    assert.equal(stream.upcomingCount, 2);
});


import fs from 'node:fs';

test('conteúdo possui idiomas e temas completos', () => {
 const data = JSON.parse(fs.readFileSync(new URL('../public/data/words/phrases.json', import.meta.url), 'utf8'));
 for (const lang of ['pt','en']) for (const topic of ['mixed','computing','science','code','people']) assert.ok(data.packs[lang][topic].length > 0, `${lang}/${topic}`);
 assert.ok(data.packs.pt.computing.some(s => s.includes('Ada Lovelace')));
 assert.ok(data.packs.en.science.some(s => s.includes('Joule effect')));
 assert.ok(data.packs.pt.code.some(s => s.includes('while')));
});

test('fita de texto anexa os próximos desafios desde o início', () => {
 const stream = new TypingStream('The engine', ['wakes up ahead.', 'Every accurate keystroke.']);
 assert.equal(stream.text, 'The engine   wakes up ahead.   Every accurate keystroke.');
 assert.equal(stream.nextText, 'wakes up ahead.');
 assert.equal(stream.upcomingCount, 2);
});


test('mixed and multi-topic content packs include all selected categories', () => {
    const data = JSON.parse(fs.readFileSync(new URL('../public/data/words/phrases.json', import.meta.url), 'utf8'));
    const all = ['computing', 'science', 'people', 'code'];
    for (const language of ['pt', 'en']) {
        const merged = [...new Set(all.flatMap(category => data.packs[language][category]))];
        assert.ok(merged.some(text => text.includes(language === 'pt' ? 'Ada Lovelace' : 'Ada Lovelace')));
        assert.ok(merged.some(text => text.includes(language === 'pt' ? 'while' : 'while')));
        assert.ok(merged.length > data.packs[language].computing.length);
    }
});

import { SettingsService } from '../src/services/SettingsService.js';
import { AdaptiveDifficultyService } from '../src/services/AdaptiveDifficultyService.js';

test('SettingsService normaliza regras de digitação de forma consistente', () => {
    const rules = { accents: false, punctuation: false, caseSensitive: false, numbersExact: false };
    assert.equal(SettingsService.normalizeText('AÇÃO, Teste 2026!', rules, false), 'acao teste');
    assert.equal(SettingsService.normalizeText('const X = 2026;', rules, true), 'const X = 2026;');
});

test('dificuldade adaptativa usa um nível interno e não altera o nível com uma única corrida', () => {
    const originalStorage = globalThis.localStorage;
    const store = new Map();
    globalThis.localStorage = {
        getItem: key => store.has(key) ? store.get(key) : null,
        setItem: (key, value) => store.set(key, String(value))
    };
    try {
        store.set('velocity-type-adaptive-v1', '2');
        assert.equal(AdaptiveDifficultyService.choose('adaptive').label, 'Fácil–Médio');
        AdaptiveDifficultyService.record({ difficultyMode: 'adaptive', playerWon: true, position: 1, wpm: 60, accuracy: 0.98 });
        assert.equal(AdaptiveDifficultyService.getSkillIndex(), 2);
    } finally {
        if (originalStorage === undefined) delete globalThis.localStorage;
        else globalThis.localStorage = originalStorage;
    }
});

test('modo simplificado preserva espaço final para avançar entre palavras', () => {
    const rules = { accents: false, punctuation: false, caseSensitive: false, numbersExact: false };
    assert.equal(SettingsService.normalizeText('AÇÃO, Teste 2026!', rules, false), 'acao teste');
    assert.equal(SettingsService.normalizeInput('ACAO ', rules, false), 'acao ');
    assert.equal(SettingsService.normalizeInput('ACAO  ', rules, false), 'acao ');
});

test('sequência embaralhada não começa sempre pela mesma frase e evita repetição na virada', () => {
    const sequence = new ChallengeSequence(['Ada', 'Alan', 'Grace'], { shuffle: true });
    const results = [sequence.current(), sequence.next(), sequence.next(), sequence.next()];
    assert.equal(new Set(results.slice(0, 3)).size, 3);
    assert.notEqual(results[2], results[3]);
});


test('normalização simplificada preserva espaços entre palavras e espaço final', () => {
    const rules = { accents: false, punctuation: false, caseSensitive: false, numbersExact: false };
    assert.equal(SettingsService.normalizeText('Olá, Mundo! 42', rules), 'ola mundo');
    assert.equal(SettingsService.normalizeInput('ola ', rules), 'ola ');
    assert.equal(SettingsService.normalizeInput('ola  mundo', rules), 'ola mundo');
});


test('UI declara os elementos obrigatórios e não exige os cartões HUD removidos', async () => {
  const { readFile } = await import('node:fs/promises');
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const ui = await readFile(new URL('../src/ui/UIManager.js', import.meta.url), 'utf8');
  for (const id of ['main-menu', 'race-screen', 'results-screen', 'start-race-button', 'typing-input', 'pause-button', 'restart-button', 'results-menu-button']) {
    assert.match(html, new RegExp(`id=[\"']${id}[\"']`), `HTML deve conter #${id}`);
  }
  assert.match(ui, /const required = \[/, 'UIManager deve declarar explicitamente os elementos obrigatórios');
  assert.doesNotMatch(ui.match(/const required = \[([\s\S]*?)\];/)?.[1] || '', /'time'|'position'|'distance'/, 'campos HUD opcionais não podem bloquear a inicialização');
});

test('cada tema tem histórias mais longas nos dois idiomas', () => {
    const data = JSON.parse(fs.readFileSync(new URL('../public/data/words/phrases.json', import.meta.url), 'utf8'));
    for (const language of ['pt', 'en']) {
        for (const topic of ['mixed', 'computing', 'science', 'people', 'code']) {
            assert.ok(data.packs[language][topic].length >= 10, `${language}/${topic} precisa ter variedade`);
        }
        assert.ok(data.packs[language].computing.some(text => text.length > 180), `${language}: falta uma história longa de computação`);
        assert.ok(data.packs[language].people.some(text => text.length > 180), `${language}: falta uma história longa de pioneiros`);
    }
});

test('ChallengeSequence.reset reinicia sem depender de variável fora do escopo', () => {
    const sequence = new ChallengeSequence(['first', 'second']);
    sequence.next();
    assert.equal(sequence.current(), 'second');
    sequence.reset();
    assert.equal(sequence.current(), 'first');
});


test('TypingSession permite concluir desafios maiores que 240 caracteres', () => {
    const longText = 'palavra '.repeat(45).trim();
    const session = new TypingSession(new TypingChallenge(longText), { maxInputLength: 240 });
    session.start();
    session.processInput(longText);
    assert.equal(session.input.length, longText.length);
    assert.equal(session.isComplete, true);
});

test('TypingSession aumenta o limite quando avança para uma história maior', () => {
    const session = new TypingSession(new TypingChallenge('curta'), { maxInputLength: 32 });
    session.start();
    const longText = 'história maior '.repeat(30).trim();
    session.advanceTo(new TypingChallenge(longText));
    session.processInput(longText);
    assert.equal(session.isComplete, true);
});

import { InputController } from '../src/controllers/InputController.js';

test('InputController encaminha a primeira tecla quando o foco está fora do campo', () => {
    const originalDocument = globalThis.document;
    let documentKeyHandler;
    const listeners = new Map();
    const fakeDocument = {
        body: {}, documentElement: {}, activeElement: null,
        addEventListener: (name, handler) => { if (name === 'keydown') documentKeyHandler = handler; },
        removeEventListener: () => {}
    };
    const input = {
        value: '', disabled: false, selectionStart: 0, selectionEnd: 0,
        addEventListener: (name, handler) => listeners.set(name, handler),
        removeEventListener: () => {},
        focus() { fakeDocument.activeElement = this; },
        setRangeText(text, start, end, mode) {
            this.value = this.value.slice(0, start) + text + this.value.slice(end);
            this.selectionStart = this.selectionEnd = mode === 'end' ? start + text.length : start;
        },
        dispatchEvent(event) { listeners.get(event.type)?.({ target: this }); }
    };
    let received = '';
    globalThis.document = fakeDocument;
    try {
        const controller = new InputController(input, value => { received = value; });
        controller.enable();
        const event = { key: 'a', ctrlKey: false, altKey: false, metaKey: false, preventDefault() { this.prevented = true; } };
        documentKeyHandler(event);
        assert.equal(input.value, 'a');
        assert.equal(received, 'a');
        assert.equal(event.prevented, true);
        controller.disable();
    } finally {
        if (originalDocument === undefined) delete globalThis.document;
        else globalThis.document = originalDocument;
    }
});

test('InputController não perde o primeiro espaço quando o foco está fora do campo', () => {
    const originalDocument = globalThis.document;
    let documentKeyHandler;
    const listeners = new Map();
    const fakeDocument = {
        body: {}, documentElement: {}, activeElement: null,
        addEventListener: (name, handler) => { if (name === 'keydown') documentKeyHandler = handler; },
        removeEventListener: () => {}
    };
    const input = {
        value: 'palavra', disabled: false, selectionStart: 7, selectionEnd: 7,
        addEventListener: (name, handler) => listeners.set(name, handler),
        removeEventListener: () => {},
        focus() { fakeDocument.activeElement = this; },
        setRangeText(text, start, end, mode) {
            this.value = this.value.slice(0, start) + text + this.value.slice(end);
            this.selectionStart = this.selectionEnd = mode === 'end' ? start + text.length : start;
        },
        dispatchEvent(event) { listeners.get(event.type)?.({ target: this }); }
    };
    let received = '';
    globalThis.document = fakeDocument;
    try {
        const controller = new InputController(input, value => { received = value; });
        controller.enable();
        documentKeyHandler({ key: ' ', ctrlKey: false, altKey: false, metaKey: false, preventDefault() {} });
        assert.equal(input.value, 'palavra ');
        assert.equal(received, 'palavra ');
        controller.disable();
    } finally {
        if (originalDocument === undefined) delete globalThis.document;
        else globalThis.document = originalDocument;
    }
});

test('histórias acima de 240 caracteres podem ser concluídas sem corte do campo', () => {
    const longText = `A velocidade média resume o percurso. ${'Um veículo pode acelerar, desacelerar e parar sem alterar a média final. '.repeat(4)}`;
    assert.ok(longText.length > 240);
    const session = new TypingSession(new TypingChallenge(longText), GameConfig.typing);
    session.start();
    session.processInput(longText);
    assert.equal(session.input.length, longText.length);
    assert.equal(session.isComplete, true);
});

test('InputController deixa letras repetidas e espaços seguirem o evento input nativo', async () => {
    const { InputController } = await import('../src/controllers/InputController.js');
    class FakeInput {
        constructor() { this.value = ''; this.listeners = new Map(); this.disabled = false; }
        addEventListener(name, fn) { const list = this.listeners.get(name) || []; list.push(fn); this.listeners.set(name, list); }
        removeEventListener(name, fn) { this.listeners.set(name, (this.listeners.get(name) || []).filter(item => item !== fn)); }
        dispatchInput() {
            const event = { type: 'input', target: this };
            for (const fn of this.listeners.get('input') || []) fn(event);
        }
    }
    const input = new FakeInput();
    const observed = [];
    const controller = new InputController(input, value => observed.push(value));
    input.addEventListener('input', controller.boundInput);
    // Simula o que o navegador faz naturalmente, sem interceptar keydown.
    for (const key of ['a', 'a', ' ', 'b']) {
        input.value += key;
        input.dispatchInput();
    }
    assert.equal(input.value, 'aa b');
    assert.deepEqual(observed, ['a', 'aa', 'aa ', 'aa b']);
});

test('TypingSession registra caracteres inseridos ao substituir texto no meio', () => {
    const session = new TypingSession(new TypingChallenge('abcd'), GameConfig.typing);
    session.start();
    session.processInput('abcd');
    session.processInput('abXd');
    assert.equal(session.input, 'abXd');
    assert.equal(session.incorrectCharacters, 1);
    session.processInput('abcd');
    assert.equal(session.isComplete, true);
    assert.equal(session.correctCharacters, 5);
    assert.equal(session.incorrectCharacters, 1);
});


test('menu oferece acesso ao histórico, exportação e limpeza dos recordes', async () => {
  const { readFile } = await import('node:fs/promises');
  const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');
  const ui = await readFile(new URL('../src/ui/UIManager.js', import.meta.url), 'utf8');
  for (const id of ['menu-records-toggle', 'menu-records-panel', 'player-summary', 'menu-records-list', 'export-records-button', 'clear-records-button']) {
    assert.match(html, new RegExp(`id=["']${id}["']`), `HTML deve conter #${id}`);
  }
  assert.match(ui, /renderMenuRecords\(\)/);
  assert.match(ui, /exportRecords\(\)/);
  const storage = await readFile(new URL('../src/services/StorageService.js', import.meta.url), 'utf8');
  assert.match(storage, /history: 'velocity-type-race-history-v1'/);
  assert.match(storage, /static clearHistory\(\)/);
});

test('desafios longos não são truncados no limite legado de 240 caracteres', () => {
    const longText = 'algoritmo '.repeat(45).trim();
    const session = new TypingSession(new TypingChallenge(longText), GameConfig.typing);
    session.start();
    session.processInput(longText);
    assert.equal(session.input.length, longText.length);
    assert.equal(session.isComplete, true);
    assert.equal(session.correctCharacters, longText.length);
});

test('biblioteca beta tem variedade mínima em cada idioma e categoria', () => {
    const data = JSON.parse(fs.readFileSync(new URL('../public/data/words/phrases.json', import.meta.url), 'utf8'));
    for (const language of ['pt', 'en']) {
        for (const category of ['mixed', 'computing', 'science', 'people', 'code']) {
            const entries = data.packs[language][category];
            assert.ok(entries.length >= (category === 'mixed' ? 80 : 20), `${language}/${category}: ${entries.length}`);
            assert.equal(new Set(entries).size, entries.length, `Duplicatas em ${language}/${category}`);
            assert.ok(entries.every(text => typeof text === 'string' && text.trim().length >= 12));
        }
    }
});

test('normalização preserva espaço final necessário para concluir palavras', () => {
    const rules = { accents: true, punctuation: true, caseSensitive: true, numbersExact: true };
    assert.equal(SettingsService.normalizeInput('uma ', rules), 'uma ');
    assert.equal(SettingsService.normalizeText('uma ', rules), 'uma');
});

test('ChallengeSequence embaralhada não repete imediatamente ao iniciar novo ciclo', () => {
    const sequence = new ChallengeSequence(['alpha', 'beta', 'gamma', 'delta'], { shuffle: true });
    let previous = sequence.current();
    const seen = new Set([previous]);
    for (let i = 0; i < 40; i++) {
        const next = sequence.next();
        assert.notEqual(next, previous, 'A sequência repetiu o mesmo desafio consecutivamente');
        seen.add(next);
        previous = next;
    }
    assert.equal(seen.size, 4);
});

test('dificuldade adaptativa usa nível inicial moderado quando ainda não há preferência salva', async () => {
    const { AdaptiveDifficultyService } = await import('../src/services/AdaptiveDifficultyService.js');
    const previous = globalThis.localStorage;
    globalThis.localStorage = { getItem: () => null, setItem: () => {}, removeItem: () => {} };
    try {
        assert.equal(AdaptiveDifficultyService.getSkillIndex(), 1);
        assert.equal(AdaptiveDifficultyService.choose('adaptive').levelIndex, 1);
    } finally {
        if (previous === undefined) delete globalThis.localStorage;
        else globalThis.localStorage = previous;
    }
});

test('UI disponibiliza importação de backup do histórico', () => {
    const html = fs.readFileSync(new URL('../index.html', import.meta.url), 'utf8');
    const manager = fs.readFileSync(new URL('../src/ui/UIManager.js', import.meta.url), 'utf8') + fs.readFileSync(new URL('../src/ui/RecordsView.js', import.meta.url), 'utf8');
    assert.match(html, /id="import-records-button"/);
    assert.match(html, /id="import-records-file"/);
    assert.match(manager, /async importRecords\(file\)/);
    assert.match(manager, /5 \* 1024 \* 1024/);
});


test('TypingStream permite registrar progresso consumido limitado à frase atual', () => {
    const stream = new TypingStream('abc', ['def']);
    assert.equal(stream.consumedLength, 0);
    assert.equal(stream.setConsumedLength(2), 2);
    assert.equal(stream.consumedLength, 2);
    assert.equal(stream.setConsumedLength(99), 3);
    assert.equal(stream.setConsumedLength(-4), 0);
});

test('dificuldade adaptativa mantém o índice e a velocidade dentro do teto competitivo', () => {
    const originalStorage = globalThis.localStorage;
    const store = new Map([['velocity-type-adaptive-v1', '100']]);
    globalThis.localStorage = { getItem: key => store.has(key) ? store.get(key) : null, setItem: (key, value) => store.set(key, String(value)) };
    try {
        const difficulty = AdaptiveDifficultyService.choose('adaptive');
        assert.equal(AdaptiveDifficultyService.getSkillIndex(), 10);
        assert.ok(difficulty.speed <= 1.8);
        assert.ok(difficulty.speed >= 0.58);
    } finally {
        if (originalStorage === undefined) delete globalThis.localStorage;
        else globalThis.localStorage = originalStorage;
    }
});

test('fita visual mantém o histórico renderizado limitado por uma janela', async () => {
    const source = await fs.promises.readFile(new URL('../src/ui/components/TypingDisplay.js', import.meta.url), 'utf8');
    assert.match(source, /slice\(-600\)/);
});


test('RaceController usa o pack misto curado e não confunde prosa com código por palavras soltas', async () => {
    const { RaceController } = await import('../src/controllers/RaceController.js');
    const data = JSON.parse(fs.readFileSync(new URL('../public/data/words/phrases.json', import.meta.url), 'utf8'));
    const controller = Object.create(RaceController.prototype);
    controller.phrasesPromise = Promise.resolve(data);
    const mixed = await controller.loadPhrases('pt', ['mixed']);
    assert.deepEqual(mixed, [...new Set(data.packs.pt.mixed.map(text => text.trim()))]);
    assert.equal(controller.isCodeText('If the road is clear, accelerate while maintaining control.'), false);
    assert.equal(controller.isCodeText('const speed = 42;'), true);
});
