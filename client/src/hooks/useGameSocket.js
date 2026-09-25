import { useEffect } from 'react';

// Manejo de todos los eventos de socket del juego

export const useGameSocket = (socket, gameHandlers) => {
    const {
        setGameState,
        setOptionsAnswers,
        setHasAnswered,
        setAnswerStatus,
        setMyAnswer,
        setCorrectAnswer,
        setScoreGroup,
        setTimer,
        setRevealedAnswers
    } = gameHandlers;

    useEffect(() => {
        if (!socket) return;

        const handleGameState = (state) => {
            setGameState(state);
        };
        
        const handleNewQuestion = (answers) => {
            setOptionsAnswers(answers);
            setHasAnswered(false);
            setAnswerStatus(null);
            setMyAnswer(null);
            setCorrectAnswer(null);
            setRevealedAnswers(null);
            if (navigator.vibrate) navigator.vibrate(100);
        };

        // El HOST pulsó "Mostrar respuesta": llega SOLO la respuesta (o los resultados de la
        // encuesta). Nunca se envía el texto de la pregunta.
        //   { kind, correctOptions }            opción múltiple y verdadero/falso
        //   { kind: 'NUMBER', correctNumber }   número más cercano
        //   { kind: 'POLL', options, counts, total }   encuesta
        const handleAnswerRevealed = (data) => {
            setRevealedAnswers(data && typeof data === 'object' ? data : {});
        };

        const handleTimerUpdate = (data) => {
            setTimer(data.remainingTime);
        };

        const handleTimerFinished = () => {
            setTimer(0);
        };

        const handleAnswerResult = (data) => {
            if (data.correctIndex !== undefined) {
                setCorrectAnswer(data.correctIndex);
            }
        
            if (data.correct) {
                setAnswerStatus('CORRECT');
                if (navigator.vibrate) navigator.vibrate([100, 50, 100]); 
            } else {
                setAnswerStatus('INCORRECT');
                if (navigator.vibrate) navigator.vibrate(400); 
            }
        };

        const handleUpdatePlayers = (data) => {
            const myData = data.find(player => player.id === socket.id);
            if (myData) {
                setScoreGroup(myData.score);
                if (myData.hasAnswered) setHasAnswered(true);
            }
        };

        // Registrar eventos
        socket.on('game_state', handleGameState);
        socket.on('new_question', handleNewQuestion);
        socket.on('answer_result', handleAnswerResult);
        socket.on('update_players', handleUpdatePlayers);
        socket.on('timer_update', handleTimerUpdate); 
        socket.on('timer_finished', handleTimerFinished);
        socket.on('answer_revealed', handleAnswerRevealed);

        return () => {
            socket.off('game_state', handleGameState);
            socket.off('new_question', handleNewQuestion);
            socket.off('answer_result', handleAnswerResult);
            socket.off('update_players', handleUpdatePlayers);
            socket.off('timer_update', handleTimerUpdate); 
            socket.off('timer_finished', handleTimerFinished);
            socket.off('answer_revealed', handleAnswerRevealed);
        };
    // Los setters de useState son estables. Antes se dependía del objeto 'gameHandlers',
    // que es nuevo en cada render, y los listeners se quitaban y ponían todo el tiempo.
    }, [
        socket, setGameState, setOptionsAnswers, setHasAnswered, setAnswerStatus,
        setMyAnswer, setCorrectAnswer, setScoreGroup, setTimer, setRevealedAnswers
    ]);
}