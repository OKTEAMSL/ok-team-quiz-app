const gameState = require('../utils/gameState');
const { revertQuestionAwards, stopTimer } = require('../utils/gameLogics');
const { toClientQuestion, getRevealPayload } = require('../utils/questionUtils');

const {
    getGameState,
    getCurrentQuestionIndex,
    getQuestions,
    getTimerInterval,
    getRemainingTime,
    getHostSocketId,
    setGameState,
    setRemainingTime,
    setTimerInterval,
    players
} = gameState;

const registerGameHandlers = (io, socket, sendNextQuestion, sendPreviousQuestion) => {

    // --- NEXT QUESTION --- 
    // data.from (opcional): número de pregunta desde el que el HOST pulsó el botón.
    socket.on('next_question', async (data) => {
        try{
            console.log('➡️ Evento next_question recibido (avance manual)');
            await sendNextQuestion(io, data);
        } catch (error){
            console.error('❌ Error en next_question:', error.message);
            io.to('game_room').emit('error', { 
                message: 'Error al avanzar pregunta'
            });
        }
    });

    // --- PREVIOUS QUESTION ---
    socket.on('previous_question', async (data) => {
        try{
            console.log('⬅️ Evento previous_question recibido');
            await sendPreviousQuestion(io, data);
        } catch (error){
            console.error('❌ Error en previous_question:', error.message);
            io.to('game_room').emit('error', { 
                message: 'Error al volver a la pregunta anterior'
            });
        }
    });


    // --- ACTIVATE ANSWERS ---
    socket.on('activate_answers', async () => {
        try{
        console.log('🟢 Activando respuestas...');
        
        if (getGameState() !== 'QUESTION_LOCKED') {
            console.log('⚠️ Intento de activar respuestas en estado:', getGameState());
            return;
        }
        
        // Se marca como activa DE INMEDIATO: así un segundo clic mientras se
        // procesa esta activación se descarta por el chequeo de estado de arriba.
        setGameState('QUESTION_ACTIVE');

        const questionIndex = getCurrentQuestionIndex() - 1;
        const currentQ = getQuestions()[questionIndex];

        // Si esta pregunta ya se jugó (el presentador volvió atrás y la repite),
        // se restan los puntos de la ronda anterior para no contarlos dos veces.
        if (await revertQuestionAwards(questionIndex)) {
            io.to('game_room').emit('update_players', Object.values(players));
        }

        // Durante ese await el presentador pudo haber navegado a otra pregunta.
        if (getGameState() !== 'QUESTION_ACTIVE' || getCurrentQuestionIndex() - 1 !== questionIndex) {
            console.log('⚠️ La pregunta cambió mientras se activaba; se cancela esta activación');
            return;
        }

        // Enviar la pregunta a TODOS los jugadores
        if (currentQ) {
            io.to('game_room').emit('new_question', toClientQuestion(currentQ));
            
            // Iniciar timer
            setRemainingTime(currentQ.timeLimit || 10);
            
            // Emitir tiempo inicial a todos
            io.to('game_room').emit('timer_update', { remainingTime: getRemainingTime() });
            
            // Iniciar cuenta regresiva
            if (getTimerInterval()) {
                clearInterval(getTimerInterval());
            }
            
            const interval = setInterval(() => {
                setRemainingTime(getRemainingTime() - 1);
                
                // Emitir actualización a todos
                io.to('game_room').emit('timer_update', { remainingTime: getRemainingTime() });
                
                // Si llega a 0
                if (getRemainingTime() <= 0) {
                    clearInterval(interval);
                    setTimerInterval(null);
                    
                    console.log('⏰ Tiempo agotado!');
                    
                    // Asignar 0 puntos a quien no respondió
                    for (const id in players) {
                        if (players[id].name !== 'HOST' && !players[id].hasAnswered) {
                            console.log(`⏱️ ${players[id].name} no respondió a tiempo`);
                        }
                    }
                    
                    // Emitir que se acabó el tiempo
                    io.to('game_room').emit('timer_finished');
                }
            }, 1000);
            
            setTimerInterval(interval);
        }
        
        // Notificar cambio de estado
        io.to('game_room').emit('game_state', getGameState())
        
        console.log(`✅ Respuestas activadas con timer de ${getRemainingTime()}s`);
        } catch (error){
            console.error('❌ Error en activate_answers:', error.message);

            // Si falló antes de arrancar el timer, volver a BLOQUEADO para que se pueda reintentar
            if (getGameState() === 'QUESTION_ACTIVE' && !getTimerInterval()) {
                setGameState('QUESTION_LOCKED');
            }

            io.to('game_room').emit('error', { 
                message: 'Error al activar respuestas'
            });
        }
    });

    // --- SHOW ANSWER ---
    socket.on('show_answer', () => {
        try{
            console.log('📺 Mostrando respuesta correcta...');

            if (getGameState() !== 'QUESTION_ACTIVE') {
                console.log('⚠️ Intento de mostrar respuesta en estado:', getGameState());
                return;
            }

            if (getTimerInterval()) {
                stopTimer();
                console.log('⏰ Timer cancelado al mostrar respuesta');
            }
            
            setGameState('SHOW_ANSWER');
            
            const currentQ = getQuestions()[getCurrentQuestionIndex() - 1];
            
            if (currentQ) {
                const { correctIndexes, correctOptions } = getRevealPayload(currentQ);
                const hostSocket = getHostSocketId();
                
                // Al HOST: la respuesta (o respuestas) correcta(s)
                if (hostSocket) {
                    io.to(hostSocket).emit('show_correct_answer', {
                        correctIndex: correctIndexes[0],
                        correctOption: correctOptions[0],
                        correctIndexes,
                        correctOptions
                    });
                } else {
                    console.log('❌ HOST no encontrado en players');
                }

                // A los móviles de los jugadores: SOLO el texto de la(s) respuesta(s).
                // Nunca se envía la pregunta. Se emite ANTES del cambio de estado para que
                // el dato ya esté en el móvil cuando la pantalla pase a "respuesta".
                socket.to('game_room').emit('answer_revealed', { correctOptions });
            }
            
            io.to('game_room').emit('game_state', getGameState());
            console.log('✅ Respuesta correcta mostrada');
        } catch (error){
            console.error('❌ Error en show_answer:', error.message);
            io.to('game_room').emit('error', { 
                message: 'Error al mostrar respuesta'
            });
        }
    });
}

module.exports = {registerGameHandlers};
