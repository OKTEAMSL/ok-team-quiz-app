// --- CORE DE NODE Y EXTERNOS ---
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '.env') });
const express = require('express');
const http = require('http');

// --- CONFIGURACION --- 
const { dbSynchronization } = require('./config/sync');
const { configureSocket } = require('./config/socket');
const { configureCORS } = require('./config/cors');

// --- RUTAS ---
const questionRoutes = require('./routes/questionRoutes');
const quizRoutes = require('./routes/quizRoutes');
const brandingRoutes = require('./routes/brandingRoutes');
const playerRoutes = require('./routes/playerRoutes');
const authRoutes = require('./routes/authRoutes');

// --- CONTROLLERS Y MIDDLEWARE ---
const playerController = require('./controllers/player.controller');
const { authenticateAdmin } = require('./middleware/auth');

// --- HANDLERS DE SOCKETS
const { registerPlayerHandlers } = require('./sockets/playerHandlers');
const { registerGameHandlers } = require('./sockets/gameHandlers');
const { registerAnswerHandlers } = require('./sockets/answerHandlers');
const { registerAdminHandlers } = require('./sockets/adminHandlers');

// --- UTILIDADES ---
const gameStateModule = require('./utils/gameState');
const { loadQuestions, sendNextQuestion, sendPreviousQuestion } = require('./utils/gameLogics');
const { backfillQuestionPositions, ensureDefaultQuiz } = require('./utils/questionUtils');
 
const port = process.env.PORT;

// Validar contraseña de admin
const { initializePassword } = require('./utils/passwordManager');

const app = express() // Inicializar express
// 1 MB: el logo de un cliente viaja en el JSON (ya reducido por el navegador, ~100-300 KB)
app.use(express.json({ limit: '1mb' }));

const { corsMiddleware, allowedOrigins } = configureCORS(); 
app.use(corsMiddleware);

const server = http.createServer(app); // Creamos el servidor HTTP a partir de Express

const io = configureSocket(server, allowedOrigins);

playerController.setSocketIO(io);
app.set('io', io);   // para que las rutas puedan avisar a los móviles (p. ej. cambio de marca)

// ---> ESTADO DEL JUEGO (importado desde gameState) <---
const {
    getServerRunId,
    getGameSessionId,
    players,
} = gameStateModule;

// Constantes locales
const SERVER_RUN_ID = getServerRunId();

// Exportar players para playerController
module.exports.players = players;

// --- SOCKETS ---
console.log('🔧 Registrando listener de connection...');
io.on("connection", (socket) => {
    console.log('🔌 CONEXIÓN DETECTADA en server.js - Socket ID:', socket.id);
    socket.emit('server_check', { 
        serverId: SERVER_RUN_ID, 
        gameId: getGameSessionId(),
        gameState: gameStateModule.getGameState() 
    })
    console.log('✅ server_check enviado');
    
    // Handler para re-enviar server_check si se pierde
    socket.on('request_server_check', () => {
        console.log('🔄 Cliente pidió server_check manualmente');
        socket.emit('server_check', { 
            serverId: SERVER_RUN_ID, 
            gameId: getGameSessionId(),
            gameState: gameStateModule.getGameState() 
        });
        console.log('✅ server_check re-enviado');
    });
    
    // --- Handlers ---
    console.log('🔧 Registrando handlers para socket:', socket.id);
    registerPlayerHandlers(io, socket);
    registerGameHandlers(io, socket, sendNextQuestion, sendPreviousQuestion);
    registerAnswerHandlers(io, socket);
    registerAdminHandlers(io, socket, loadQuestions);
    console.log('✅ Handlers registrados para socket:', socket.id);
});

    console.log('✅ Listener de connection registrado');

app.use('/api/auth', authRoutes)
app.use('/api/branding', brandingRoutes)   // PÚBLICO: logo, color y texto del cuestionario en uso
app.use('/api/questions', authenticateAdmin ,questionRoutes)
app.use('/api/quizzes', authenticateAdmin, quizRoutes)
app.use('/api/players', authenticateAdmin, playerRoutes)

// Servir los archivos estáticos del build de React
app.use(express.static(path.join(__dirname, '../client/dist')));
// Hacer que cualquier ruta no-API devuelva el index.html (para que funcione React Router)
app.use((req, res) => {
    res.sendFile(path.join(__dirname, '../client/dist/index.html'));
});

async function startServer() {
    try {
        console.log("⏳ Iniciando sincronización de base de datos...");
        await dbSynchronization(); 

        console.log("⏳ Inicializando contraseña de admin...");
        await initializePassword();

        // Migración de datos anteriores: las preguntas que ya existían pasan a un primer
        // cuestionario "Cuestionario principal" (en uso). Es idempotente.
        // Si fallara, el juego sigue funcionando con todas las preguntas (modo de emergencia).
        try {
            const activeQuiz = await ensureDefaultQuiz();
            console.log(`📚 Cuestionario en uso: "${activeQuiz.name}"`);
        } catch (error) {
            console.error("⚠️ No se pudo preparar el cuestionario por defecto:", error.message);
        }

        // Preguntas creadas antes de existir el orden manual: se les asigna posición 1..N
        // (dentro de cada cuestionario) según su fecha de creación.
        // Si algo falla no es grave (se ordena por fecha).
        try {
            const fixed = await backfillQuestionPositions();
            if (fixed > 0) console.log(`🔢 Posiciones de preguntas actualizadas: ${fixed}`);
        } catch (error) {
            console.error("⚠️ No se pudieron asignar posiciones a las preguntas:", error.message);
        }
        
        console.log("⏳ Cargando preguntas...");
        await loadQuestions();

        server.listen(port, '0.0.0.0', () => {
            console.log(`✅ Servidor corriendo y listo en el puerto ${port}`)
        });
    } catch (error) {
        console.error("❌ Error fatal al iniciar el servidor:", error);
        // Salir con error para que la plataforma lo reinicie. Antes el proceso se quedaba
        // "vivo" sin escuchar en ningún puerto y parecía que el despliegue había ido bien.
        process.exit(1);
    }
}

startServer();