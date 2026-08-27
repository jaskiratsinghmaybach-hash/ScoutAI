export const SCENE_SUGGESTIONS: string[] = [
    "A confrontation scene on a rooftop at night, 1980s crime film",
    "A quiet monastery courtyard for a meditation documentary",
    "A car chase through narrow city alleys, futuristic setting",
    "An outdoor wedding at a vineyard, daytime",
    "A standoff scene inside an abandoned warehouse",
];

export function getRandomSuggestions(count: number = 3): string[] {
    const shuffled = [...SCENE_SUGGESTIONS].sort(() => Math.random() - 0.5);
    return shuffled.slice(0, count);
}