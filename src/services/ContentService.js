import { Logger } from './Logger.js';

export const FALLBACK_PACKS = {
    pt: { mixed: ['O computador transforma instruções em ações por meio de hardware e software.', 'Um algoritmo organiza passos claros para resolver um problema.'], computing: ['Ada Lovelace é lembrada como pioneira da programação.', 'Alan Turing ajudou a estabelecer fundamentos teóricos da computação.'], science: ['O efeito Joule transforma energia elétrica em calor ao atravessar uma resistência.'], people: ['Grace Hopper ajudou a aproximar a programação da linguagem humana.'], code: ['while (engine.isRunning()) { updateRace(); }', 'public class RaceController { }'] },
    en: { mixed: ['A computer turns instructions into actions through hardware and software.', 'An algorithm arranges clear steps to solve a problem.'], computing: ['Ada Lovelace is remembered as a pioneer of programming.', 'Alan Turing helped establish theoretical foundations of computing.'], science: ['The Joule effect converts electrical energy into heat through resistance.'], people: ['Grace Hopper helped bring programming closer to human language.'], code: ['while (engine.isRunning()) { updateRace(); }', 'public class RaceController { }'] }
};

const ALL_CATEGORIES = ['computing', 'science', 'people', 'code'];

export class ContentService {
    static get url() { return `${import.meta.env?.BASE_URL ?? '/'}data/words/phrases.json`.replace('//data', '/data'); }

    static async load(assets) {
        try { return await assets.loadJSON(this.url); } catch (error) {
            Logger.warn('content', 'phrases.json indisponível, usando conteúdo reserva', { error: String(error?.message ?? error) });
            return { packs: FALLBACK_PACKS };
        }
    }

    // Seleciona frases já saneadas (únicas, sem vazias). Aceita { packs } e { phrases }.
    static select(data, language = 'pt', categories = ALL_CATEGORIES) {
        const locale = data?.packs?.[language] ? language : 'pt';
        const selected = Array.isArray(categories) ? categories : [categories];
        const curatedMixed = selected.length === 1 && selected[0] === 'mixed';
        const normalized = selected.includes('mixed') ? ALL_CATEGORIES : selected.filter(c => ALL_CATEGORIES.includes(c));
        const toLoad = normalized.length ? normalized : ALL_CATEGORIES;

        let phrases;
        if (Array.isArray(data?.phrases)) phrases = data.phrases;
        else {
            const packs = data?.packs?.[locale] ?? FALLBACK_PACKS[locale];
            if (curatedMixed && Array.isArray(packs?.mixed)) phrases = packs.mixed;
            else phrases = toLoad.flatMap(c => {
                const pack = packs?.[c] ?? FALLBACK_PACKS[locale]?.[c] ?? [];
                return Array.isArray(pack) ? pack : [];
            });
        }
        const usable = [...new Set(phrases.filter(v => typeof v === 'string' && v.trim()).map(v => v.trim()))];
        return usable.length ? usable : FALLBACK_PACKS[locale].mixed;
    }

    // Só sintaxe inequívoca conta como código; prosa com "if"/"while" não pode ignorar as regras.
    static isCodeText(text) {
        return /[{};]|=>|\b(?:public\s+(?:class|static)|(?:export\s+)?(?:const|let|var|function|class)\s+[A-Za-z_$]|return\s+[^.!?]+;)/.test(String(text));
    }
}
