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

// Nombres de los jugadores que ya respondieron la pregunta actual. Va aparte de
// players[id].hasAnswered porque un jugador que se desconecta más de 30 s se borra de
// 'players' y, al volver, podría responder de nuevo (y sumar puntos dos veces).
const answeredNames = new Set();

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

// --- Quién ya respondió la pregunta actual ---
const markAnswered = (playerName) => { answeredNames.add(playerName); }
const wasAnswered = (playerName) => answeredNames.has(playerName);
const resetAnswered = () => { answeredNames.clear(); }

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
    answeredNames.clear();
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
    resetAnswered,
    
    // Exportar referencias directas (para modificación)
    players,
    playerTimeouts
};