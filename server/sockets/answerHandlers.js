const Player = require('../models/Players');
const gameState = require('../utils/gameState');
const { getCorrectIndexes, getKind } = require('../utils/questionUtils');

const {
    getGameState,
    getCurrentQuestionIndex,
    getQuestions,
    getFirstCorrectAnswer,
    getTimerInterval,
    setFirstCorrectAnswer,
    setTimerInterval,
    setRemainingTime,
    recordQuestionAward,
    markAnswered,
    wasAnswered,
    players
} = gameState;

// Convierte lo que llega del móvil en un número (acepta "12,5" y "12.5"). NaN si no es válido.
const parseNumberAnswer = (raw) => {
    if (typeof raw === 'number') return raw;
    if (typeof raw !== 'string' || raw.trim() === '') return NaN;
    return Number(raw.trim().replace(',', '.'));
};

const registerAnswerHandlers = (io, socket) => {

    // --- SUBMIT ANSWER ---
    socket.on('submit_answer', async (data) => {
        try{
            // Validacion de datos
            if(!data || data.answer === undefined){
                throw new Error('Respuesta no proporcionada.')
            }

            const player = players[socket.id]

            if (!player){
                console.log('⚠️ Intento de respuesta de jugador no registrado');
                return;
            }  

            if (getGameState() !== 'QUESTION_ACTIVE') {
                console.log(`⚠️ ${player.name} intentó responder pero el estado es: ${getGameState()}`);
                socket.emit('error', { 
                    message: 'Las respuestas aún no están activadas'
                });
                return;
            }

            if(player.hasAnswered || wasAnswered(player.name)){
                console.log(`⚠️ ${player.name} ya respondió esta pregunta`);
                return;
            }

            const questionInPlay = getQuestions()[getCurrentQuestionIndex() - 1]; 

            if(!questionInPlay){
                throw new Error('No hay pregunta activa');
            }

            const kind = getKind(questionInPlay);

            // Se valida la respuesta ANTES de darla por enviada: una respuesta inválida
            // no debe dejar al equipo sin poder volver a contestar.
            let value;

            if (kind === 'NUMBER') {
                value = parseNumberAnswer(data.answer);

                if (!Number.isFinite(value) || Math.abs(value) > 1e15) {
                    socket.emit('error', { message: 'Escribe un número válido' });
                    return;
                }
            } else {
                value = data.answer;

                if (!Number.isInteger(value) || value < 0 || value >= questionInPlay.options.length) {
                    socket.emit('error', { message: 'Respuesta no válida' });
                    return;
                }
            }

            player.hasAnswered = true;
            markAnswered(player.name, value);

            // Puntos al momento: solo en opción múltiple y verdadero/falso.
            //  - NUMBER: los puntos se dan al mostrar la respuesta (depende de quién quedó más cerca).
            //  - POLL: no hay puntos.
            if (kind === 'CHOICE' || kind === 'TRUE_FALSE') {
                // La pregunta puede tener 1 o más respuestas correctas: cualquiera es válida.
                const isCorrect = getCorrectIndexes(questionInPlay).includes(value);

                if (isCorrect) {
                    let pointsAwarded;

                    // Si responde correcto primero
                    if (getFirstCorrectAnswer() === null) {
                        setFirstCorrectAnswer(socket.id);
                        pointsAwarded = 100;
                        console.log(`🥇 ${player.name} respondió primero: +100 puntos`);
                    } else {
                        // Respuestas correctas subsecuentes
                        pointsAwarded = 90;
                        console.log(`✅ ${player.name} respondió correcto: +90 puntos`);
                    }

                    player.score += pointsAwarded;

                    // Se recuerda cuánto dio esta pregunta, por si se vuelve atrás y se rejuega
                    recordQuestionAward(getCurrentQuestionIndex() - 1, player.name, pointsAwarded);

                    if (player.dbId) {
                        await Player.update(
                            { score: player.score },
                            { where: { id: player.dbId } }
                        );
                    }
                }
            } else {
                console.log(`📝 ${player.name} respondió (${kind}): ${value}`);
            }
            
            // Actualizar Host
            io.to('game_room').emit('update_players', Object.values(players))

            // Cancelar timer cuando todos hayan respondido antes de acabar el tiempo
            const allPlayers = Object.values(players).filter(p => p.name !== 'HOST');
            const totalPlayers = allPlayers.length;
            const answersCount = allPlayers.filter(p => p.hasAnswered).length;

            if (totalPlayers > 0 && answersCount === totalPlayers) {
                console.log("✅ Todos respondieron. Cancelando timer...");
                
                // Cancelar el timer 
                if (getTimerInterval()) {
                    clearInterval(getTimerInterval());
                    setTimerInterval(null);
                    setRemainingTime(0);
                }
                
                setTimeout(() => {
                    // Notificar que el timer terminó
                    io.to('game_room').emit('timer_finished');
                    console.log("⏱️ Timer finished emitido después del delay");
                }, 1500);
            }
        } catch (error){
            console.error('❌ Error en submit_answer:', error.message);
            socket.emit('error', { 
                message: 'Error al procesar tu respuesta. Intenta de nuevo.' 
            });
        }
    })
};

module.exports = {registerAnswerHandlers};
