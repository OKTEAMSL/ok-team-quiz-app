const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db')

const Question = sequelize.define('Question', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },

    title: {
        type: DataTypes.TEXT, 
        allowNull: false
    },

    type: {
            type: DataTypes.ENUM('TEXT', 'IMAGE', 'VIDEO'),
            defaultValue: 'TEXT',
            allowNull: false
        },

    options: {
        type: DataTypes.ARRAY(DataTypes.STRING),
        allowNull: false
    },
        
    mediaUrl: {
        type: DataTypes.STRING,
        allowNull: true
    },

    // Primera respuesta correcta (se mantiene por compatibilidad con preguntas antiguas)
    correctIndex: {
        type: DataTypes.INTEGER,
        allowNull: false
    },

    // Todas las respuestas correctas (1 o más). Si está vacío, se usa correctIndex.
    correctIndexes: {
        type: DataTypes.ARRAY(DataTypes.INTEGER),
        allowNull: true,
        defaultValue: []
    },

    // Cuestionario al que pertenece. Se deja SIN clave foránea a propósito: con
    // sync({ alter: true }) Sequelize duplica las claves foráneas en cada arranque.
    // El borrado en cascada se hace en el código (ver quiz.controller).
    quizId: {
        type: DataTypes.UUID,
        allowNull: true
    },

    // Tipo de respuesta:
    //   CHOICE      opción múltiple (1 o más correctas)      <- las preguntas de siempre
    //   TRUE_FALSE  verdadero / falso
    //   NUMBER      el equipo escribe un número; gana el más cercano
    //   POLL        encuesta: no hay respuesta correcta
    // (No se usa ENUM a propósito: cambiar un ENUM con alter:true es delicado en PostgreSQL.)
    kind: {
        type: DataTypes.STRING(12),
        allowNull: true,
        defaultValue: 'CHOICE'
    },

    // Respuesta correcta de las preguntas NUMBER
    correctNumber: {
        type: DataTypes.DOUBLE,
        allowNull: true
    },

    // Orden de la pregunta dentro del juego (1, 2, 3...). Editar una pregunta NO lo cambia.
    // Es nullable para que las preguntas ya existentes se puedan migrar al arrancar.
    position: {
        type: DataTypes.INTEGER,
        allowNull: true
    },

    timeLimit: {
        type: DataTypes.INTEGER,
        defaultValue: 10,
        allowNull: false,
        validate: {
            min: 5,
            max: 120
        }
    }
}, {
    tableName: 'questions',
    timestamps: true,
});


module.exports = Question