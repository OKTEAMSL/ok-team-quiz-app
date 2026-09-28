const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

// Registro histórico de cada respuesta enviada por cada equipo. Antes esto solo existía en
// memoria (utils/gameState.js, el Map 'answers') y se borraba al pasar a la siguiente
// pregunta — el presentador no tenía forma de volver a ver, más tarde en la partida o
// después del evento, qué respondió cada equipo en una pregunta anterior.
//
// Sin clave foránea a propósito (mismo motivo que Question.quizId): con sync({ alter: true })
// Sequelize duplica las claves foráneas en cada arranque. La relación se mantiene por
// convención (questionId, playerName) y se hace cumplir en el código, no en la base de datos.
const Answer = sequelize.define('Answer', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },

    questionId: {
        type: DataTypes.UUID,
        allowNull: false
    },

    // Se guarda el nombre, no un ID: es el identificador estable que ya usa el resto del
    // código (reconexión, puntuación, etc.), y sigue siendo válido aunque el jugador se
    // desconecte y su fila de 'players' desaparezca.
    playerName: {
        type: DataTypes.STRING,
        allowNull: false
    },

    // La respuesta tal cual se envió, en texto: el índice de la opción elegida ("1"), el
    // número escrito ("1985" o "-12.5"), o el índice de la opción de la encuesta. Se guarda
    // como texto para no necesitar una columna distinta por cada tipo de pregunta.
    rawAnswer: {
        type: DataTypes.STRING,
        allowNull: false
    },

    // Texto legible para mostrar en el panel de administración (ej. "París" en vez de "1").
    // Se calcula una vez al guardar, así no hace falta volver a cruzar con la pregunta cada
    // vez que se lista — y sigue siendo correcto aunque luego se edite la pregunta.
    displayAnswer: {
        type: DataTypes.STRING,
        allowNull: true
    },

    // null para preguntas sin respuesta correcta (encuestas) o para NUMBER (se sabe quién
    // ganó por la clasificación, no por sí/no)
    isCorrect: {
        type: DataTypes.BOOLEAN,
        allowNull: true
    },

    pointsAwarded: {
        type: DataTypes.INTEGER,
        allowNull: false,
        defaultValue: 0
    }
}, {
    tableName: 'answers',
    timestamps: true
});

module.exports = Answer;
