export function generateTeams(participants, numTeams) {
    if (!participants || participants.length === 0 || numTeams < 1) return [];

    // 1. Fisher-Yates Shuffle
    const shuffled = [...participants];
    for (let i = shuffled.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }

    // 2. Distribute into groups
    const teams = Array.from({ length: numTeams }, () => []);

    shuffled.forEach((player, index) => {
        const teamIndex = index % numTeams;
        teams[teamIndex].push(player);
    });

    return teams;
}
