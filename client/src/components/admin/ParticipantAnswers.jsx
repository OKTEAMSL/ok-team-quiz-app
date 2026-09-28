import { useEffect, useState } from 'react';
import '../../styles/ParticipantAnswers.css';

// Muestra, para UNA pregunta, lo que respondió cada equipo — su respuesta en texto legible,
// si acertó y cuántos puntos ganó. Usa el nuevo endpoint GET /api/questions/:id/answers.
const ParticipantAnswers = ({ questionId, onClose, fetchWithAuth, apiUrl }) => {
    const [data, setData] = useState(null);
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        let cancelled = false;

        const load = async () => {
            setLoading(true);
            setError('');

            try {
                const response = await fetchWithAuth(`${apiUrl}/api/questions/${questionId}/answers`);

                if (!response.ok) {
                    const body = await response.json().catch(() => ({}));
                    if (!cancelled) setError(body.message || 'No se pudieron cargar las respuestas.');
                    return;
                }

                const body = await response.json();
                if (!cancelled) setData(body);
            } catch {
                if (!cancelled) setError('No se pudo conectar con el servidor.');
            } finally {
                if (!cancelled) setLoading(false);
            }
        };

        load();
        return () => { cancelled = true; };
    }, [questionId, fetchWithAuth, apiUrl]);

    const statusIcon = (isCorrect, kind) => {
        if (kind === 'POLL') return '📊';
        if (isCorrect === true) return '✅';
        if (isCorrect === false) return '❌';
        return '';   // NUMBER antes de mostrar la respuesta: isCorrect todavía es null
    };

    return (
        <div className="modal-overlay" onClick={onClose}>
            <div className="modal-content participant-answers-modal" onClick={(e) => e.stopPropagation()}>
                <div className="modal-header">
                    <h2>Respuestas de los equipos</h2>
                    <button className="modal-close" onClick={onClose}>✕</button>
                </div>

                <div className="modal-body">
                    {loading && <p className="input-hint">Cargando…</p>}
                    {!loading && error && <p className="branding-error">{error}</p>}

                    {!loading && !error && data && (
                        <>
                            <p className="participant-answers-question">{data.question.title}</p>

                            {data.answers.length === 0 ? (
                                <p className="input-hint">Todavía no hay respuestas para esta pregunta.</p>
                            ) : (
                                <ul className="participant-answers-list">
                                    {data.answers.map((a) => (
                                        <li key={a.playerName} className="participant-answer-row">
                                            <span className="pa-name">{a.playerName}</span>
                                            <span className="pa-answer">{a.displayAnswer}</span>
                                            <span className="pa-status">{statusIcon(a.isCorrect, data.question.kind)}</span>
                                            <span className="pa-points">{a.pointsAwarded > 0 ? `+${a.pointsAwarded}` : ''}</span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

export default ParticipantAnswers;
