import { useEffect, useState } from 'react';
import { useSocket } from '../../hooks/useSocket';
import { useAdminSocketAuth } from '../../hooks/useAdminSocketAuth';
import { useGameControls } from '../../hooks/useGameControls';
import AnswerReveal, { KIND_LABELS } from './AnswerReveal';
import '../../styles/AnswerReveal.css';
import '../../styles/GameControlPanel.css';

// Controla la partida en curso desde el panel de administración: avanzar, retroceder,
// activar respuestas, mostrar la respuesta. Usa el MISMO socket y la misma lógica
// (useGameControls) que la pantalla del presentador — así que da igual desde cuál de las
// dos pantallas se juegue, el comportamiento es idéntico.
//
// Este panel NO se une como el jugador "HOST": se une a una sala de control aparte
// (join_control_room) para que la pantalla del presentador (con el QR para los móviles)
// pueda quedarse abierta en segundo plano sin que haya dos "HOST" a la vez.
const GameControlPanel = () => {
    const { socket, isConnected } = useSocket();
    const { isAdminReady } = useAdminSocketAuth(socket, isConnected);

    const [joined, setJoined] = useState(false);
    const [gameState, setGameState] = useState('LOBBY');
    const [currentQuestion, setCurrentQuestion] = useState(null);
    const [correctAnswer, setCorrectAnswer] = useState(null);
    const [timer, setTimer] = useState(null);
    const [questionPosition, setQuestionPosition] = useState(null);
    const [players, setPlayers] = useState([]);
    const [showResetConfirm, setShowResetConfirm] = useState(false);

    const { goNext, goPrevious, activateAnswers, showAnswer, canGoBack } =
        useGameControls(socket, { gameState, questionPosition });

    useEffect(() => {
        if (!socket || isAdminReady !== true) return;

        socket.emit('join_control_room');
        setJoined(true);

        const handleGameState = (data) => setGameState(data);
        const handleNewQuestion = (data) => {
            setCurrentQuestion(data);
            setCorrectAnswer(null);
            setTimer(null);
        };
        const handleQuestionPosition = (data) => setQuestionPosition(data);
        const handleShowCorrectAnswer = (data) => setCorrectAnswer(data);
        const handleTimerUpdate = (data) => setTimer(data.remainingTime);
        const handleTimerFinished = () => setTimer(0);
        const handleUpdatePlayers = (data) => setPlayers(data);
        const handleError = (data) => alert('⚠️ ' + data.message);

        socket.on('game_state', handleGameState);
        socket.on('new_question', handleNewQuestion);
        socket.on('question_position', handleQuestionPosition);
        socket.on('show_correct_answer', handleShowCorrectAnswer);
        socket.on('timer_update', handleTimerUpdate);
        socket.on('timer_finished', handleTimerFinished);
        socket.on('update_players', handleUpdatePlayers);
        socket.on('error', handleError);

        return () => {
            socket.off('game_state', handleGameState);
            socket.off('new_question', handleNewQuestion);
            socket.off('question_position', handleQuestionPosition);
            socket.off('show_correct_answer', handleShowCorrectAnswer);
            socket.off('timer_update', handleTimerUpdate);
            socket.off('timer_finished', handleTimerFinished);
            socket.off('update_players', handleUpdatePlayers);
            socket.off('error', handleError);
        };
    // Se repite en cada (re)conexión, igual que useAdminSocketAuth.
    }, [socket, isAdminReady, isConnected]);

    const playersOnly = players.filter((p) => p.name !== 'HOST');
    const answeredCount = playersOnly.filter((p) => p.hasAnswered).length;
    const currentKind = currentQuestion?.kind || 'CHOICE';

    const handleReset = (cleanPlayers) => {
        socket.emit('reset_game', { cleanPlayers });
        setShowResetConfirm(false);
    };

    if (isAdminReady !== true || !joined) {
        return (
            <div className="game-control-panel">
                <h2 className="section-title">Control de la Partida</h2>
                <p className="input-hint">Conectando…</p>
            </div>
        );
    }

    return (
        <div className="game-control-panel">
            <div className="gcp-header">
                <h2 className="section-title">Control de la Partida</h2>
                <button className="gcp-reset-btn" onClick={() => setShowResetConfirm(true)}>
                    🔄 Reiniciar
                </button>
            </div>

            {gameState === 'LOBBY' && (
                <p className="input-hint">
                    En el lobby. {playersOnly.length} equipo{playersOnly.length === 1 ? '' : 's'} conectado{playersOnly.length === 1 ? '' : 's'}.
                    Deja la pantalla del presentador abierta para el código QR, y usa "Siguiente Pregunta" aquí para empezar.
                </p>
            )}

            {gameState === 'GAME_OVER' && (
                <p className="input-hint">La partida terminó. Pulsa "Reiniciar" para jugar de nuevo.</p>
            )}

            {gameState !== 'LOBBY' && gameState !== 'GAME_OVER' && (
                <div className="gcp-question-card">
                    {questionPosition && questionPosition.total > 0 && (
                        <div className="gcp-counter">
                            Pregunta {questionPosition.number} de {questionPosition.total}
                            {KIND_LABELS[currentKind] && <span className="kind-badge">{KIND_LABELS[currentKind]}</span>}
                        </div>
                    )}

                    <p className="gcp-question-title">{currentQuestion?.title}</p>

                    {gameState === 'QUESTION_ACTIVE' && timer !== null && (
                        <p className="gcp-timer">⏱️ {timer}s</p>
                    )}

                    {gameState === 'QUESTION_ACTIVE' && playersOnly.length > 0 && (
                        <p className="input-hint">
                            Han respondido <strong>{answeredCount}</strong> de <strong>{playersOnly.length}</strong>
                        </p>
                    )}

                    {gameState === 'SHOW_ANSWER' && correctAnswer && <AnswerReveal reveal={correctAnswer} />}
                </div>
            )}

            <div className="gcp-buttons">
                <button
                    className="gcp-btn"
                    disabled={!canGoBack}
                    onClick={goPrevious}
                >
                    ← Anterior
                </button>

                {gameState === 'LOBBY' && (
                    <button className="gcp-btn gcp-btn-primary" onClick={goNext}>
                        Iniciar Partida
                    </button>
                )}

                {gameState === 'QUESTION_LOCKED' && (
                    <button className="gcp-btn gcp-btn-primary" onClick={activateAnswers}>
                        Activar Respuestas
                    </button>
                )}

                {gameState === 'QUESTION_ACTIVE' && (
                    <button className="gcp-btn gcp-btn-primary" onClick={showAnswer}>
                        {currentKind === 'POLL' ? 'Mostrar Resultados' : 'Mostrar Respuesta'}
                    </button>
                )}

                {gameState === 'SHOW_ANSWER' && (
                    <button className="gcp-btn gcp-btn-primary" onClick={goNext}>
                        Siguiente Pregunta →
                    </button>
                )}
            </div>

            {showResetConfirm && (
                <div className="modal-overlay" onClick={() => setShowResetConfirm(false)}>
                    <div className="modal-content" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>Reiniciar Partida</h2>
                            <button className="modal-close" onClick={() => setShowResetConfirm(false)}>✕</button>
                        </div>
                        <div className="modal-body">
                            <p className="modal-question">¿Qué desea hacer con los participantes?</p>
                            <div className="reset-options">
                                <button className="reset-option-btn keep" onClick={() => handleReset(false)}>
                                    <span className="option-icon">🔄</span>
                                    <div className="option-text">
                                        <strong>Mantener participantes</strong>
                                        <small>Reiniciar solo las preguntas (conservar puntos)</small>
                                    </div>
                                </button>
                                <button
                                    className="reset-option-btn clean"
                                    onClick={() => {
                                        if (window.confirm('⚠️ ¿Seguro? Esto borrará TODOS los jugadores y puntos permanentemente.')) {
                                            handleReset(true);
                                        }
                                    }}
                                >
                                    <span className="option-icon">🧹</span>
                                    <div className="option-text">
                                        <strong>Limpiar todo</strong>
                                        <small>Eliminar participantes y comenzar de cero</small>
                                    </div>
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default GameControlPanel;
