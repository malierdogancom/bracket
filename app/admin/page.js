'use client';
import { useState, useEffect } from 'react';
import { auth, db } from '@/lib/firebase';
import { onAuthStateChanged, signOut } from 'firebase/auth';
import { useRouter } from 'next/navigation';
import { collection, addDoc, serverTimestamp, updateDoc, doc, query, orderBy, getDocs, deleteDoc, where } from 'firebase/firestore';
import { generateBracket } from '@/lib/tournament';
import { generateTeams } from '@/lib/teams';
import { parseFoosballCSV, generateBalancedSquads } from '@/lib/foosballGenerator';
import _ from 'lodash';
import { Phone } from 'lucide-react';

export default function Admin() {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const router = useRouter();
    const [isSidebarOpen, setIsSidebarOpen] = useState(false);

    // UI State
    const [activeTab, setActiveTab] = useState('tournament'); // 'tournament' | 'teams'
    const [message, setMessage] = useState('');
    const [events, setEvents] = useState([]); // List of all events

    // Common Input
    const [namesInput, setNamesInput] = useState('');

    // Tournament State
    const [tournamentName, setTournamentName] = useState('');
    const [activeTournament, setActiveTournament] = useState(null); // { id, ...data }

    // Teams State
    const [numTeams, setNumTeams] = useState(2);
    const [generatedTeams, setGeneratedTeams] = useState(null);

    // Generator State
    const [individualFile, setIndividualFile] = useState(null);
    const [teamFile, setTeamFile] = useState(null);
    const [generatedPreview, setGeneratedPreview] = useState([]); // Array of GeneratedTeam objects
    const [isGeneratorOpen, setIsGeneratorOpen] = useState(false);

    // Metadata State (Map teamName -> phones array)
    // We'll store this in Firestore under 'data.teamMetadata'
    const [teamMetadata, setTeamMetadata] = useState({});

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

    // --- Actions ---

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
                data: {
                    rounds: rounds,
                    teamMetadata: teamMetadata // Save metadata
                }
            });
            setMessage('Tournament created successfully!');
            setActiveTournament({ id: docRef.id, name: tournamentName, data: { rounds, teamMetadata } });
            setTournamentName('');
            setNamesInput('');
            setTeamMetadata({});
            fetchEvents(); // Refresh list
        } catch (error) {
            console.error("Error creating tournament:", error);
            setMessage('Error creating tournament.');
        }
    };

    const handleMatchUpdate = async (roundIdx, matchIdx, winner) => {
        if (!activeTournament || !winner || winner === 'BAY') return;

        const newRounds = [...activeTournament.data.rounds];
        // Deep copy to avoid mutation issues
        const newRoundsDeep = JSON.parse(JSON.stringify(newRounds));

        // Access matches from the round object
        const currentMatch = newRoundsDeep[roundIdx].matches[matchIdx];

        // Update winner
        currentMatch.winner = winner;

        // Advance to next round
        const nextRoundIdx = roundIdx + 1;
        if (nextRoundIdx < newRoundsDeep.length) {
            const nextRound = newRoundsDeep[nextRoundIdx];
            const nextMatchIdx = Math.floor(matchIdx / 2);
            const isTeam1 = matchIdx % 2 === 0;

            if (isTeam1) {
                nextRound.matches[nextMatchIdx].team1 = winner;
            } else {
                nextRound.matches[nextMatchIdx].team2 = winner;
            }
        }

        // Update Local State
        setActiveTournament({
            ...activeTournament,
            data: { ...activeTournament.data, rounds: newRoundsDeep }
        });

        // Update Firestore
        try {
            const bracketRef = doc(db, 'brackets', activeTournament.id);
            await updateDoc(bracketRef, {
                'data.rounds': newRoundsDeep
            });
            console.log('Bracket updated successfully');
            fetchEvents(); // Refresh list to show updates if needed
        } catch (err) {
            console.error('Error updating bracket:', err);
            setMessage('Error updating match.');
        }
    };

    const handleMatchReset = async (roundIdx, matchIdx) => {
        if (!activeTournament) return;

        const newRounds = [...activeTournament.data.rounds];
        const newRoundsDeep = JSON.parse(JSON.stringify(newRounds));
        const currentMatch = newRoundsDeep[roundIdx].matches[matchIdx];

        if (!currentMatch.winner) return;

        currentMatch.winner = null;

        const nextRoundIdx = roundIdx + 1;
        if (nextRoundIdx < newRoundsDeep.length) {
            const nextRound = newRoundsDeep[nextRoundIdx];
            const nextMatchIdx = Math.floor(matchIdx / 2);
            const isTeam1 = matchIdx % 2 === 0;

            if (isTeam1) {
                nextRound.matches[nextMatchIdx].team1 = null;
            } else {
                nextRound.matches[nextMatchIdx].team2 = null;
            }
        }

        setActiveTournament({
            ...activeTournament,
            data: { ...activeTournament.data, rounds: newRoundsDeep }
        });

        try {
            const bracketRef = doc(db, 'brackets', activeTournament.id);
            await updateDoc(bracketRef, {
                'data.rounds': newRoundsDeep
            });
        } catch (err) {
            console.error('Error resetting match:', err);
            setMessage('Error resetting match.');
        }
    };

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
                config: { numTeams: numTeams },
                data: { teams: generatedTeams }
            });
            setMessage('Teams saved successfully!');
            setGeneratedTeams(null);
            setNamesInput('');
            fetchEvents(); // Refresh list
        } catch (error) {
            console.error("Error saving teams:", error);
            setMessage('Error saving teams.');
        }
    };

    const handleDeleteEvent = async (id) => {
        if (!confirm('Are you sure you want to delete this event? This cannot be undone.')) return;
        try {
            await deleteDoc(doc(db, 'brackets', id));
            setMessage('Event deleted.');
            if (activeTournament?.id === id) setActiveTournament(null);
            fetchEvents();
        } catch (error) {
            console.error("Error deleting event:", error);
            setMessage('Error deleting event.');
        }
    };

    const handleToggleArchive = async (event) => {
        try {
            const bracketRef = doc(db, 'brackets', event.id);
            await updateDoc(bracketRef, {
                isArchived: !event.isArchived
            });
            setMessage(event.isArchived ? 'Event unarchived.' : 'Event archived.');
            fetchEvents();
        } catch (error) {
            console.error("Error archiving event:", error);
            setMessage('Error updating archive status.');
        }
    };

    const handleProcessGenerator = async () => {
        try {
            let allTeams = [];

            // 1. Process Individuals
            if (individualFile) {
                const individuals = await parseFoosballCSV(individualFile, 'individual');
                const squads = generateBalancedSquads(individuals);
                allTeams = [...allTeams, ...squads];
            }

            // 2. Process Teams
            if (teamFile) {
                const teams = await parseFoosballCSV(teamFile, 'team');
                // Convert to GeneratedTeam format
                const teamObjects = teams.map(t => {
                    let phones = [];
                    if (t.phone) {
                        // We stored multiple phones with || delimiter for teams
                        const rawPhones = t.phone.split('||');
                        phones = rawPhones.map((p, i) => ({ name: `Player ${i + 1}`, number: p }));
                    }
                    return { name: t.name, phones };
                });
                allTeams = [...allTeams, ...teamObjects];
            }

            if (allTeams.length === 0) {
                setMessage('No players or teams found in files.');
                return;
            }

            // 3. Shuffle Final List
            const shuffled = _.shuffle(allTeams);
            setGeneratedPreview(shuffled);
            setMessage(`Generated ${shuffled.length} teams/squads.`);
        } catch (error) {
            console.error("Generator Error:", error);
            setMessage('Error processing files. Check CSV format.');
        }
    };

    const handleCommitToTournament = () => {
        if (generatedPreview.length === 0) return;

        const currentNames = namesInput.split('\n').map(n => n.trim()).filter(n => n);
        const newNames = generatedPreview.map(t => t.name);

        // Merge metadata
        const newMetadata = { ...teamMetadata };
        generatedPreview.forEach(t => {
            if (t.phones && t.phones.length > 0) {
                newMetadata[t.name] = t.phones;
            }
        });
        setTeamMetadata(newMetadata);

        const combinedNames = [...currentNames, ...newNames];
        setNamesInput(combinedNames.join('\n'));

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

    const handleSelectEvent = (event) => {
        if (event.type === 'tournament') {
            setActiveTab('tournament');
            setActiveTournament(event);
            setTournamentName(event.name);
            // Reset creation inputs
            setNamesInput('');
        } else {
            setActiveTab('teams');
            setGeneratedTeams(event.data.teams);
            setNumTeams(event.config.numTeams);
            // Reset creation inputs
            setNamesInput('');
        }
    };

    if (loading) return <div className="min-h-screen flex items-center justify-center bg-gray-900 text-white">Loading...</div>;
    if (!user) return null;

    return (
        <div className="flex min-h-screen bg-gray-900 text-white flex-col md:flex-row">
            {/* Mobile Header */}
            <div className="md:hidden bg-gray-800 p-4 flex justify-between items-center border-b border-gray-700">
                <h1 className="font-bold text-xl">Admin Dashboard</h1>
                <button onClick={() => setIsSidebarOpen(!isSidebarOpen)} className="text-gray-300 hover:text-white">
                    {isSidebarOpen ? 'Close' : 'Menu'}
                </button>
            </div>

            {/* Sidebar (Desktop: always visible, Mobile: conditional) */}
            <aside className={`
                ${isSidebarOpen ? 'flex' : 'hidden'} 
                md:flex flex-col w-full md:w-64 bg-gray-800 border-r border-gray-700 
                fixed md:relative z-50 h-[calc(100vh-60px)] md:h-screen top-[60px] md:top-0
            `}>
                <div className="p-4 border-b border-gray-700 flex justify-between items-center">
                    <h1 className="font-bold text-xl">Admin</h1>
                    <button onClick={handleLogout} className="text-xs bg-red-600 px-2 py-1 rounded hover:bg-red-700">Logout</button>
                </div>
                <div className="p-4">
                    <button
                        onClick={() => {
                            setActiveTournament(null);
                            setGeneratedTeams(null);
                            setNamesInput('');
                            setMessage('');
                            setTeamMetadata({}); // Reset metadata
                        }}
                        className="w-full bg-green-600 hover:bg-green-700 py-2 rounded font-bold mb-4"
                    >
                        + New Event
                    </button>

                    {/* Active Events */}
                    <h2 className="text-gray-400 text-sm uppercase tracking-wider mb-2">Active Events</h2>
                    <div className="space-y-2 overflow-y-auto max-h-[40vh] mb-4">
                        {events.filter(e => !e.isArchived).map(event => (
                            <div key={event.id} className="group relative">
                                <button
                                    onClick={() => handleSelectEvent(event)}
                                    className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${activeTournament?.id === event.id ? 'bg-blue-900/50 text-blue-200' : 'hover:bg-gray-700 text-gray-300'}`}
                                >
                                    <div className="truncate font-medium pr-6">{event.name || `Teams (${event.config?.numTeams})`}</div>
                                    <div className="text-xs text-gray-500">{new Date(event.createdAt?.seconds * 1000).toLocaleDateString()}</div>
                                </button>
                                <div className="absolute right-2 top-2 flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleToggleArchive(event); }}
                                        className="text-gray-500 hover:text-yellow-500"
                                        title="Archive"
                                    >
                                        📥
                                    </button>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleDeleteEvent(event.id); }}
                                        className="text-gray-500 hover:text-red-500"
                                        title="Delete"
                                    >
                                        ✕
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Archived Events */}
                    <h2 className="text-gray-400 text-sm uppercase tracking-wider mb-2 border-t border-gray-700 pt-2">Archived</h2>
                    <div className="space-y-2 overflow-y-auto max-h-[30vh]">
                        {events.filter(e => e.isArchived).map(event => (
                            <div key={event.id} className="group relative opacity-75">
                                <button
                                    onClick={() => handleSelectEvent(event)}
                                    className={`w-full text-left px-3 py-2 rounded text-sm transition-colors ${activeTournament?.id === event.id ? 'bg-blue-900/50 text-blue-200' : 'hover:bg-gray-700 text-gray-300'}`}
                                >
                                    <div className="truncate font-medium pr-6">{event.name || `Teams (${event.config?.numTeams})`}</div>
                                    <div className="text-xs text-gray-500">{new Date(event.createdAt?.seconds * 1000).toLocaleDateString()}</div>
                                </button>
                                <div className="absolute right-2 top-2 flex space-x-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleToggleArchive(event); }}
                                        className="text-gray-500 hover:text-green-500"
                                        title="Unarchive"
                                    >
                                        📤
                                    </button>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleDeleteEvent(event.id); }}
                                        className="text-gray-500 hover:text-red-500"
                                        title="Delete"
                                    >
                                        ✕
                                    </button>
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
                    <div className="flex space-x-4 mb-6">
                        <button
                            onClick={() => setActiveTab('tournament')}
                            className={`px-6 py-2 rounded font-semibold ${activeTab === 'tournament' ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'}`}
                        >
                            Tournament Bracket
                        </button>
                        <button
                            onClick={() => setActiveTab('teams')}
                            className={`px-6 py-2 rounded font-semibold ${activeTab === 'teams' ? 'bg-purple-600' : 'bg-gray-700 hover:bg-gray-600'}`}
                        >
                            Team Generator
                        </button>
                    </div>

                    <div className="bg-gray-800 p-6 rounded-lg shadow-lg">
                        {message && <p className={`mb-4 ${message.includes('Error') ? 'text-red-500' : 'text-green-500'}`}>{message}</p>}

                        {/* Tournament View */}
                        {activeTab === 'tournament' && (
                            <div className="space-y-4">
                                {!activeTournament && (
                                    <>
                                        <h2 className="text-xl font-semibold">Create Tournament</h2>

                                        {/* ⚡ Auto-Generator Tools */}
                                        <div className="mb-8 border border-gray-700 rounded-lg overflow-hidden">
                                            <button
                                                onClick={() => setIsGeneratorOpen(!isGeneratorOpen)}
                                                className="w-full bg-gray-800 p-4 flex justify-between items-center hover:bg-gray-750 transition"
                                            >
                                                <span className="font-bold text-yellow-400 flex items-center">
                                                    ⚡ Advanced Team Generator
                                                </span>
                                                <span className="text-gray-400">{isGeneratorOpen ? '▼' : '▶'}</span>
                                            </button>

                                            {isGeneratorOpen && (
                                                <div className="p-4 bg-gray-800/50 border-t border-gray-700 space-y-4">
                                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                                        <div>
                                                            <label className="block text-sm font-medium mb-1 text-gray-300">Upload Individuals CSV</label>
                                                            <input
                                                                type="file"
                                                                accept=".csv"
                                                                onChange={(e) => setIndividualFile(e.target.files[0])}
                                                                className="w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-900 file:text-blue-200 hover:file:bg-blue-800"
                                                            />
                                                            <p className="text-xs text-gray-500 mt-1">Cols: "İsim Soyisim", "Mevkii"</p>
                                                        </div>
                                                        <div>
                                                            <label className="block text-sm font-medium mb-1 text-gray-300">Upload Teams CSV</label>
                                                            <input
                                                                type="file"
                                                                accept=".csv"
                                                                onChange={(e) => setTeamFile(e.target.files[0])}
                                                                className="w-full text-sm text-gray-400 file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-purple-900 file:text-purple-200 hover:file:bg-purple-800"
                                                            />
                                                            <p className="text-xs text-gray-500 mt-1">Col: "Takımınızın Adı"</p>
                                                        </div>
                                                    </div>

                                                    <button
                                                        onClick={handleProcessGenerator}
                                                        disabled={!individualFile && !teamFile}
                                                        className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 py-2 rounded font-bold transition disabled:opacity-50 disabled:cursor-not-allowed"
                                                    >
                                                        🚀 Process & Generate
                                                    </button>

                                                    {generatedPreview.length > 0 && (
                                                        <div className="mt-4">
                                                            <div className="flex justify-between items-center mb-2">
                                                                <h4 className="font-bold text-sm text-gray-300">Preview ({generatedPreview.length})</h4>
                                                                <button
                                                                    onClick={handleCommitToTournament}
                                                                    className="bg-green-600 hover:bg-green-500 px-4 py-1 rounded text-sm font-bold transition"
                                                                >
                                                                    ✅ Transfer to Tournament
                                                                </button>
                                                            </div>
                                                            <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-40 overflow-y-auto p-2 bg-gray-900 rounded border border-gray-700">
                                                                {generatedPreview.map((team, idx) => (
                                                                    <div key={idx} className="flex justify-between items-center bg-gray-800 px-2 py-1 rounded text-xs">
                                                                        <div className="flex items-center space-x-2 truncate mr-2">
                                                                            <span>{team.name}</span>
                                                                            {team.phones && team.phones.length > 0 && (
                                                                                <span className="text-green-500" title="Has Contact Info">
                                                                                    <Phone size={10} />
                                                                                </span>
                                                                            )}
                                                                        </div>
                                                                        <button
                                                                            onClick={() => handleRemovePreviewItem(idx)}
                                                                            className="text-red-500 hover:text-red-400 font-bold"
                                                                        >
                                                                            ×
                                                                        </button>
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
                                            <input
                                                type="text"
                                                value={tournamentName}
                                                onChange={(e) => setTournamentName(e.target.value)}
                                                className="w-full p-2 rounded bg-gray-700 border border-gray-600"
                                                placeholder="e.g. Grand Prix"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium mb-1">Participants (One per line)</label>
                                            <textarea
                                                value={namesInput}
                                                onChange={(e) => setNamesInput(e.target.value)}
                                                className="w-full p-2 rounded bg-gray-700 border border-gray-600 h-40"
                                                placeholder="Player 1&#10;Player 2&#10;Player 3..."
                                            />
                                        </div>
                                        <button
                                            onClick={handleCreateTournament}
                                            className="w-full bg-blue-600 hover:bg-blue-700 py-3 rounded font-bold text-lg transition"
                                        >
                                            Generate & Save Bracket
                                        </button>
                                    </>
                                )}

                                {/* Active Tournament Editor */}
                                {activeTournament && (
                                    <div className="pt-2">
                                        <div className="flex justify-between items-center mb-4">
                                            <h3 className="text-xl font-bold text-blue-400">Editing: {activeTournament.name}</h3>
                                            <button onClick={() => setActiveTournament(null)} className="text-sm text-gray-400 hover:text-white">Close Editor</button>
                                        </div>
                                        <p className="text-sm text-gray-400 mb-4">Click on a team to advance them to the next round. Changes are saved automatically.</p>

                                        <div className="overflow-x-auto pb-4">
                                            <div className="flex space-x-8 min-w-max">
                                                {activeTournament.data.rounds.map((round, rIdx) => (
                                                    <div key={rIdx} className="space-y-4">
                                                        <div className="text-center font-bold text-gray-500">Round {rIdx + 1}</div>
                                                        {round.matches.map((match, mIdx) => (
                                                            <div key={mIdx} className="relative bg-gray-700 p-2 rounded w-48 border border-gray-600">
                                                                {match.winner && (
                                                                    <button
                                                                        onClick={(e) => { e.stopPropagation(); handleMatchReset(rIdx, mIdx); }}
                                                                        className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full w-5 h-5 flex items-center justify-center text-xs shadow-md hover:bg-red-700 z-10"
                                                                        title="Reset Match"
                                                                    >
                                                                        ✕
                                                                    </button>
                                                                )}
                                                                <div
                                                                    onClick={() => handleMatchUpdate(rIdx, mIdx, match.team1)}
                                                                    className={`cursor-pointer p-1 hover:bg-gray-600 rounded ${match.winner === match.team1 ? 'text-green-400 font-bold' : ''}`}
                                                                >
                                                                    {match.team1 || 'TBD'}
                                                                </div>
                                                                {/* Contact Button Team 1 */}
                                                                {match.team1 && activeTournament.data.teamMetadata && activeTournament.data.teamMetadata[match.team1] && (
                                                                    <div className="absolute top-0 right-0 p-1">
                                                                        <div className="group/phone relative">
                                                                            <button className="text-green-400 hover:text-green-300">
                                                                                <Phone size={14} />
                                                                            </button>
                                                                            <div className="absolute right-0 top-full mt-1 w-48 bg-gray-900 border border-gray-700 rounded shadow-xl z-50 hidden group-hover/phone:block p-2">
                                                                                {activeTournament.data.teamMetadata[match.team1].map((p, idx) => (
                                                                                    <a key={idx} href={`tel:${p.number}`} className="block text-xs text-gray-300 hover:text-white py-1 border-b border-gray-800 last:border-0">
                                                                                        📞 {p.name}: {p.number}
                                                                                    </a>
                                                                                ))}
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                )}
                                                                <div className="border-t border-gray-600 my-1"></div>
                                                                <div
                                                                    onClick={() => handleMatchUpdate(rIdx, mIdx, match.team2)}
                                                                    className={`cursor-pointer p-1 hover:bg-gray-600 rounded ${match.winner === match.team2 ? 'text-green-400 font-bold' : ''}`}
                                                                >
                                                                    {match.team2 || 'TBD'}
                                                                </div>
                                                                {/* Contact Button Team 2 */}
                                                                {match.team2 && activeTournament.data.teamMetadata && activeTournament.data.teamMetadata[match.team2] && (
                                                                    <div className="absolute bottom-0 right-0 p-1">
                                                                        <div className="group/phone relative">
                                                                            <button className="text-green-400 hover:text-green-300">
                                                                                <Phone size={14} />
                                                                            </button>
                                                                            <div className="absolute right-0 bottom-full mb-1 w-48 bg-gray-900 border border-gray-700 rounded shadow-xl z-50 hidden group-hover/phone:block p-2">
                                                                                {activeTournament.data.teamMetadata[match.team2].map((p, idx) => (
                                                                                    <a key={idx} href={`tel:${p.number}`} className="block text-xs text-gray-300 hover:text-white py-1 border-b border-gray-800 last:border-0">
                                                                                        📞 {p.name}: {p.number}
                                                                                    </a>
                                                                                ))}
                                                                            </div>
                                                                        </div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}

                        {/* Teams View */}
                        {activeTab === 'teams' && (
                            <div className="space-y-4">
                                {!generatedTeams && (
                                    <>
                                        <h2 className="text-xl font-semibold">Generate Teams</h2>
                                        <div>
                                            <label className="block text-sm font-medium mb-1">Participants (One per line)</label>
                                            <textarea
                                                value={namesInput}
                                                onChange={(e) => setNamesInput(e.target.value)}
                                                className="w-full p-2 rounded bg-gray-700 border border-gray-600 h-40"
                                                placeholder="Player 1&#10;Player 2&#10;Player 3..."
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-sm font-medium mb-1">Number of Teams</label>
                                            <input
                                                type="number"
                                                min="2"
                                                value={numTeams}
                                                onChange={(e) => setNumTeams(e.target.value)}
                                                className="w-full p-2 rounded bg-gray-700 border border-gray-600"
                                            />
                                        </div>
                                        <button
                                            onClick={handleGenerateTeams}
                                            className="w-full bg-purple-600 hover:bg-purple-700 py-3 rounded font-bold text-lg transition"
                                        >
                                            Generate Teams
                                        </button>
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
                                                    <ul className="list-disc list-inside">
                                                        {team.map((p, i) => <li key={i}>{p}</li>)}
                                                    </ul>
                                                </div>
                                            ))}
                                        </div>

                                        <div className="flex space-x-4">
                                            <button
                                                onClick={handleGenerateTeams}
                                                className="flex-1 bg-purple-600 hover:bg-purple-700 py-3 rounded font-bold text-lg transition"
                                            >
                                                Re-shuffle
                                            </button>
                                            <button
                                                onClick={handleSaveTeams}
                                                className="flex-1 bg-green-600 hover:bg-green-700 py-3 rounded font-bold text-lg transition"
                                            >
                                                Save as New
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
