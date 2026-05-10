'use client';
import { useState, useEffect } from 'react';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import { collection, addDoc, serverTimestamp, updateDoc, doc, query, orderBy, getDocs, deleteDoc, where } from 'firebase/firestore';
import { generateBracket } from '@/lib/tournament';
import { generateTeams } from '@/lib/teams';
import { parseFoosballCSV, generateBalancedSquads, parseLangirtCSV } from '@/lib/foosballGenerator';
import { generateSchedule } from '@/lib/scheduleGenerator';
import _ from 'lodash';
import { Phone } from 'lucide-react';

const DEFAULT_LANGIRT_CONFIG = {
    masaSayisi: 2,
    macSuresi: 10,
    araDakika: 5,
    gunler: [{ tarih: '', baslangic: '09:00', bitis: '18:00' }],
};

export default function Admin() {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const router = useRouter();
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    // UI State
    const [activeTab, setActiveTab] = useState('tournament');
    const [message, setMessage] = useState('');
    const [events, setEvents] = useState([]);

    // Common Input
    const [namesInput, setNamesInput] = useState('');

    // Tournament State
    const [tournamentName, setTournamentName] = useState('');
    const [activeTournament, setActiveTournament] = useState(null);

    // Teams State
    const [numTeams, setNumTeams] = useState(2);
    const [generatedTeams, setGeneratedTeams] = useState(null);

    // Generator State
    const [individualFile, setIndividualFile] = useState(null);
    const [teamFile, setTeamFile] = useState(null);
    const [generatedPreview, setGeneratedPreview] = useState([]);
    const [isGeneratorOpen, setIsGeneratorOpen] = useState(false);

    // Metadata State
    const [teamMetadata, setTeamMetadata] = useState({});

    // Langirt State
    const [langirtFile, setLangirtFile] = useState(null);
    const [langirtTeams, setLangirtTeams] = useState([]);
    const [langirtConfig, setLangirtConfig] = useState(DEFAULT_LANGIRT_CONFIG);
    const [langirtName, setLangirtName] = useState('Langırt Turnuvası');
    const [langirtPreview, setLangirtPreview] = useState(null);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
            if (!currentUser) {
                router.push('/login');
            } else {
                setUser(currentUser);
                fetchEvents(currentUser.uid);
            }
            setLoading(false);
        });
        return () => unsubscribe();
    }, [router]);

    const fetchEvents = async (uid = user?.uid) => {
        if (!uid) return;
        try {
            const q = query(
                collection(db, 'brackets'),
                where('ownerId', '==', uid),
                orderBy('createdAt', 'desc')
            );
            const querySnapshot = await getDocs(q);
            const eventsData = querySnapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
            setEvents(eventsData);
        } catch (error) {
            console.error("Error fetching events:", error);
        }
    };

    const handleLogout = () => signOut(auth);

    // --- Tournament Actions ---

    const handleCreateTournament = async () => {
        const participants = namesInput.split('\n').map(n => n.trim()).filter(n => n);
        if (!tournamentName || participants.length < 2) {
            setMessage('Please enter a name and at least 2 participants.');
            return;
        }

        const rounds = generateBracket(participants);

        try {
            const docRef = await addDoc(collection(db, 'brackets'), {
                type: 'tournament',
                name: tournamentName,
                ownerId: user.uid,
                isArchived: false,
                createdAt: serverTimestamp(),
                config: { participantCount: participants.length },
                data: { rounds, teamMetadata }
            });
            setMessage('Tournament created successfully!');
            setActiveTournament({ id: docRef.id, name: tournamentName, data: { rounds, teamMetadata } });
            setTournamentName('');
            setNamesInput('');
            setTeamMetadata({});
            fetchEvents();
        } catch (error) {
            console.error("Error creating tournament:", error);
            setMessage('Error creating tournament.');
        }
    };

    const handleMatchUpdate = async (roundIdx, matchIdx, winner) => {
        if (!activeTournament || !winner || winner === 'BAY') return;

        const newRoundsDeep = JSON.parse(JSON.stringify(activeTournament.data.rounds));
        const currentMatch = newRoundsDeep[roundIdx].matches[matchIdx];

        currentMatch.winner = winner;

        const nextRoundIdx = roundIdx + 1;
        if (nextRoundIdx < newRoundsDeep.length) {
            const nextMatchIdx = Math.floor(matchIdx / 2);
            const isTeam1 = matchIdx % 2 === 0;
            if (isTeam1) {
                newRoundsDeep[nextRoundIdx].matches[nextMatchIdx].team1 = winner;
            } else {
                newRoundsDeep[nextRoundIdx].matches[nextMatchIdx].team2 = winner;
            }
        }

        setActiveTournament({ ...activeTournament, data: { ...activeTournament.data, rounds: newRoundsDeep } });

        try {
            await updateDoc(doc(db, 'brackets', activeTournament.id), { 'data.rounds': newRoundsDeep });
            fetchEvents();
        } catch (err) {
            console.error('Error updating bracket:', err);
            setMessage('Error updating match.');
        }
    };

    const handleMatchReset = async (roundIdx, matchIdx) => {
        if (!activeTournament) return;

        const newRoundsDeep = JSON.parse(JSON.stringify(activeTournament.data.rounds));
        const currentMatch = newRoundsDeep[roundIdx].matches[matchIdx];

        if (!currentMatch.winner) return;

        currentMatch.winner = null;

        const nextRoundIdx = roundIdx + 1;
        if (nextRoundIdx < newRoundsDeep.length) {
            const nextMatchIdx = Math.floor(matchIdx / 2);
            const isTeam1 = matchIdx % 2 === 0;
            if (isTeam1) {
                newRoundsDeep[nextRoundIdx].matches[nextMatchIdx].team1 = null;
            } else {
                newRoundsDeep[nextRoundIdx].matches[nextMatchIdx].team2 = null;
            }
        }

        setActiveTournament({ ...activeTournament, data: { ...activeTournament.data, rounds: newRoundsDeep } });

        try {
            await updateDoc(doc(db, 'brackets', activeTournament.id), { 'data.rounds': newRoundsDeep });
        } catch (err) {
            console.error('Error resetting match:', err);
            setMessage('Error resetting match.');
        }
    };

    // --- Teams Actions ---

    const handleGenerateTeams = () => {
        const participants = namesInput.split('\n').map(n => n.trim()).filter(n => n);
        if (participants.length < numTeams) {
            setMessage('More teams than participants!');
            return;
        }
        const teams = generateTeams(participants, parseInt(numTeams));
        setGeneratedTeams(teams);
        setMessage('Teams generated! Review and Save.');
    };

    const handleSaveTeams = async () => {
        if (!generatedTeams) return;
        try {
            await addDoc(collection(db, 'brackets'), {
                type: 'teams',
                ownerId: user.uid,
                isArchived: false,
                createdAt: serverTimestamp(),
                config: { numTeams },
                data: { teams: generatedTeams }
            });
            setMessage('Teams saved successfully!');
            setGeneratedTeams(null);
            setNamesInput('');
            fetchEvents();
        } catch (error) {
            setMessage('Error saving teams.');
        }
    };

    // --- Generator Actions ---

    const handleProcessGenerator = async () => {
        try {
            let allTeams = [];
            if (individualFile) {
                const individuals = await parseFoosballCSV(individualFile, 'individual');
                const squads = generateBalancedSquads(individuals);
                allTeams = [...allTeams, ...squads];
            }
            if (teamFile) {
                const teams = await parseFoosballCSV(teamFile, 'team');
                const teamObjects = teams.map(t => {
                    let phones = [];
                    if (t.phone) {
                        phones = t.phone.split('||').map((p, i) => ({ name: `Player ${i + 1}`, number: p }));
                    }
                    return { name: t.name, phones };
                });
                allTeams = [...allTeams, ...teamObjects];
            }
            if (allTeams.length === 0) { setMessage('No players or teams found in files.'); return; }
            const shuffled = _.shuffle(allTeams);
            setGeneratedPreview(shuffled);
            setMessage(`Generated ${shuffled.length} teams/squads.`);
        } catch (error) {
            setMessage('Error processing files. Check CSV format.');
        }
    };

    const handleCommitToTournament = () => {
        if (generatedPreview.length === 0) return;
        const currentNames = namesInput.split('\n').map(n => n.trim()).filter(n => n);
        const newNames = generatedPreview.map(t => t.name);
        const newMetadata = { ...teamMetadata };
        generatedPreview.forEach(t => {
            if (t.phones && t.phones.length > 0) newMetadata[t.name] = t.phones;
        });
        setTeamMetadata(newMetadata);
        setNamesInput([...currentNames, ...newNames].join('\n'));
        setGeneratedPreview([]);
        setIndividualFile(null);
        setTeamFile(null);
        setMessage(`Successfully added ${generatedPreview.length} teams to the bracket pool.`);
    };

    const handleRemovePreviewItem = (idx) => {
        const newPreview = [...generatedPreview];
        newPreview.splice(idx, 1);
        setGeneratedPreview(newPreview);
    };

    // --- Langirt Actions ---

    const handleParseLangirt = async () => {
        if (!langirtFile) { setMessage('Önce CSV dosyası seç.'); return; }
        try {
            const teams = await parseLangirtCSV(langirtFile);
            setLangirtTeams(teams);
            setLangirtPreview(null);
            setMessage(`${teams.length} takım yüklendi.`);
        } catch (err) {
            setMessage('CSV okuma hatası: ' + err.message);
        }
    };

    const handleGenerateLangirtSchedule = () => {
        if (langirtTeams.length < 2) { setMessage('En az 2 takım gerekli.'); return; }
        const invalidDays = langirtConfig.gunler.some(g => !g.tarih);
        if (invalidDays) { setMessage('Tüm günler için tarih gir.'); return; }
        const names = langirtTeams.map(t => t.name);
        const rounds = generateBracket(names);
        const scheduledRounds = generateSchedule(rounds, langirtConfig);
        setLangirtPreview({ rounds: scheduledRounds });
        setMessage('Program oluşturuldu. Kaydetmek için aşağıdaki butona bas.');
    };

    const handleSaveLangirt = async () => {
        if (!langirtPreview || !langirtName.trim()) { setMessage('Turnuva adı gir.'); return; }
        const metadata = {};
        langirtTeams.forEach(t => {
            if (t.phones && t.phones.length > 0) metadata[t.name] = t.phones;
        });
        try {
            const docRef = await addDoc(collection(db, 'brackets'), {
                type: 'tournament',
                name: langirtName.trim(),
                ownerId: user.uid,
                isArchived: false,
                createdAt: serverTimestamp(),
                config: {
                    participantCount: langirtTeams.length,
                    tournamentType: 'langirt',
                    schedule: langirtConfig,
                },
                data: { rounds: langirtPreview.rounds, teamMetadata: metadata }
            });
            setMessage('Langırt turnuvası oluşturuldu!');
            setActiveTournament({
                id: docRef.id,
                name: langirtName.trim(),
                config: { tournamentType: 'langirt', schedule: langirtConfig },
                data: { rounds: langirtPreview.rounds, teamMetadata: metadata }
            });
            setLangirtPreview(null);
            setLangirtTeams([]);
            setLangirtFile(null);
            setLangirtConfig(DEFAULT_LANGIRT_CONFIG);
            fetchEvents();
        } catch (error) {
            setMessage('Hata: ' + error.message);
        }
    };

    const updateLangirtGun = (idx, field, value) => {
        setLangirtConfig(prev => {
            const gunler = [...prev.gunler];
            gunler[idx] = { ...gunler[idx], [field]: value };
            return { ...prev, gunler };
        });
    };

    // --- Event Selection ---

    const handleDeleteEvent = async (id) => {
        if (!confirm('Bu etkinliği silmek istediğine emin misin?')) return;
        try {
            await deleteDoc(doc(db, 'brackets', id));
            setMessage('Etkinlik silindi.');
            if (activeTournament?.id === id) setActiveTournament(null);
            fetchEvents();
        } catch (error) {
            setMessage('Error deleting event.');
        }
    };

    const handleToggleArchive = async (event) => {
        try {
            await updateDoc(doc(db, 'brackets', event.id), { isArchived: !event.isArchived });
            setMessage(event.isArchived ? 'Event unarchived.' : 'Event archived.');
            fetchEvents();
        } catch (error) {
            setMessage('Error updating archive status.');
        }
    };

    const handleSelectEvent = (event) => {
        if (event.type === 'tournament') {
            setActiveTab(event.config?.tournamentType === 'langirt' ? 'langirt' : 'tournament');
            setActiveTournament(event);
            setTournamentName(event.name);
            setNamesInput('');
        } else {
            setActiveTab('teams');
            setGeneratedTeams(event.data.teams);
            setNumTeams(event.config.numTeams);
            setNamesInput('');
        }
    };

    // --- Shared Bracket Editor ---

    const renderMatchEditor = () => {
        if (!activeTournament) return null;
        const isLangirt = activeTournament.config?.tournamentType === 'langirt';

        return (
            <div className="pt-2">
                <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-bold text-blue-400">Düzenleniyor: {activeTournament.name}</h3>
                    <button onClick={() => setActiveTournament(null)} className="text-sm text-gray-400 hover:text-white">Kapat</button>
                </div>
                <p className="text-sm text-gray-400 mb-4">Kazananı seçmek için takım adına tıkla. Değişiklikler otomatik kaydedilir.</p>

                <div className="overflow-x-auto pb-4">
                    <div className="flex space-x-8 min-w-max">
                        {activeTournament.data.rounds.map((round, rIdx) => (
                            <div key={rIdx} className="space-y-4">
                                <div className="text-center font-bold text-gray-500">Round {rIdx + 1}</div>
                                {round.matches.map((match, mIdx) => (
                                    <div key={mIdx} className="relative bg-gray-700 p-2 rounded w-52 border border-gray-600">
                                        {match.winner && (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleMatchReset(rIdx, mIdx); }}
                                                className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs shadow-md hover:bg-red-700 z-10"
                                                title="Reset Match"
                                            >✕</button>
                                        )}

                                        {/* Team 1 */}
                                        <div className="flex items-center justify-between">
                                            <div
                                                onClick={() => handleMatchUpdate(rIdx, mIdx, match.team1)}
                                                className={`flex-1 cursor-pointer p-1 hover:bg-gray-600 rounded text-sm ${match.winner === match.team1 ? 'text-green-400 font-bold' : ''}`}
                                            >
                                                {match.team1 || 'TBD'}
                                            </div>
                                            {match.team1 && activeTournament.data.teamMetadata?.[match.team1] && (
                                                <div className="group/phone relative ml-1">
                                                    <button className="text-green-400 hover:text-green-300"><Phone size={12} /></button>
                                                    <div className="absolute right-0 top-full mt-1 w-52 bg-gray-900 border border-gray-700 rounded shadow-xl z-50 hidden group-hover/phone:block p-2">
                                                        {activeTournament.data.teamMetadata[match.team1].map((p, i) => (
                                                            <a key={i} href={`tel:${p.number}`} className="block text-xs text-gray-300 hover:text-white py-1 border-b border-gray-800 last:border-0">
                                                                📞 {p.name}: {p.number}
                                                            </a>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        <div className="border-t border-gray-600 my-1"></div>

                                        {/* Team 2 */}
                                        <div className="flex items-center justify-between">
                                            <div
                                                onClick={() => handleMatchUpdate(rIdx, mIdx, match.team2)}
                                                className={`flex-1 cursor-pointer p-1 hover:bg-gray-600 rounded text-sm ${match.winner === match.team2 ? 'text-green-400 font-bold' : ''}`}
                                            >
                                                {match.team2 || 'TBD'}
                                            </div>
                                            {match.team2 && activeTournament.data.teamMetadata?.[match.team2] && (
                                                <div className="group/phone relative ml-1">
                                                    <button className="text-green-400 hover:text-green-300"><Phone size={12} /></button>
                                                    <div className="absolute right-0 bottom-full mb-1 w-52 bg-gray-900 border border-gray-700 rounded shadow-xl z-50 hidden group-hover/phone:block p-2">
                                                        {activeTournament.data.teamMetadata[match.team2].map((p, i) => (
                                                            <a key={i} href={`tel:${p.number}`} className="block text-xs text-gray-300 hover:text-white py-1 border-b border-gray-800 last:border-0">
                                                                📞 {p.name}: {p.number}
                                                            </a>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {/* Schedule badge (Langirt only) */}
                                        {isLangirt && match.schedule && (
                                            <div className="mt-2 pt-1 border-t border-gray-600 text-xs text-gray-400 flex items-center gap-1 flex-wrap">
                                                <span>{match.schedule.tarih}</span>
                                                <span className="text-yellow-400">{match.schedule.saat}</span>
                                                <span className="bg-gray-600 px-1 rounded">Masa {match.schedule.masa}</span>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        );
    };

    if (loading) return <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white">Loading...</div>;
    if (!user) return null;

    return (
        <div className="flex min-h-screen bg-gray-900 text-white flex-col md:flex-row">
            {/* Mobile Header */}
            <div className="md:hidden bg-gray-800 p-4 flex justify-between items-center border-b border-gray-700">
                <h1 className="font-bold text-xl">Admin Dashboard</h1>
                <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="text-gray-300 hover:text-white">
                    {isSidebarOpen ? 'Kapat' : 'Menü'}
                </button>
            </div>

            {/* Sidebar */}
            <aside className={`
                ${isSidebarOpen ? 'flex' : 'hidden'}
                md:flex flex-col w-full md:w-64 bg-gray-800 border-r border-gray-700
                fixed md:relative z-50 h-[calc(100vh-60px)] md:h-screen top-[60px] md:top-0
            `}>
                <div className="p-4 border-b border-gray-700 flex justify-between items-center">
                    <h1 className="font-bold text-xl">Admin</h1>
                    <button onClick={handleLogout} className="text-xs bg-red-600 px-2 py-1 rounded hover:bg-red-700">Çıkış</button>
                </div>
                <div className="p-4">
                    <button
                        onClick={() => {
                            setActiveTournament(null);
                            setGeneratedTeams(null);
                            setNamesInput('');
                            setMessage('');
                            setTeamMetadata({});
                            setLangirtPreview(null);
                            setLangirtTeams([]);
                        }}
                        className="w-full bg-green-600 hover:bg-green-700 py-2 rounded font-bold mb-4"
                    >
                        + Yeni Etkinlik
                    </button>

                    <h2 className="text-gray-400 text-sm uppercase tracking-wider mb-2">Aktif Etkinlikler</h2>
                    <div className="space-y-2 overflow-y-auto max-h-[40vh] mb-4">
                        {events.filter(e => !e.isArchived).map(event => (
                            <div key={event.id} className="group relative">
                                <button
                                    onClick={() => handleSelectEvent(event)}
                                    className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${activeTournament?.id === event.id ? 'bg-blue-900/50 text-blue-200' : 'hover:bg-gray-700 text-gray-300'}`}
                                >
                                    <div className="truncate font-medium pr-6">
                                        {event.config?.tournamentType === 'langirt' && '🎮 '}
                                        {event.name || `Teams (${event.config?.numTeams})`}
                                    </div>
                                    <div className="text-xs text-gray-500">{new Date(event.createdAt?.seconds * 1000).toLocaleDateString('tr-TR')}</div>
                                </button>
                                <div className="absolute right-2 top-2 flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={(e) => { e.stopPropagation(); handleToggleArchive(event); }} className="text-gray-500 hover:text-yellow-500" title="Arşivle">📥</button>
                                    <button onClick={(e) => { e.stopPropagation(); handleDeleteEvent(event.id); }} className="text-gray-500 hover:text-red-500" title="Sil">✕</button>
                                </div>
                            </div>
                        ))}
                    </div>

                    <h2 className="text-gray-400 text-sm uppercase tracking-wider mb-2 border-t border-gray-700 pt-2">Arşiv</h2>
                    <div className="space-y-2 overflow-y-auto max-h-[30vh]">
                        {events.filter(e => e.isArchived).map(event => (
                            <div key={event.id} className="group relative opacity-75">
                                <button
                                    onClick={() => handleSelectEvent(event)}
                                    className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${activeTournament?.id === event.id ? 'bg-blue-900/50 text-blue-200' : 'hover:bg-gray-700 text-gray-300'}`}
                                >
                                    <div className="truncate font-medium pr-6">{event.name || `Teams (${event.config?.numTeams})`}</div>
                                    <div className="text-xs text-gray-500">{new Date(event.createdAt?.seconds * 1000).toLocaleDateString('tr-TR')}</div>
                                </button>
                                <div className="absolute right-2 top-2 flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button onClick={(e) => { e.stopPropagation(); handleToggleArchive(event); }} className="text-gray-500 hover:text-green-500" title="Arşivden Çıkar">📤</button>
                                    <button onClick={(e) => { e.stopPropagation(); handleDeleteEvent(event.id); }} className="text-gray-500 hover:text-red-500" title="Sil">✕</button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </aside>

            {/* Main Content */}
            <div className="flex-1 p-4 md:p-8 overflow-y-auto h-[calc(100vh-60px)] md:h-screen">
                <div className="max-w-4xl mx-auto">
                    {/* Tabs */}
                    <div className="flex space-x-2 mb-6 flex-wrap gap-y-2">
                        <button
                            onClick={() => setActiveTab('tournament')}
                            className={`px-5 py-2 rounded font-semibold ${activeTab === 'tournament' ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'}`}
                        >
                            Tournament Bracket
                        </button>
                        <button
                            onClick={() => setActiveTab('teams')}
                            className={`px-5 py-2 rounded font-semibold ${activeTab === 'teams' ? 'bg-purple-600' : 'bg-gray-700 hover:bg-gray-600'}`}
                        >
                            Team Generator
                        </button>
                        <button
                            onClick={() => setActiveTab('langirt')}
                            className={`px-5 py-2 rounded font-semibold ${activeTab === 'langirt' ? 'bg-orange-600' : 'bg-gray-700 hover:bg-gray-600'}`}
                        >
                            🎮 Langırt
                        </button>
                    </div>

                    <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
                        {message && (
                            <p className={`mb-4 ${message.includes('Hata') || message.includes('Error') ? 'text-red-400' : 'text-green-400'}`}>
                                {message}
                            </p>
                        )}

                        {/* ===== TOURNAMENT TAB ===== */}
                        {activeTab === 'tournament' && (
                            <div className="space-y-4">
                                {!activeTournament && (
                                    <>
                                        <h2 className="text-xl font-semibold">Create Tournament</h2>

                                        {/* Advanced Generator */}
                                        <div className="mb-8 border border-gray-700 rounded-lg overflow-hidden">
                                            <button
                                                onClick={() => setIsGeneratorOpen(!isGeneratorOpen)}
                                                className="w-full bg-gray-800 p-4 flex justify-between items-center hover:bg-gray-750 transition"
                                            >
                                                <span className="font-bold text-yellow-400">⚡ Advanced Team Generator</span>
                                                <span className="text-gray-400">{isGeneratorOpen ? '▼' : '▶'}</span>
                                            </button>
                                            {isGeneratorOpen && (
                                                <div className="p-4 bg-gray-800/50 border-t border-gray-700 space-y-4">
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                        <div>
                                                            <label className="block text-sm font-medium mb-1 text-gray-300">Upload Individuals CSV</label>
                                                            <input type="file" accept=".csv" onChange={(e) => setIndividualFile(e.target.files[0])} className="w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-900 file:text-blue-200 hover:file:bg-blue-800" />
                                                            <p className="text-xs text-gray-500 mt-1">Cols: "İsim Soyisim", "Mevkii"</p>
                                                        </div>
                                                        <div>
                                                            <label className="block text-sm font-medium mb-1 text-gray-300">Upload Teams CSV</label>
                                                            <input type="file" accept=".csv" onChange={(e) => setTeamFile(e.target.files[0])} className="w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-purple-900 file:text-purple-200 hover:file:bg-purple-800" />
                                                            <p className="text-xs text-gray-500 mt-1">Col: "Takımınızın Adı"</p>
                                                        </div>
                                                    </div>
                                                    <button onClick={handleProcessGenerator} disabled={!individualFile && !teamFile} className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 py-2 rounded font-bold transition disabled:opacity-50 disabled:cursor-not-allowed">
                                                        🚀 Process & Generate
                                                    </button>
                                                    {generatedPreview.length > 0 && (
                                                        <div className="mt-4">
                                                            <div className="flex justify-between items-center mb-2">
                                                                <h4 className="font-bold text-sm text-gray-300">Preview ({generatedPreview.length})</h4>
                                                                <button onClick={handleCommitToTournament} className="bg-green-600 hover:bg-green-500 px-4 py-1 rounded text-sm font-bold">✅ Transfer to Tournament</button>
                                                            </div>
                                                            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-40 overflow-y-auto p-2 bg-gray-900 rounded border border-gray-700">
                                                                {generatedPreview.map((team, idx) => (
                                                                    <div key={idx} className="flex justify-between items-center bg-gray-800 px-2 py-1 rounded text-xs">
                                                                        <div className="flex items-center space-x-2 truncate mr-2">
                                                                            <span>{team.name}</span>
                                                                            {team.phones?.length > 0 && <span className="text-green-500"><Phone size={10} /></span>}
                                                                        </div>
                                                                        <button onClick={() => handleRemovePreviewItem(idx)} className="text-red-500 hover:text-red-400 font-bold">×</button>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>
                                            )}
                                        </div>

                                        <div>
                                            <label className="block text-sm font-medium mb-1">Tournament Name</label>
                                            <input type="text" value={tournamentName} onChange={(e) => setTournamentName(e.target.value)} className="w-full p-2 rounded bg-gray-700 border border-gray-600" placeholder="e.g. Grand Prix" />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium mb-1">Participants (One per line)</label>
                                            <textarea value={namesInput} onChange={(e) => setNamesInput(e.target.value)} className="w-full p-2 rounded bg-gray-700 border border-gray-600 h-40" placeholder="Player 1&#10;Player 2&#10;Player 3..." />
                                        </div>
                                        <button onClick={handleCreateTournament} className="w-full bg-blue-600 hover:bg-blue-700 py-3 rounded font-bold text-lg transition">
                                            Generate & Save Bracket
                                        </button>
                                    </>
                                )}
                                {activeTournament && renderMatchEditor()}
                            </div>
                        )}

                        {/* ===== TEAMS TAB ===== */}
                        {activeTab === 'teams' && (
                            <div className="space-y-4">
                                {!generatedTeams && (
                                    <>
                                        <h2 className="text-xl font-semibold">Generate Teams</h2>
                                        <div>
                                            <label className="block text-sm font-medium mb-1">Participants (One per line)</label>
                                            <textarea value={namesInput} onChange={(e) => setNamesInput(e.target.value)} className="w-full p-2 rounded bg-gray-700 border border-gray-600 h-40" placeholder="Player 1&#10;Player 2&#10;Player 3..." />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium mb-1">Number of Teams</label>
                                            <input type="number" min="2" value={numTeams} onChange={(e) => setNumTeams(e.target.value)} className="w-full p-2 rounded bg-gray-700 border border-gray-600" />
                                        </div>
                                        <button onClick={handleGenerateTeams} className="w-full bg-purple-600 hover:bg-purple-700 py-3 rounded font-bold text-lg transition">Generate Teams</button>
                                    </>
                                )}
                                {generatedTeams && (
                                    <div className="pt-2">
                                        <div className="flex justify-between items-center mb-4">
                                            <h3 className="text-xl font-bold text-purple-400">Generated Teams</h3>
                                            <button onClick={() => setGeneratedTeams(null)} className="text-sm text-gray-400 hover:text-white">Clear / New</button>
                                        </div>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-6">
                                            {generatedTeams.map((team, idx) => (
                                                <div key={idx} className="bg-gray-700 p-4 rounded border border-gray-600">
                                                    <h3 className="font-bold text-lg mb-2 text-purple-400">Team {idx + 1}</h3>
                                                    <ul className="list-disc list-inside">{team.map((p, i) => <li key={i}>{p}</li>)}</ul>
                                                </div>
                                            ))}
                                        </div>
                                        <div className="flex space-x-4">
                                            <button onClick={handleGenerateTeams} className="flex-1 bg-purple-600 hover:bg-purple-700 py-3 rounded font-bold text-lg transition">Re-shuffle</button>
                                            <button onClick={handleSaveTeams} className="flex-1 bg-green-600 hover:bg-green-700 py-3 rounded font-bold text-lg transition">Save as New</button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* ===== LANGIRT TAB ===== */}
                        {activeTab === 'langirt' && (
                            <div className="space-y-6">
                                {/* If a Langirt tournament is active, show the bracket editor */}
                                {activeTournament && activeTournament.config?.tournamentType === 'langirt' && renderMatchEditor()}

                                {/* Creation form when no active Langirt tournament */}
                                {!activeTournament && (
                                    <>
                                        <h2 className="text-xl font-semibold text-orange-400">🎮 Langırt Turnuvası Oluştur</h2>

                                        {/* Step 1: CSV Upload */}
                                        <div className="border border-gray-700 rounded-lg p-4 space-y-3">
                                            <h3 className="font-bold text-gray-300">1. Takım Listesi (CSV)</h3>
                                            <div className="flex gap-3 flex-wrap items-end">
                                                <div className="flex-1 min-w-48">
                                                    <input
                                                        type="file"
                                                        accept=".csv"
                                                        onChange={(e) => { setLangirtFile(e.target.files[0]); setLangirtTeams([]); setLangirtPreview(null); }}
                                                        className="w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-orange-900 file:text-orange-200 hover:file:bg-orange-800"
                                                    />
                                                    <p className="text-xs text-gray-500 mt-1">Langırt form CSV (Takımınızın Adı, Oyuncu Tel No...)</p>
                                                </div>
                                                <button
                                                    onClick={handleParseLangirt}
                                                    disabled={!langirtFile}
                                                    className="px-4 py-2 bg-orange-600 hover:bg-orange-500 rounded font-bold text-sm disabled:opacity-50 disabled:cursor-not-allowed whitespace-nowrap"
                                                >
                                                    CSV Yükle
                                                </button>
                                            </div>

                                            {langirtTeams.length > 0 && (
                                                <div>
                                                    <p className="text-sm text-green-400 mb-2">✓ {langirtTeams.length} takım yüklendi</p>
                                                    <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-48 overflow-y-auto">
                                                        {langirtTeams.map((t, i) => (
                                                            <div key={i} className="bg-gray-700 px-3 py-2 rounded text-xs flex items-center gap-1">
                                                                <span className="flex-1 truncate">{t.name}</span>
                                                                {t.phones.length > 0 && <Phone size={10} className="text-green-400 shrink-0" />}
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>

                                        {/* Step 2: Schedule Config */}
                                        <div className="border border-gray-700 rounded-lg p-4 space-y-4">
                                            <h3 className="font-bold text-gray-300">2. Program Ayarları</h3>

                                            <div className="grid grid-cols-3 gap-3">
                                                <div>
                                                    <label className="block text-xs text-gray-400 mb-1">Masa Sayısı</label>
                                                    <input
                                                        type="number" min="1" max="20"
                                                        value={langirtConfig.masaSayisi}
                                                        onChange={(e) => setLangirtConfig(p => ({ ...p, masaSayisi: parseInt(e.target.value) || 1 }))}
                                                        className="w-full p-2 rounded bg-gray-700 border border-gray-600 text-sm"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-xs text-gray-400 mb-1">Maç Süresi (dk)</label>
                                                    <input
                                                        type="number" min="1"
                                                        value={langirtConfig.macSuresi}
                                                        onChange={(e) => setLangirtConfig(p => ({ ...p, macSuresi: parseInt(e.target.value) || 1 }))}
                                                        className="w-full p-2 rounded bg-gray-700 border border-gray-600 text-sm"
                                                    />
                                                </div>
                                                <div>
                                                    <label className="block text-xs text-gray-400 mb-1">Ara (dk)</label>
                                                    <input
                                                        type="number" min="0"
                                                        value={langirtConfig.araDakika}
                                                        onChange={(e) => setLangirtConfig(p => ({ ...p, araDakika: parseInt(e.target.value) || 0 }))}
                                                        className="w-full p-2 rounded bg-gray-700 border border-gray-600 text-sm"
                                                    />
                                                </div>
                                            </div>

                                            <div>
                                                <div className="flex justify-between items-center mb-2">
                                                    <label className="text-sm font-medium text-gray-300">Turnuva Günleri</label>
                                                    <button
                                                        onClick={() => setLangirtConfig(p => ({ ...p, gunler: [...p.gunler, { tarih: '', baslangic: '09:00', bitis: '18:00' }] }))}
                                                        className="text-xs bg-gray-600 hover:bg-gray-500 px-2 py-1 rounded"
                                                    >
                                                        + Gün Ekle
                                                    </button>
                                                </div>
                                                <div className="space-y-2">
                                                    {langirtConfig.gunler.map((gun, idx) => (
                                                        <div key={idx} className="flex gap-2 items-center flex-wrap">
                                                            <input
                                                                type="date"
                                                                value={gun.tarih}
                                                                onChange={(e) => updateLangirtGun(idx, 'tarih', e.target.value)}
                                                                className="flex-1 min-w-32 p-2 rounded bg-gray-700 border border-gray-600 text-sm"
                                                            />
                                                            <input
                                                                type="time"
                                                                value={gun.baslangic}
                                                                onChange={(e) => updateLangirtGun(idx, 'baslangic', e.target.value)}
                                                                className="w-28 p-2 rounded bg-gray-700 border border-gray-600 text-sm"
                                                            />
                                                            <span className="text-gray-500 text-sm">→</span>
                                                            <input
                                                                type="time"
                                                                value={gun.bitis}
                                                                onChange={(e) => updateLangirtGun(idx, 'bitis', e.target.value)}
                                                                className="w-28 p-2 rounded bg-gray-700 border border-gray-600 text-sm"
                                                            />
                                                            {langirtConfig.gunler.length > 1 && (
                                                                <button
                                                                    onClick={() => setLangirtConfig(p => ({ ...p, gunler: p.gunler.filter((_, i) => i !== idx) }))}
                                                                    className="text-red-500 hover:text-red-400 text-sm px-1"
                                                                >
                                                                    ✕
                                                                </button>
                                                            )}
                                                        </div>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>

                                        {/* Step 3: Generate */}
                                        <button
                                            onClick={handleGenerateLangirtSchedule}
                                            disabled={langirtTeams.length < 2}
                                            className="w-full py-3 rounded font-bold text-lg bg-orange-600 hover:bg-orange-500 disabled:opacity-50 disabled:cursor-not-allowed transition"
                                        >
                                            Program Oluştur
                                        </button>

                                        {/* Schedule Preview */}
                                        {langirtPreview && (
                                            <div className="border border-orange-700/50 rounded-lg p-4 space-y-4">
                                                <h3 className="font-bold text-orange-400">Program Önizleme</h3>

                                                <div className="overflow-x-auto">
                                                    <table className="w-full text-sm text-left">
                                                        <thead>
                                                            <tr className="text-gray-400 border-b border-gray-700">
                                                                <th className="pb-2 pr-4">Maç</th>
                                                                <th className="pb-2 pr-4">Takım 1</th>
                                                                <th className="pb-2 pr-4">Takım 2</th>
                                                                <th className="pb-2 pr-4">Tarih</th>
                                                                <th className="pb-2 pr-4">Saat</th>
                                                                <th className="pb-2">Masa</th>
                                                            </tr>
                                                        </thead>
                                                        <tbody>
                                                            {langirtPreview.rounds.map((round, rIdx) =>
                                                                round.matches
                                                                    .filter(m => m.team1 !== 'BAY' && m.team2 !== 'BAY')
                                                                    .map((match, mIdx) => (
                                                                        <tr key={`${rIdx}-${mIdx}`} className="border-b border-gray-800 hover:bg-gray-700/30">
                                                                            <td className="py-1 pr-4 text-gray-500 text-xs">R{rIdx + 1}-M{mIdx + 1}</td>
                                                                            <td className="py-1 pr-4 text-gray-200">{match.team1 || <span className="text-gray-600">TBD</span>}</td>
                                                                            <td className="py-1 pr-4 text-gray-200">{match.team2 || <span className="text-gray-600">TBD</span>}</td>
                                                                            {match.schedule ? (
                                                                                <>
                                                                                    <td className="py-1 pr-4 text-gray-400 text-xs">{match.schedule.tarih}</td>
                                                                                    <td className="py-1 pr-4 text-yellow-400">{match.schedule.saat}</td>
                                                                                    <td className="py-1 text-blue-400">Masa {match.schedule.masa}</td>
                                                                                </>
                                                                            ) : (
                                                                                <td colSpan={3} className="py-1 text-red-500 text-xs">Slot yok</td>
                                                                            )}
                                                                        </tr>
                                                                    ))
                                                            )}
                                                        </tbody>
                                                    </table>
                                                </div>

                                                <div className="pt-2 space-y-3">
                                                    <div>
                                                        <label className="block text-sm font-medium mb-1">Turnuva Adı</label>
                                                        <input
                                                            type="text"
                                                            value={langirtName}
                                                            onChange={(e) => setLangirtName(e.target.value)}
                                                            className="w-full p-2 rounded bg-gray-700 border border-gray-600"
                                                        />
                                                    </div>
                                                    <button
                                                        onClick={handleSaveLangirt}
                                                        className="w-full py-3 rounded font-bold text-lg bg-green-600 hover:bg-green-500 transition"
                                                    >
                                                        Kaydet & Yayınla
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
