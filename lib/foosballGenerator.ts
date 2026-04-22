import Papa from 'papaparse';
import _ from 'lodash';

export interface Player {
    name: string;
    position: 'Forvet' | 'Defans';
    source: 'individual' | 'team';
    phone?: string;
}

export interface GeneratedTeam {
    name: string;
    phones: { name: string, number: string }[];
}

export const parseFoosballCSV = (file: File, mode: 'individual' | 'team'): Promise<Player[]> => {
    return new Promise((resolve, reject) => {
        Papa.parse(file, {
            header: true,
            skipEmptyLines: true,
            complete: (results) => {
                const players: Player[] = [];

                if (mode === 'individual') {
                    results.data.forEach((row: any) => {
                        const name = row["İsim Soyisim"] || row["Name"] || row["name"];
                        let positionRaw = row["Mevkii"] || row["Position"] || row["position"];
                        const phone = row["Tel No"] || row["Phone"] || row["phone"];

                        if (name) {
                            // Normalize position
                            let position: 'Forvet' | 'Defans' = 'Defans';
                            if (positionRaw) {
                                const p = positionRaw.toLowerCase().trim();
                                if (p === 'forvet' || p === 'fw' || p === 'forward') {
                                    position = 'Forvet';
                                }
                            }

                            players.push({
                                name: name.trim(),
                                position: position,
                                source: 'individual',
                                phone: phone ? phone.toString().trim() : undefined
                            });
                        }
                    });
                } else {
                    // Team mode
                    results.data.forEach((row: any) => {
                        const teamName = row["Takımınızın Adı"] || row["Team Name"] || row["team"];
                        // Try to extract phones for team members if available
                        // "1. Oyuncu Tel No", "2. Oyuncu Tel No"
                        const p1Phone = row["1. Oyuncu Tel No"] || row["Player 1 Phone"];
                        const p2Phone = row["2. Oyuncu Tel No"] || row["Player 2 Phone"];

                        // We'll store these phones on the "Player" object which represents the team
                        // Since our Player interface has a single phone field, we might need to be creative 
                        // or just store the first one, but the requirement says "store the extracted numbers".
                        // Let's just store them comma separated or handle it in the generator.
                        // Actually, for premade teams, we are treating the "Player" object as the Team entity.
                        // Let's store both phones in the 'phone' field separated by comma if needed, 
                        // OR better, let's just attach them to the final GeneratedTeam object.
                        // For now, let's put them in the phone field as a JSON string or delimiter? 
                        // No, let's keep it simple. We'll use a delimiter "||" to store multiple phones if needed in this temp structure.

                        let phones = [];
                        if (p1Phone) phones.push(p1Phone);
                        if (p2Phone) phones.push(p2Phone);

                        if (teamName) {
                            players.push({
                                name: teamName.trim(),
                                position: 'Forvet', // Dummy
                                source: 'team',
                                phone: phones.length > 0 ? phones.join('||') : undefined
                            });
                        }
                    });
                }
                resolve(players);
            },
            error: (error) => {
                reject(error);
            }
        });
    });
};

export const generateBalancedSquads = (individuals: Player[]): GeneratedTeam[] => {
    const forwards = individuals.filter(p => p.position === 'Forvet');
    const defenders = individuals.filter(p => p.position === 'Defans');

    const shuffledForwards = _.shuffle(forwards);
    const shuffledDefenders = _.shuffle(defenders);

    const teams: GeneratedTeam[] = [];

    let fIndex = 0;
    let dIndex = 0;

    while (fIndex < shuffledForwards.length && dIndex < shuffledDefenders.length) {
        const fw = shuffledForwards[fIndex];
        const def = shuffledDefenders[dIndex];

        const teamPhones = [];
        if (fw.phone) teamPhones.push({ name: fw.name, number: fw.phone });
        if (def.phone) teamPhones.push({ name: def.name, number: def.phone });

        teams.push({
            name: formatTeamName(fw.name, def.name),
            phones: teamPhones
        });

        fIndex++;
        dIndex++;
    }

    // Leftovers
    const leftovers: Player[] = [
        ...shuffledForwards.slice(fIndex),
        ...shuffledDefenders.slice(dIndex)
    ];

    const shuffledLeftovers = _.shuffle(leftovers);

    for (let i = 0; i < shuffledLeftovers.length; i += 2) {
        if (i + 1 < shuffledLeftovers.length) {
            const p1 = shuffledLeftovers[i];
            const p2 = shuffledLeftovers[i + 1];

            const teamPhones = [];
            if (p1.phone) teamPhones.push({ name: p1.name, number: p1.phone });
            if (p2.phone) teamPhones.push({ name: p2.name, number: p2.phone });

            teams.push({
                name: formatTeamName(p1.name, p2.name),
                phones: teamPhones
            });
        } else {
            // Single player
            const p1 = shuffledLeftovers[i];
            const teamPhones = [];
            if (p1.phone) teamPhones.push({ name: p1.name, number: p1.phone });

            teams.push({
                name: p1.name,
                phones: teamPhones
            });
        }
    }

    return teams;
};

const formatTeamName = (name1: string, name2: string): string => {
    const getInitials = (name: string) => {
        return name.split(' ').map(n => n[0].toUpperCase()).join('');
    };
    return `${getInitials(name1)} & ${getInitials(name2)}`;
};
