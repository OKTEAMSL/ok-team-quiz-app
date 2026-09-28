import { useEffect, useState } from 'react';
import { useSocket } from '../../hooks/useSocket';
import '../../styles/LeaderboardPanel.css';

const MEDALS = ['🥇', '🥈', '🥉'];

// Clasificación de los equipos. Se autosuficiente a propósito: carga una foto inicial por
// HTTP (funciona aunque esta pantalla esté sola, por ejemplo en una pestaña separada del
// panel de control) y, si el socket compartido ya está conectado, se mantiene actualizada
// en vivo escuchando 'update_players' — el mismo evento que ya usa el resto del panel de
// Admin, así que no hace falta unirse a ninguna sala nueva ni autenticar el socket de nuevo.
const LeaderboardPanel = ({ fetchWithAuth, apiUrl }) => {
    const { socket } = useSocket();
    const [players, setPlayers] = useState([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;

        const loadInitial = async () => {
            try {
                const response = await fetchWithAuth(`${apiUrl}/api/players`);
                if (response.status === 401 || response.status === 403) return;   // AdminView ya maneja la sesión expirada
                const data = await response.json();
                if (!cancelled) setPlayers(Array.isArray(data) ? data : []);
            } catch (error) {
                console.error('Error al cargar la clasificación:', error);
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        loadInitial();
        return () => { cancelled = true; };
    // Solo al montar: las actualizaciones posteriores llegan en vivo por socket.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        if (!socket) return;

        const handleUpdatePlayers = (data) => setPlayers(Array.isArray(data) ? data : []);
        socket.on('update_players', handleUpdatePlayers);

        return () => {
            socket.off('update_players', handleUpdatePlayers);
        };
    }, [socket]);

    const ranked = players
        .filter((p) => p.name !== 'HOST')
        .slice()
        .sort((a, b) => (b.score ?? 0) - (a.score ?? 0));

    return (
        <div className="leaderboard-panel">
            <h2 className="section-title">Clasificación</h2>

            {loading ? (
                <p className="input-hint">Cargando…</p>
            ) : ranked.length === 0 ? (
                <p className="input-hint">Todavía no hay equipos conectados.</p>
            ) : (
                <ol className="leaderboard-list">
                    {ranked.map((player, i) => (
                        <li key={player.id ?? player.name} className={`leaderboard-row ${i < 3 ? 'top-three' : ''}`}>
                            <span className="leaderboard-place">{MEDALS[i] || `${i + 1}.`}</span>
                            <span className="leaderboard-name">{player.name}</span>
                            <span className="leaderboard-score">{player.score ?? 0}</span>
                        </li>
                    ))}
                </ol>
            )}
        </div>
    );
};

export default LeaderboardPanel;
