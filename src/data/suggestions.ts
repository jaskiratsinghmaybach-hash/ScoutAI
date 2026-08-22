export const SCENE_SUGGESTIONS: string[] = [
    "A rain-soaked rooftop confrontation, 1980s noir...",
    "A quiet monastery courtyard at dawn for a meditation documentary...",
    "A neon-lit alley chase through a futuristic city...",
    "A sun-drenched vineyard wedding in the countryside...",
    "An abandoned industrial warehouse for a tense standoff...",
];

export function getRandomSuggestions(count: number = 3): string[] {
    const shuffled = [...SCENE_SUGGESTIONS].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
}