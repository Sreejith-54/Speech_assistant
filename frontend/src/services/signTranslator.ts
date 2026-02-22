/**
 * Client-side Sign Language Translation Service
 *
 * Converts English text to ASL tokens INSTANTLY — no AI call, no backend,
 * no network latency. Pure client-side string processing.
 *
 * Used exclusively in Learn Mode (DeafInterface.tsx).
 */

export interface SignToken {
    label: string;
}

// ── Contraction expansion ──────────────────────────────────────────────────────

const CONTRACTIONS: Record<string, string[]> = {
    "I'M": ["I", "AM"],
    "YOU'RE": ["YOU", "ARE"],
    "HE'S": ["HE", "IS"],
    "SHE'S": ["SHE", "IS"],
    "IT'S": ["IT", "IS"],
    "WE'RE": ["WE", "ARE"],
    "THEY'RE": ["THEY", "ARE"],
    "THAT'S": ["THAT", "IS"],
    "WHO'S": ["WHO", "IS"],
    "WHAT'S": ["WHAT", "IS"],
    "WHERE'S": ["WHERE", "IS"],
    "THERE'S": ["THERE", "IS"],
    "DON'T": ["DO", "NOT"],
    "DOESN'T": ["DOES", "NOT"],
    "DIDN'T": ["DID", "NOT"],
    "WON'T": ["WILL", "NOT"],
    "CAN'T": ["CAN", "NOT"],
    "COULDN'T": ["COULD", "NOT"],
    "SHOULDN'T": ["SHOULD", "NOT"],
    "WOULDN'T": ["WOULD", "NOT"],
    "ISN'T": ["IS", "NOT"],
    "AREN'T": ["ARE", "NOT"],
    "WASN'T": ["WAS", "NOT"],
    "WEREN'T": ["WERE", "NOT"],
    "HAVEN'T": ["HAVE", "NOT"],
    "HAS'NT": ["HAS", "NOT"],
    "HADN'T": ["HAD", "NOT"],
    "LET'S": ["LET", "US"],
    "I'LL": ["I", "WILL"],
    "YOU'LL": ["YOU", "WILL"],
    "HE'LL": ["HE", "WILL"],
    "SHE'LL": ["SHE", "WILL"],
    "WE'LL": ["WE", "WILL"],
    "THEY'LL": ["THEY", "WILL"],
    "I'VE": ["I", "HAVE"],
    "YOU'VE": ["YOU", "HAVE"],
    "WE'VE": ["WE", "HAVE"],
    "THEY'VE": ["THEY", "HAVE"],
    "I'D": ["I", "WOULD"],
    "YOU'D": ["YOU", "WOULD"],
    "HE'D": ["HE", "WOULD"],
    "SHE'D": ["SHE", "WOULD"],
    "WE'D": ["WE", "WOULD"],
    "THEY'D": ["THEY", "WOULD"],
};

// Time markers in ASL move to the front of the sentence
const TIME_MARKERS = new Set([
    'YESTERDAY', 'TODAY', 'TOMORROW', 'NOW', 'LATER',
    'SOON', 'BEFORE', 'AFTER', 'ALWAYS', 'NEVER',
    'MORNING', 'AFTERNOON', 'EVENING', 'NIGHT',
    'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY',
    'FRIDAY', 'SATURDAY', 'SUNDAY',
    'JANUARY', 'FEBRUARY', 'MARCH', 'APRIL', 'MAY',
    'JUNE', 'JULY', 'AUGUST', 'SEPTEMBER', 'OCTOBER',
    'NOVEMBER', 'DECEMBER',
]);

class SignTranslator {
    /**
     * Translate English text to ASL sign tokens.
     * Applies:
     *   1. Punctuation removal
     *   2. Contraction expansion (I'm → I AM)
     *   3. ASL temporal front-loading (time markers first)
     *
     * @param text  English text to translate
     * @returns     Array of ASL sign tokens (uppercase)
     */
    translateToSigns(text: string): SignToken[] {
        const cleaned = text
            .trim()
            .toUpperCase()
            .replace(/[.,!?;:"]/g, '')   // strip punctuation (keep apostrophes for contractions)
            .replace(/\s+/g, ' ');

        if (!cleaned) return [];

        const rawWords = cleaned.split(' ').filter(w => w.length > 0);

        // Expand contractions
        const expanded: string[] = [];
        for (const word of rawWords) {
            if (CONTRACTIONS[word]) {
                expanded.push(...CONTRACTIONS[word]);
            } else {
                // Strip any remaining apostrophes (e.g. possessives like "JOHN'S → JOHN")
                expanded.push(word.replace(/'/g, ''));
            }
        }

        // Separate time markers from the rest (ASL grammar: TIME first)
        const timeTokens: SignToken[] = [];
        const otherTokens: SignToken[] = [];

        for (const word of expanded) {
            if (!word) continue;
            const token: SignToken = { label: word };
            if (TIME_MARKERS.has(word)) {
                timeTokens.push(token);
            } else {
                otherTokens.push(token);
            }
        }

        return [...timeTokens, ...otherTokens];
    }

    /** Returns true if there is content worth translating */
    isValidInput(text: string): boolean {
        return text.trim().length > 0;
    }

    /** Estimated animation duration in milliseconds (700ms per token) */
    getEstimatedDuration(tokens: SignToken[]): number {
        return tokens.length * 700;
    }
}

export const signTranslator = new SignTranslator();
export default signTranslator;
