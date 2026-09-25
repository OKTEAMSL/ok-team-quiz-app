// Variables globales del juego
const SERVER_RUN_ID = Date.now();
let GAME_SESSION_ID = Date.now();
let questions = [];
const players = {};
const playerTimeouts = {};
let gameState = 'LOBBY';
let currentQuestionIndex = 0;
let firstCorrectAnswer = null;
let timerInterval = null;
let remainingTime = 0;

// Puntos que otorgó cada pregunta: { [indiceDePregunta]: { [nombreJugador]: puntos } }
// Sirve para no sumar dos veces si el presentador vuelve atrás y rejuega una pregunta.
let questionAwards = {};

// Qué respondió cada jugador en la pregunta actual: { nombre -> respuesta }
// (el índice de la opción elegida, o el número escrito). Va aparte de
// players[id].hasAnswered porque un jugador que se desconecta más de 30 s se borra de
// 'players' y, al volver, podría responder de nuevo (y sumar puntos dos veces).
// Además alimenta los resultados de las encuestas y la clasificación de las preguntas NUMBER.
const answers = new Map();

// Clasificación ya calculada (y ya puntuada) de la pregunta NUMBER en pantalla.
// Se guarda para poder reenviarla a quien se reconecta mientras se muestra la respuesta.
let currentRanking = null;

// Getters
const getServerRunId = () => {
    return SERVER_RUN_ID;
}

const getGameSessionId = () => {
    return GAME_SESSION_ID;
}

const getQuestions = () => {
    return questions;
}

const getPlayers = () => {
    return players;
}

const getPlayerTimeouts = () => {
    return playerTimeouts;
}

const getGameState = () => {
    return gameState;
}

const getCurrentQuestionIndex = () => {
    return currentQuestionIndex;
}

const getFirstCorrectAnswer = () => {
    return firstCorrectAnswer;
}

const getTimerInterval = () => {
    return timerInterval;
}

const getRemainingTime = () => {
    return remainingTime;
}

// Socket del HOST (o undefined si no está conectado)
const getHostSocketId = () => {
    return Object.keys(players).find(id => players[id].name === 'HOST');
}

// --- Puntos otorgados por pregunta ---
const recordQuestionAward = (questionIndex, playerName, points) => {
    if (!questionAwards[questionIndex]) questionAwards[questionIndex] = {};
    questionAwards[questionIndex][playerName] = points;
}

// Devuelve (y olvida) los puntos otorgados en una pregunta: { nombre: puntos }
const takeQuestionAwards = (questionIndex) => {
    const awards = questionAwards[questionIndex] || null;
    delete questionAwards[questionIndex];
    return awards;
}

const resetQuestionAwards = () => {
    questionAwards = {};
}

// --- Quién respondió la pregunta actual, y qué ---
const markAnswered = (playerName, value) => { answers.set(playerName, value); }
const wasAnswered = (playerName) => answers.has(playerName);
const getAnswers = () => answers;
const resetAnswered = () => { answers.clear(); currentRanking = null; }

const getCurrentRanking = () => currentRanking;
const setCurrentRanking = (ranking) => { currentRanking = ranking; }

// Setters
const setGameSessionId = (id) => {
    GAME_SESSION_ID = id;
}

const setQuestions = (newQuestions) => {
    questions = newQuestions;
}

const setGameState = (state) => {
    gameState = state;
}

const setCurrentQuestionIndex = (index) => {
    currentQuestionIndex = index;
}

const setFirstCorrectAnswer = (answer) => {
    firstCorrectAnswer = answer;
}

const setTimerInterval = (interval) => {
    timerInterval = interval;
}

const setRemainingTime = (time) => {
    remainingTime = time;
}

// Funciones de utilidad
const resetGame = () => {
    GAME_SESSION_ID = Date.now();
    
    // Limpiar timeouts
    for (const key in playerTimeouts) {
        clearTimeout(playerTimeouts[key]);
        delete playerTimeouts[key];
    }
    
    // Vaciar players
    for (const key in players) {
        delete players[key];
    }
    
    gameState = 'LOBBY';
    currentQuestionIndex = 0;
    firstCorrectAnswer = null;
    
    if (timerInterval) {
        clearInterval(timerInterval);
        timerInterval = null;
    }
    remainingTime = 0;
    questionAwards = {};
    answers.clear();
    currentRanking = null;
}

module.exports = {
    // Getters
    getServerRunId,
    getGameSessionId,
    getQuestions,
    getPlayers,
    getPlayerTimeouts,
    getGameState,
    getCurrentQuestionIndex,
    getFirstCorrectAnswer,
    getTimerInterval,
    getRemainingTime,
    getHostSocketId,
    
    // Setters
    setGameSessionId,
    setQuestions,
    setGameState,
    setCurrentQuestionIndex,
    setFirstCorrectAnswer,
    setTimerInterval,
    setRemainingTime,
    
    // Utilidades
    resetGame,
    recordQuestionAward,
    takeQuestionAwards,
    resetQuestionAwards,
    markAnswered,
    wasAnswered,
    getAnswers,
    resetAnswered,
    getCurrentRanking,
    setCurrentRanking,
    
    // Exportar referencias directas (para modificación)
    players,
    playerTimeouts
};