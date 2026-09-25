const Player = require('../models/Players');
const { sequelize } = require('../config/db');
const gameState = require('../utils/gameState');
const { revertQuestionAwards, stopTimer } = require('../utils/gameLogics');
const { toClientQuestion, buildReveal, computeNumberRanking, getKind } = require('../utils/questionUtils');

const {
    getGameState,
    getCurrentQuestionIndex,
    getQuestions,
    getTimerInterval,
    getRemainingTime,
    getHostSocketId,
    getAnswers,
    setGameState,
    setRemainingTime,
    setTimerInterval,
    setCurrentRanking,
    recordQuestionAward,
    players
} = gameState;

// Preguntas NUMBER: al mostrar la respuesta se clasifica a los equipos por cercanía y se
// reparten los puntos (100 / 70 / 40). Devuelve la clasificación.
const awardNumberPoints = async (io, question, questionIndex) => {
    const ranking = computeNumberRanking(question, getAnswers());
    const winners = ranking.filter((row) => row.points > 0);

    // 1) Primero la base de datos, en una transacción (todo o nada). Se suma por nombre,
    //    así también cobra quien se desconectó mientras tanto. Si falla, no se ha tocado
    //    nada en memoria y el presentador puede volver a pulsar "Mostrar respuesta".
    await sequelize.transaction(async (transaction) => {
        for (const row of winners) {
            await Player.increment('score', { by: row.points, where: { name: row.name }, transaction });
        }
    });

    // 2) Después la memoria
    for (const row of winners) {
        const socketId = Object.keys(players).find((id) => players[id].name === row.name);
        if (socketId) players[socketId].score += row.points;

        // Se recuerda cuánto dio, por si se vuelve atrás y se rejuega la pregunta
        recordQuestionAward(questionIndex, row.name, row.points);
    }

    if (winners.length > 0) {
        io.to('game_room').emit('update_players', Object.values(players));
    }

    return ranking;
};

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
    socket.on('show_answer', async () => {
        let revealSent = false;

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
            
            // Se marca de inmediato: un segundo clic mientras se calculan los puntos se descarta
            setGameState('SHOW_ANSWER');
            
            const questionIndex = getCurrentQuestionIndex() - 1;
            const currentQ = getQuestions()[questionIndex];
            
            if (currentQ) {
                let ranking = null;

                if (getKind(currentQ) === 'NUMBER') {
                    ranking = await awardNumberPoints(io, currentQ, questionIndex);
                    setCurrentRanking(ranking);

                    // Durante los cálculos el presentador pudo haber navegado a otra pregunta
                    if (getGameState() !== 'SHOW_ANSWER' || getCurrentQuestionIndex() - 1 !== questionIndex) {
                        console.log('⚠️ La pregunta cambió mientras se calculaban los puntos; no se muestra la respuesta');
                        return;
                    }
                }

                const { host, phone } = buildReveal(currentQ, getAnswers(), ranking);
                const hostSocket = getHostSocketId();
                revealSent = true;
                
                // Al HOST: la respuesta (o respuestas) correcta(s) / los resultados
                if (hostSocket) {
                    io.to(hostSocket).emit('show_correct_answer', host);
                } else {
                    console.log('❌ HOST no encontrado en players');
                }

                // A los móviles de los jugadores: SOLO la respuesta (o los resultados de la
                // encuesta). Nunca se envía la pregunta. Se emite ANTES del cambio de estado
                // para que el dato ya esté en el móvil cuando la pantalla pase a "respuesta".
                socket.to('game_room').emit('answer_revealed', phone);
            }
            
            io.to('game_room').emit('game_state', getGameState());
            console.log('✅ Respuesta correcta mostrada');
        } catch (error){
            console.error('❌ Error en show_answer:', error.message);

            // Si falló antes de mostrar nada, se vuelve a "en curso" para poder reintentarlo
            if (!revealSent && getGameState() === 'SHOW_ANSWER') {
                setGameState('QUESTION_ACTIVE');
            }

            io.to('game_room').emit('error', { 
                message: 'Error al mostrar respuesta'
            });
        }
    });
}

module.exports = {registerGameHandlers};
