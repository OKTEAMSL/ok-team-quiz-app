const Player = require('../models/Players');
const gameState = require('../utils/gameState');
const { getCorrectIndexes } = require('../utils/questionUtils');

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

            player.hasAnswered = true;
            markAnswered(player.name);
            const questionInPlay = getQuestions()[getCurrentQuestionIndex() - 1]; 

            if(!questionInPlay){
                throw new Error('No hay pregunta activa');
            }

            // Calcular puntaje. La pregunta puede tener 1 o más respuestas correctas:
            // cualquiera de ellas es válida.
            const correctIndexes = getCorrectIndexes(questionInPlay);
            const isCorrect = correctIndexes.includes(data.answer);
            let pointsAwarded = 0;

            // Si responde correcto primero
            if (isCorrect) {
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
            }

            if (player.dbId) {
                await Player.update(
                    { score: player.score },
                    { where: { id: player.dbId } }
                );
            }

            const result = { 
                correct: isCorrect, 
                wasFirst: isCorrect && getFirstCorrectAnswer() === socket.id
            };

            if(isCorrect){
                result.correctIndex = questionInPlay.correctIndex;
            };

            // Enviar resultado individual
            //socket.emit('answer_result', result)
            
            // Actualizar Host
            io.to('game_room').emit('update_players', Object.values(players))

            // --- LÓGICA DE AVANCE AUTOMÁTICO ---
            // const allPlayers = Object.values(players).filter(p => p.name !== 'HOST');
            // const totalPlayers = allPlayers.length;
            // const answersCount = allPlayers.filter(p => p.hasAnswered).length;

            // if (totalPlayers > 0 && answersCount === totalPlayers) {
            //     console.log("🚀 Todos respondieron. Avanzando...");
            //     setTimeout(() => {
            //         sendNextQuestion();
            //     }, 3000); 
            // }

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

