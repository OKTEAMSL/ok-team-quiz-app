const { DataTypes } = require('sequelize');
const { sequelize } = require('../config/db');

// Un "cuestionario" agrupa las preguntas de un evento/cliente y guarda su imagen de marca.
// Solo UNO está "en uso" (isActive) a la vez: es el que se juega y el que se ve en las pantallas.
const Quiz = sequelize.define('Quiz', {
    id: {
        type: DataTypes.UUID,
        defaultValue: DataTypes.UUIDV4,
        primaryKey: true
    },

    // Nombre interno (solo lo ve el administrador). Ej: "Colegio San José - 4º ESO"
    name: {
        type: DataTypes.STRING(80),
        allowNull: false
    },

    isActive: {
        type: DataTypes.BOOLEAN,
        allowNull: false,
        defaultValue: false
    },

    // --- Imagen de marca del cliente ---
    // Color principal (#rrggbb). Si es null se usa el azul de OK Team.
    primaryColor: {
        type: DataTypes.STRING(7),
        allowNull: true
    },

    // Texto de bienvenida (pantalla de entrada del móvil y título del Host)
    welcomeText: {
        type: DataTypes.STRING(60),
        allowNull: true
    },

    // Logo como data URL (png/jpeg/webp/gif), ya reducido por el navegador del admin
    logo: {
        type: DataTypes.TEXT,
        allowNull: true
    }
}, {
    tableName: 'quizzes',
    timestamps: true
});

module.exports = Quiz;
