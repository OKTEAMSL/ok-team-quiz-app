const Player = require('../models/Players');
const { sequelize } = require('../config/db');
const gameState = require('./gameState');
const { findAllOrdered, getActiveQuiz, toClientQuestion } = require('./questionUtils');

const {
    getCurrentQuestionIndex,
    getQuestions,
    getGameState,
    getTimerInterval,
    getHostSocketId,
    setQuestions,
    setGameState,
    setCurrentQuestionIndex,
    setFirstCorrectAnswer,
    setTimerInterval,
    setRemainingTime,
    takeQuestionAwards,
    resetAnswered,
    players
} = gameState;

// --- Cargar preguntas (en el orden definido en el panel Admin) ---
const loadQuestions = async() => {
    try {
        // Solo las preguntas del cuestionario que está en uso
        const quiz = await getActiveQuiz();
        const questionsFromDB = await findAllOrdered(quiz ? quiz.id : undefined);
        const loadedQuestions = questionsFromDB.map(q => q.toJSON());
        setQuestions(loadedQuestions);
        console.log(`✅ ${loadedQuestions.length} preguntas cargadas${quiz ? ` (cuestionario "${quiz.name}")` : ''}.`);
    } catch (error) {
        console.error("❌ Error al cargar preguntas:", error);
    }
}

// --- Detener el temporizador de la pregunta en curso ---
const stopTimer = () => {
    if (getTimerInterval()) {
        clearInterval(getTimerInterval());
        setTimerInterval(null);
    }
    setRemainingTime(0);
};

// --- Informar al HOST en qué pregunta está (número actual y total) ---
const emitQuestionPosition = (io, socketId) => {
    const target = socketId || getHostSocketId();
    if (!target) return;

    io.to(target).emit('question_position', {
        number: getCurrentQuestionIndex(),
        total: getQuestions().length
    });
};

// --- Presentar una pregunta (la deja en estado BLOQUEADO, solo visible para el HOST) ---
// Lo usan tanto "siguiente" como "anterior".
const presentQuestion = (io, questionIndex) => {
    const question = getQuestions()[questionIndex];

    // Si venimos de una pregunta con el tiempo corriendo, se cancela su temporizador.
    // (Antes seguía emitiendo timer_update/timer_finished de la pregunta anterior.)
    stopTimer();

    setGameState("QUESTION_LOCKED");

    // Resetear estado de respuesta de los jugadores
    for (const id in players) {
        players[id].hasAnswered = false;
    }
    resetAnswered();

    setFirstCorrectAnswer(null);
    setCurrentQuestionIndex(questionIndex + 1);

    // Enviar el estado a todos
    io.to('game_room').emit('game_state', getGameState());

    // Envía la pregunta solo al HOST
    const hostSocket = getHostSocketId();
    if (hostSocket) {
        emitQuestionPosition(io, hostSocket);
        io.to(hostSocket).emit('new_question', toClientQuestion(question));
        console.log(`   ✅ Pregunta ${questionIndex + 1}/${getQuestions().length} enviada al HOST`);
    } else {
        console.log('   ❌ HOST no encontrado');
    }
};

// --- Avanzar ---
const goNext = async (io) => {

    // Si es la primera pregunta, recarga desde BD
    if (getCurrentQuestionIndex() === 0) {
        await loadQuestions();
        console.log("🔄 Preguntas recargadas desde BD");

        // Validar que haya preguntas
        if (getQuestions().length === 0) {
            console.log('⚠️ No hay preguntas cargadas en BD');

            const hostSocket = getHostSocketId();
            if (hostSocket) {
                io.to(hostSocket).emit('error_message', {
                    message: 'No hay preguntas cargadas. Crea preguntas desde el panel de administración primero.'
                });
            } else {
                console.log('❌ HOST no encontrado en players');
            }
            return;
        }
    }

    // Si se acabaron las preguntas
    if (getCurrentQuestionIndex() >= getQuestions().length) {
        console.log('⚠️ No hay más preguntas. GAME_OVER');
        stopTimer();
        setGameState('GAME_OVER');

        io.to('game_room').emit('game_state', getGameState());
        io.to('game_room').emit('update_players', Object.values(players));
        return;
    }

    presentQuestion(io, getCurrentQuestionIndex());
};

// --- Retroceder ---
const goPrevious = (io) => {
    const total = getQuestions().length;
    const current = getCurrentQuestionIndex();   // número (1..N) de la pregunta actual

    let target;

    if (getGameState() === 'GAME_OVER') {
        // Se pasó de la última: volver a la última pregunta
        target = total - 1;
    } else if (getGameState() !== 'LOBBY' && current >= 2) {
        // Pregunta anterior a la actual
        target = current - 2;
    } else {
        console.log('ℹ️ Ya está en la primera pregunta, no hay anterior');
        return;
    }

    if (target < 0 || target >= total) {
        console.log('⚠️ Pregunta anterior fuera de rango:', target);
        return;
    }

    console.log(`⬅️ Volviendo a la pregunta ${target + 1}`);
    presentQuestion(io, target);
};

// --- Control de navegación ---
// 1) Candado: mientras se procesa un avance/retroceso se ignoran los demás. Sin esto, dos
//    clics rápidos en "Siguiente" avanzaban dos preguntas (se "pasaba" una sin querer).
// 2) 'from': el HOST indica desde qué pregunta pulsó. Si el servidor ya no está ahí
//    (porque un clic anterior ya lo movió), la orden está obsoleta y se ignora.
let navigationLocked = false;

const navigate = async (io, direction, data) => {
    if (navigationLocked) {
        console.log(`⏭️ Navegación ignorada (${direction}): hay otra en curso`);
        return;
    }

    navigationLocked = true;
    try {
        if (data && data.from !== undefined && Number(data.from) !== getCurrentQuestionIndex()) {
            console.log(`⏭️ Navegación obsoleta ignorada (${direction}): pulsada desde ${data.from}, actual ${getCurrentQuestionIndex()}`);
            return;
        }

        if (direction === 'next') {
            await goNext(io);
        } else {
            goPrevious(io);
        }
    } finally {
        navigationLocked = false;
    }
};

const sendNextQuestion = (io, data) => navigate(io, 'next', data);
const sendPreviousQuestion = (io, data) => navigate(io, 'previous', data);

// --- Deshacer los puntos que dio una pregunta ---
// Se usa cuando el presentador vuelve a una pregunta ya jugada y la activa de nuevo:
// se restan los puntos de la ronda anterior para que no se cuenten dos veces.
const revertQuestionAwards = async (questionIndex) => {
    const awards = takeQuestionAwards(questionIndex);
    if (!awards) return false;

    const names = Object.keys(awards);

    for (const name of names) {
        const socketId = Object.keys(players).find(id => players[id].name === name);
        if (socketId) {
            players[socketId].score = Math.max(0, players[socketId].score - awards[name]);
        }
    }

    await Promise.all(names.map(name =>
        Player.update(
            { score: sequelize.literal(`GREATEST(score - ${Number(awards[name])}, 0)`) },
            { where: { name } }
        )
    ));

    console.log(`↩️ Puntos de la pregunta ${questionIndex + 1} revertidos para: ${names.join(', ')}`);
    return true;
};

module.exports = {
    loadQuestions,
    sendNextQuestion,
    sendPreviousQuestion,
    revertQuestionAwards,
    emitQuestionPosition,
    stopTimer
}
