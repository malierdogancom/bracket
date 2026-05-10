interface Day {
  tarih: string;
  baslangic: string;
  bitis: string;
}

export interface ScheduleConfig {
  masaSayisi: number;
  macSuresi: number;
  araDakika: number;
  gunler: Day[];
}

function timeToMinutes(t: string): number {
  const [h, m] = t.split(':').map(Number);
  return h * 60 + m;
}

function minutesToTime(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

interface Slot {
  tarih: string;
  saat: string;
  masa: number;
  absStart: number;
  absEnd: number;
}

// Takes bracket rounds (from generateBracket) + config → same rounds with match.schedule injected.
// BYE matches (team1 or team2 === 'BAY') are not scheduled.
// Rounds are scheduled sequentially: round N cannot start before all round N-1 matches finish.
// Within a round, matches fill available table slots in parallel.
export function generateSchedule(rounds: any[], config: ScheduleConfig): any[] {
  const { masaSayisi, macSuresi, araDakika, gunler } = config;
  const slotInterval = macSuresi + araDakika;

  // Build ordered list of all available slots across all days and tables.
  // absStart uses dayIndex * 24*60 + timeMinutes so we can compare across days.
  const allSlots: Slot[] = [];

  gunler.forEach((day, dayIdx) => {
    const dayBase = dayIdx * 24 * 60;
    const dayEndMinutes = timeToMinutes(day.bitis);
    let wave = timeToMinutes(day.baslangic);

    while (wave + macSuresi <= dayEndMinutes) {
      for (let masa = 1; masa <= masaSayisi; masa++) {
        allSlots.push({
          tarih: day.tarih,
          saat: minutesToTime(wave),
          masa,
          absStart: dayBase + wave,
          absEnd: dayBase + wave + macSuresi,
        });
      }
      wave += slotInterval;
    }
  });

  allSlots.sort((a, b) => a.absStart - b.absStart || a.masa - b.masa);

  const scheduledRounds = JSON.parse(JSON.stringify(rounds));
  let slotCursor = 0;
  let roundMinStartAbs = 0;

  for (const round of scheduledRounds) {
    let roundMaxEndAbs = roundMinStartAbs;

    for (const match of round.matches) {
      if (match.team1 === 'BAY' || match.team2 === 'BAY') continue;

      // Advance cursor past slots that are before this round can start
      while (slotCursor < allSlots.length && allSlots[slotCursor].absStart < roundMinStartAbs) {
        slotCursor++;
      }

      if (slotCursor >= allSlots.length) {
        match.schedule = null;
        continue;
      }

      const slot = allSlots[slotCursor];
      match.schedule = { tarih: slot.tarih, saat: slot.saat, masa: slot.masa };
      roundMaxEndAbs = Math.max(roundMaxEndAbs, slot.absEnd);
      slotCursor++;
    }

    roundMinStartAbs = roundMaxEndAbs;
  }

  return scheduledRounds;
}
