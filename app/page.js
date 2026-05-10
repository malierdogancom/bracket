'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { db } from '@/lib/firebase';
import { collection, query, orderBy, onSnapshot } from 'firebase/firestore';

export default function Home() {
    const [events, setEvents] = useState([]);
    const [selectedEventId, setSelectedEventId] = useState(null);
    const [loading, setLoading] = useState(true);
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);
    const [searchTeam, setSearchTeam] = useState('');

    const selectedEvent = events.find(e => e.id === selectedEventId) || events[0] || null;

    // Clear search when switching events
    useEffect(() => { setSearchTeam(''); }, [selectedEventId]);

    useEffect(() => {
        const q = query(collection(db, 'brackets'), orderBy('createdAt', 'desc'));
        const unsubscribe = onSnapshot(q, (querySnapshot) => {
            const eventsData = querySnapshot.docs
                .map(doc => ({ id: doc.id, ...doc.data() }))
                .filter(e => !e.isArchived);
            setEvents(eventsData);
            setLoading(false);
        }, (error) => {
            console.error("Error fetching events:", error);
            setLoading(false);
        });
        return () => unsubscribe();
    }, []);

    if (loading) return <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white">Loading Events...</div>;

    if (events.length === 0) return (
        <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white">
            <div className="text-center">
                <h1 className="text-4xl font-bold mb-4">Event Organizer</h1>
                <p className="text-gray-400">No active events found.</p>
                <div className="mt-8">
                    <Link href="/login" className="text-blue-400 hover:text-blue-300 underline">Admin Login</Link>
                </div>
            </div>
        </div>
    );

    // --- Renderers ---

    const renderTeams = (event) => (
        <div className="max-w-6xl mx-auto">
            <h2 className="text-3xl font-bold text-center mb-12 text-purple-400">Team Generator Results</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
                {event.data.teams.map((team, idx) => (
                    <div key={idx} className="bg-gray-800 rounded-xl shadow-lg border border-gray-700 overflow-hidden">
                        <div className="bg-purple-900/50 p-4 border-b border-gray-700">
                            <h3 className="text-xl font-bold text-center">Team {idx + 1}</h3>
                        </div>
                        <div className="p-6">
                            <ul className="space-y-2">
                                {team.map((player, i) => (
                                    <li key={i} className="flex items-center space-x-2">
                                        <span className="w-2 h-2 bg-purple-500 rounded-full"></span>
                                        <span className="text-gray-200">{player}</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );

    const renderTournament = (event) => {
        const rounds = event.data.rounds;
        // Turkish-aware case-insensitive comparison (handles İ→i, I→ı etc.)
        const tr = (s) => (s || '').toLocaleLowerCase('tr-TR');
        const searchLower = tr(searchTeam).trim();

        // Collect all matches (including completed) where the searched team plays
        const teamMatches = [];
        if (searchLower) {
            rounds.forEach((round, rIdx) => {
                round.matches.forEach((match) => {
                    if (match.team1 === 'BAY' || match.team2 === 'BAY') return;
                    if (tr(match.team1).includes(searchLower) || tr(match.team2).includes(searchLower)) {
                        teamMatches.push({ match, roundIdx: rIdx });
                    }
                });
            });
        }

        const roundLabel = (rIdx) => {
            if (rIdx === rounds.length - 1) return 'Final';
            if (rIdx === rounds.length - 2) return 'Yarı Final';
            return `Tur ${rIdx + 1}`;
        };

        const matchContainsSearch = (match) => {
            if (!searchLower) return false;
            return tr(match.team1).includes(searchLower) || tr(match.team2).includes(searchLower);
        };

        const shouldDim = (match) => searchLower && !matchContainsSearch(match);

        return (
            <div className="flex flex-col h-full">
                <h2 className="text-4xl font-bold text-center mb-6 text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-cyan-400">
                    {event.name}
                </h2>

                {/* Team Search */}
                <div className="max-w-md mx-auto w-full mb-6 px-4">
                    <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">🔍</span>
                        <input
                            type="text"
                            value={searchTeam}
                            onChange={(e) => setSearchTeam(e.target.value)}
                            placeholder="Takımını ara..."
                            className="w-full pl-9 pr-8 py-2.5 rounded-lg bg-gray-800 border border-gray-600 focus:border-blue-500 focus:outline-none text-white placeholder-gray-500 text-sm transition"
                        />
                        {searchTeam && (
                            <button
                                onClick={() => setSearchTeam('')}
                                className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
                            >✕</button>
                        )}
                    </div>
                </div>

                {/* Search Results Summary */}
                {searchLower && (
                    <div className="max-w-2xl mx-auto w-full mb-6 px-4">
                        {teamMatches.length === 0 ? (
                            <p className="text-center text-gray-500 text-sm">"{searchTeam}" adında takım bulunamadı.</p>
                        ) : (
                            <div className="bg-blue-950/50 border border-blue-700/40 rounded-xl p-4">
                                <p className="text-blue-300 font-semibold text-sm mb-3">
                                    {teamMatches[0].match.team1?.toLowerCase().includes(searchLower)
                                        ? teamMatches[0].match.team1
                                        : teamMatches[0].match.team2} — maç programı
                                </p>
                                <div className="space-y-2">
                                    {teamMatches.map(({ match, roundIdx }, i) => {
                                        const myTeam = tr(match.team1).includes(searchLower) ? match.team1 : match.team2;
                                        const opponent = myTeam === match.team1 ? match.team2 : match.team1;
                                        const won = match.winner && match.winner === myTeam;
                                        const lost = match.winner && match.winner !== myTeam;
                                        return (
                                            <div key={i} className="flex items-center gap-3 text-sm flex-wrap">
                                                <span className="text-gray-400 text-xs w-20 shrink-0">{roundLabel(roundIdx)}</span>
                                                <span className="text-gray-300">vs <strong className="text-white">{opponent || 'TBD'}</strong></span>
                                                {won && <span className="text-green-400 text-xs font-semibold">Kazandı ✓</span>}
                                                {lost && <span className="text-red-400 text-xs">Kaybetti</span>}
                                                {match.schedule ? (
                                                    <div className="flex items-center gap-1.5 ml-auto text-xs">
                                                        <span className="text-gray-400">{match.schedule.tarih}</span>
                                                        <span className="text-yellow-400 font-mono font-bold">{match.schedule.saat}</span>
                                                        <span className="bg-gray-700 text-gray-200 px-2 py-0.5 rounded">Masa {match.schedule.masa}</span>
                                                    </div>
                                                ) : !match.winner && (
                                                    <span className="ml-auto text-xs text-gray-600">Program bekleniyor</span>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        )}
                    </div>
                )}

                {/* Bracket */}
                <div className="flex-1 overflow-x-auto pb-12">
                    <div className="flex justify-center min-w-max px-8 space-x-16">
                        {rounds.map((round, roundIdx) => (
                            <div key={roundIdx} className="flex flex-col justify-around">
                                <div className="text-center mb-4 text-gray-500 font-mono text-sm uppercase tracking-widest">
                                    {roundIdx === rounds.length - 1 ? 'Final' :
                                        roundIdx === rounds.length - 2 ? 'Semi-Finals' :
                                            `Round ${roundIdx + 1}`}
                                </div>

                                <div className="flex flex-col justify-around h-full space-y-8">
                                    {round.matches.map((match, matchIdx) => {
                                        const highlighted = matchContainsSearch(match);
                                        const dimmed = shouldDim(match);
                                        return (
                                            <div key={matchIdx} className={`relative group transition-opacity duration-200 ${dimmed ? 'opacity-20' : 'opacity-100'}`}>
                                                <div className={`w-56 bg-gray-800 border rounded-lg p-3 shadow-lg transition-all
                                                    ${highlighted ? 'border-yellow-400 shadow-yellow-400/20 shadow-md' :
                                                      match.winner ? 'border-blue-500/50' : 'border-gray-700'}
                                                    ${!dimmed ? 'hover:border-blue-500' : ''}
                                                `}>
                                                    <div className="flex justify-between items-center mb-2 pb-2 border-b border-gray-700/50">
                                                        <span className={`
                                                            ${match.winner === match.team1 ? 'text-green-400 font-bold' :
                                                              highlighted && tr(match.team1).includes(searchLower) ? 'text-yellow-300 font-semibold' :
                                                              'text-gray-300'}
                                                        `}>
                                                            {match.team1 || 'TBD'}
                                                        </span>
                                                        {match.winner === match.team1 && <span className="text-green-500">✓</span>}
                                                    </div>
                                                    <div className="flex justify-between items-center">
                                                        <span className={`
                                                            ${match.winner === match.team2 ? 'text-green-400 font-bold' :
                                                              highlighted && tr(match.team2).includes(searchLower) ? 'text-yellow-300 font-semibold' :
                                                              'text-gray-300'}
                                                        `}>
                                                            {match.team2 || 'TBD'}
                                                        </span>
                                                        {match.winner === match.team2 && <span className="text-green-500">✓</span>}
                                                    </div>
                                                    {match.schedule && (
                                                        <div className="mt-2 pt-2 border-t border-gray-700/50 flex items-center gap-1 flex-wrap text-xs">
                                                            <span className="text-gray-500">{match.schedule.tarih}</span>
                                                            <span className="text-yellow-400 font-mono">{match.schedule.saat}</span>
                                                            <span className="bg-gray-700 text-gray-300 px-1.5 py-0.5 rounded">Masa {match.schedule.masa}</span>
                                                        </div>
                                                    )}
                                                </div>

                                                {roundIdx < rounds.length - 1 && (
                                                    <div className="absolute top-1/2 -right-8 w-8 h-px bg-gray-700 hidden md:block"></div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
    };

    const buildDate = process.env.NEXT_PUBLIC_BUILD_DATE
        ? new Date(process.env.NEXT_PUBLIC_BUILD_DATE).toLocaleDateString('tr-TR', { day: 'numeric', month: 'long', year: 'numeric' })
        : null;

    return (
        <main className="flex min-h-screen bg-gray-900 text-white">
            {/* Sidebar for Desktop */}
            <aside className="hidden md:flex flex-col w-64 bg-gray-800 border-r border-gray-700">
                <div className="p-4 border-b border-gray-700">
                    <h1 className="text-xl font-bold text-blue-400">Events</h1>
                </div>
                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                    {events.map(event => (
                        <button
                            key={event.id}
                            onClick={() => setSelectedEventId(event.id)}
                            className={`w-full text-left px-4 py-3 rounded transition-colors ${selectedEvent?.id === event.id ? 'bg-blue-600 text-white' : 'hover:bg-gray-700 text-gray-300'}`}
                        >
                            <div className="font-semibold truncate">{event.name || `Teams (${event.config.numTeams})`}</div>
                            <div className="text-xs text-gray-400 mt-1">{new Date(event.createdAt?.seconds * 1000).toLocaleDateString('tr-TR')}</div>
                        </button>
                    ))}
                </div>
                <div className="p-4 border-t border-gray-700">
                    <Link href="/login" className="block w-full text-center bg-gray-700 hover:bg-gray-600 py-2 rounded text-sm transition text-gray-300 hover:text-white">
                        Admin Login
                    </Link>
                </div>
            </aside>

            {/* Mobile Header & Content */}
            <div className="flex-1 flex flex-col h-screen overflow-hidden">
                {/* Mobile Header */}
                <div className="md:hidden bg-gray-800 p-4 flex justify-between items-center border-b border-gray-700">
                    <h1 className="text-xl font-bold">Event Organizer</h1>
                    <div className="flex items-center space-x-4">
                        <Link href="/login" className="text-sm text-gray-400 hover:text-white">Login</Link>
                        <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="text-gray-300 hover:text-white">
                            {isSidebarOpen ? 'Close' : 'Events'}
                        </button>
                    </div>
                </div>

                {/* Mobile Sidebar Overlay */}
                {isSidebarOpen && (
                    <div className="md:hidden absolute top-16 left-0 w-full bg-gray-800 border-b border-gray-700 z-50 max-h-[50vh] overflow-y-auto shadow-xl">
                        {events.map(event => (
                            <button
                                key={event.id}
                                onClick={() => { setSelectedEventId(event.id); setIsSidebarOpen(false); }}
                                className={`w-full text-left px-6 py-4 border-b border-gray-700 ${selectedEvent?.id === event.id ? 'bg-blue-900/50 text-blue-200' : 'text-gray-300'}`}
                            >
                                <div className="font-semibold">{event.name || `Teams (${event.config.numTeams})`}</div>
                            </button>
                        ))}
                    </div>
                )}

                {/* Main Content Area */}
                <div className="flex-1 overflow-auto p-8">
                    {selectedEvent && (
                        selectedEvent.type === 'teams' ? renderTeams(selectedEvent) : renderTournament(selectedEvent)
                    )}
                </div>
            </div>

            {buildDate && (
                <div className="fixed bottom-2 right-3 text-xs text-gray-600 pointer-events-none">
                    Son güncelleme: {buildDate}
                </div>
            )}
        </main>
    );
}
