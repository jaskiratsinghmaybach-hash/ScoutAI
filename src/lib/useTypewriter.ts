import { useEffect, useRef, useState } from "react";

export function useTypewriter(phrases: string[], options?: { typeSpeed?: number; dwellMs?: number }) {
    const typeSpeed = options?.typeSpeed ?? 40;
    const dwellMs = options?.dwellMs ?? 2500;

    const [displayText, setDisplayText] = useState("");
    const [isFrozen, setIsFrozen] = useState(false);
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const liveTextRef = useRef("");

    useEffect(() => {
        if (isFrozen || phrases.length === 0) return;

        let cancelled = false;
        let phraseIndex = 0;

        function runPhrase() {
            if (cancelled) return;
            const phrase = phrases[phraseIndex % phrases.length];
            let charIndex = 0;

            function typeNextChar() {
                if (cancelled) return;
                const next = phrase.slice(0, charIndex);
                liveTextRef.current = next;
                setDisplayText(next);
                charIndex++;

                if (charIndex <= phrase.length) {
                    if (finishRequestedRef.current) {
                        // Finish typing the rest of the phrase immediately, then freeze.
                        liveTextRef.current = phrase;
                        setDisplayText(phrase);
                        setIsFrozen(true);
                        finishRequestedRef.current = false;
                        return;
                    }
                    timeoutRef.current = setTimeout(typeNextChar, typeSpeed);
                } else {
                    // Phrase is fully typed, now in the dwell pause before clearing to next.
                    if (finishRequestedRef.current) {
                        // Already fully typed — just freeze here, no need to advance.
                        liveTextRef.current = phrase;
                        setDisplayText(phrase);
                        setIsFrozen(true);
                        finishRequestedRef.current = false;
                        return;
                    }
                    timeoutRef.current = setTimeout(() => {
                        if (cancelled) return;
                        if (finishRequestedRef.current) {
                            // Click happened during the dwell wait itself — freeze on current phrase.
                            liveTextRef.current = phrase;
                            setDisplayText(phrase);
                            setIsFrozen(true);
                            finishRequestedRef.current = false;
                            return;
                        }
                        phraseIndex++;
                        runPhrase();
                    }, dwellMs);
                }
            }

            typeNextChar();
        }

        runPhrase();

        return () => {
            cancelled = true;
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
        };
    }, [isFrozen, phrases, typeSpeed, dwellMs]);

    const finishRequestedRef = useRef(false);

    function freeze(withText?: string) {
        if (withText !== undefined) {
            if (timeoutRef.current) clearTimeout(timeoutRef.current);
            setIsFrozen(true);
            liveTextRef.current = withText;
            setDisplayText(withText);
            return;
        }
        // Let the current phrase finish typing naturally, then freeze.
        finishRequestedRef.current = true;
    }

    return { displayText, isFrozen, freeze, setDisplayText };
}