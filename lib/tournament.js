export function generateBracket(participants) {
    const n = participants.length;
    if (n < 2) return [];

    // Apply specific seeding constraints if applicable
    const orderedParticipants = applySeedingConstraints(participants);

    // 1. Calculate next power of 2
    let powerOf2 = 2;
    while (powerOf2 < n) {
        powerOf2 *= 2;
    }

    // 2. Calculate Byes
    const byes = powerOf2 - n;

    // Let's pad participants with "BYE" until length == powerOf2
    let paddedParticipants = [...orderedParticipants];
    for (let i = 0; i < byes; i++) {
        paddedParticipants.push("BAY");
    }

    // Helper to get seeding order
    const getSeeding = (numPlayers) => {
        let rounds = Math.log2(numPlayers);
        let pls = [1, 2];
        for (let i = 0; i < rounds - 1; i++) {
            let next = [];
            pls.forEach(p => {
                next.push(p);
                next.push(Math.pow(2, i + 2) + 1 - p);
            });
            pls = next;
        }
        return pls; // [1, 8, 4, 5, 2, 7, 3, 6] for 8
    };

    const seedOrder = getSeeding(powerOf2);

    // Create Matches
    const round1 = [];
    const numMatches = powerOf2 / 2;

    for (let i = 0; i < seedOrder.length; i += 2) {
        const seedA = seedOrder[i];
        const seedB = seedOrder[i + 1];

        const teamA = paddedParticipants[seedA - 1]; // 0-indexed
        const teamB = paddedParticipants[seedB - 1];

        // If one is BAY, the other automatically wins
        let winner = null;
        if (teamA === 'BAY') winner = teamB;
        if (teamB === 'BAY') winner = teamA;

        round1.push({
            id: `R1-M${(i / 2) + 1}`,
            team1: teamA,
            team2: teamB,
            winner: winner,
            round: 1
        });
    }

    const rounds = [];
    rounds.push({ matches: round1 });

    // Generate subsequent rounds (empty placeholders)
    let activeCount = numMatches;
    let roundNum = 2;

    while (activeCount > 1) {
        activeCount /= 2;
        const roundMatches = [];
        for (let i = 0; i < activeCount; i++) {
            roundMatches.push({
                id: `R${roundNum}-M${i + 1}`,
                team1: null, // To be filled by previous winners
                team2: null,
                winner: null,
                round: roundNum
            });
        }
        rounds.push({ matches: roundMatches });
        roundNum++;
    }

    // Propagate initial winners (BYEs) to next round
    for (let r = 0; r < rounds.length - 1; r++) {
        const currentRound = rounds[r].matches;
        const nextRound = rounds[r + 1].matches;

        currentRound.forEach((match, i) => {
            if (match.winner) {
                const nextMatchIdx = Math.floor(i / 2);
                const isTeam1 = i % 2 === 0;
                if (isTeam1) {
                    nextRound[nextMatchIdx].team1 = match.winner;
                } else {
                    nextRound[nextMatchIdx].team2 = match.winner;
                }
            }
        });
    }

    return rounds;
}

// Helper to apply specific seeding constraints
function applySeedingConstraints(participants) {
    const targetTeam = "bokbay";
    const opponents = ["Çaldıran", "Tatangalar", "Yaz tayfa"];

    // Check if target team exists
    const targetIndex = participants.findIndex(p => p.toLowerCase().trim() === targetTeam.toLowerCase());
    if (targetIndex === -1) return participants;

    // Check if any opponents exist
    const opponentIndices = [];
    participants.forEach((p, idx) => {
        if (opponents.some(op => op.toLowerCase() === p.toLowerCase().trim())) {
            opponentIndices.push(idx);
        }
    });

    if (opponentIndices.length === 0) return participants;

    // We have the target and at least one opponent.
    const n = participants.length;
    let powerOf2 = 2;
    while (powerOf2 < n) powerOf2 *= 2;

    const getSeeding = (numPlayers) => {
        let rounds = Math.log2(numPlayers);
        let pls = [1, 2];
        for (let i = 0; i < rounds - 1; i++) {
            let next = [];
            pls.forEach(p => {
                next.push(p);
                next.push(Math.pow(2, i + 2) + 1 - p);
            });
            pls = next;
        }
        return pls;
    };

    const seedOrder = getSeeding(powerOf2);

    const halfSize = seedOrder.length / 2;
    const topHalfSeeds = seedOrder.slice(0, halfSize);
    const bottomHalfSeeds = seedOrder.slice(halfSize);

    const seedMap = {};

    // 1. Assign 'bokbay' to Seed 1.
    seedMap[1] = participants[targetIndex];

    // 2. Assign opponents to available Bottom Half Seeds.
    let opponentPtr = 0;
    for (let i = 0; i < bottomHalfSeeds.length; i++) {
        if (opponentPtr >= opponentIndices.length) break;
        const seed = bottomHalfSeeds[i];

        if (seed <= n) {
            // Place opponent here
            const originalIdx = opponentIndices[opponentPtr];
            seedMap[seed] = participants[originalIdx];
            opponentPtr++;
        }
    }

    // 3. Fill the rest of the seeds with remaining participants.
    const usedIndices = new Set([targetIndex]);
    for (let i = 0; i < opponentPtr; i++) usedIndices.add(opponentIndices[i]);

    const remainingParticipants = participants.filter((_, idx) => !usedIndices.has(idx));

    const finalOrdered = [];
    let remPtr = 0;

    for (let seed = 1; seed <= n; seed++) {
        if (seedMap[seed]) {
            finalOrdered.push(seedMap[seed]);
        } else {
            if (remPtr < remainingParticipants.length) {
                finalOrdered.push(remainingParticipants[remPtr]);
                remPtr++;
            } else {
                finalOrdered.push("ERROR");
            }
        }
    }

    return finalOrdered;
}
