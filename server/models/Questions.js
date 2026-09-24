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