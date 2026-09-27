import { useCallback } from 'react';

// Acciones para controlar la partida en curso (avanzar, retroceder, activar respuestas,
// mostrar la respuesta). Es la misma lógica que antes vivía solo dentro de HostView — ahora
// también la usa el panel de administración, así que se comparte en un solo sitio: si algo
// cambia aquí (por ejemplo, qué pasa al pulsar "Anterior" con una pregunta en curso), se
// aplica igual sin importar desde qué pantalla se esté jugando.
//
// Requiere que el socket YA esté autenticado como administrador (ver useAdminSocketAuth):
// el servidor rechaza estos eventos si no lo está.
export const useGameControls = (socket, { gameState, questionPosition }) => {
    // Se envía "from" (la pregunta desde la que se pulsó). Si el servidor ya avanzó por un
    // clic anterior, ignora este: así un doble clic ya no salta una pregunta.
    const goNext = useCallback(() => {
        socket?.emit('next_question', { from: questionPosition?.number });
    }, [socket, questionPosition]);

    const goPrevious = useCallback(() => {
        if (gameState === 'QUESTION_ACTIVE' &&
            !window.confirm('La pregunta está en curso. ¿Volver a la pregunta anterior?')) {
            return;
        }
        socket?.emit('previous_question', { from: questionPosition?.number });
    }, [socket, gameState, questionPosition]);

    const activateAnswers = useCallback(() => {
        socket?.emit('activate_answers');
    }, [socket]);

    const showAnswer = useCallback(() => {
        socket?.emit('show_answer');
    }, [socket]);

    const canGoBack = (questionPosition?.number ?? 0) > 1;

    return { goNext, goPrevious, activateAnswers, showAnswer, canGoBack };
};
