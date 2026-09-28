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
const { registerPlayerHandlers, syncClientToCurrentPhase } = require('./sockets/playerHandlers');
const { registerGameHandlers } = require('./sockets/gameHandlers');
const { registerAnswerHandlers } = require('./sockets/answerHandlers');
const { registerAdminHandlers } = require('./sockets/adminHandlers');
const { registerSocketAuth } = require('./sockets/socketAuth');

// --- UTILIDADES ---
const gameStateModule = require('./utils/gameState');
const { loadQuestions, sendNextQuestion, sendPreviousQuestion } = require('./utils/gameLogics');
const { backfillQuestionPositions, ensureDefaultQuiz } = require('./utils/questionUtils');
 
const port = process.env.PORT;

// Validar contraseña de admin
const { initializePassword } = require('./utils/passwordManager');

// JWT_SECRET es lo que da validez a los tokens de administrador (login, panel de admin,
// y ahora también el control del juego por socket). Antes, si faltaba, el código usaba en
// silencio un secreto de repuesto escrito en el propio código fuente — cualquiera que
// leyera el repositorio podía fabricar un token de administrador válido. Ahora, si falta,
// el servidor no arranca: es mejor un fallo visible al desplegar que una brecha silenciosa.
if (!process.env.JWT_SECRET) {
    console.error('❌ Falta la variable de entorno JWT_SECRET. El servidor no puede arrancar sin ella.');
    process.exit(1);
}

const app = express() // Inicializar express
// 1 MB: el logo de un cliente viaja en el JSON (ya reducido por el navegador, ~100-300 KB)
app.use(express.json({ limit: '1mb' }));

const { corsMiddleware, allowedOrigins } = configureCORS(); 
app.use(corsMiddleware);

const server = http.createServer(app); // Creamos el servidor HTTP a partir de Express

// --- Manejo de errores a nivel de proceso ---
// Sin esto, un error no capturado en cualquier parte del código (por ejemplo, dentro de un
// handler de socket que no esté en un try/catch) tira TODO el proceso, cortando de golpe
// todas las partidas en curso. Se registra el error y el servidor sigue funcionando: es
// mejor sobrevivir con un error en el log que desaparecer en mitad de un evento en vivo.
//
// PERO: esto solo aplica una vez que el servidor ya está escuchando peticiones. Un error
// ANTES de eso (por ejemplo, el puerto ya está en uso) es un fallo de arranque real: seguir
// "vivo" sin escuchar en ningún puerto dejaría el servicio como si funcionara cuando en
// realidad nunca llegó a levantar. Eso es peor que el fallo original, no una mejora.
let serverIsListening = false;

process.on('unhandledRejection', (reason, promise) => {
    console.error('🔥 Promesa rechazada sin capturar:', reason);
});

process.on('uncaughtException', (error) => {
    console.error('🔥 Excepción no capturada:', error);

    if (!serverIsListening) {
        console.error('❌ Ocurrió antes de que el servidor arrancara del todo: no puede seguir así.');
        process.exit(1);
    }
    // Si ya estaba escuchando, se sigue vivo con el error registrado (ver comentario arriba).
});

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
    registerSocketAuth(io, socket, { getGameState: gameStateModule.getGameState, getPlayers: gameStateModule.getPlayers, syncClientToCurrentPhase });
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
            serverIsListening = true;
            console.log(`✅ Servidor corriendo y listo en el puerto ${port}`)
        });

        // Railway (y la mayoría de plataformas) mandan SIGTERM antes de matar el proceso
        // al desplegar una nueva versión. Sin manejarlo, Node lo ignora por defecto y el
        // proceso se corta en seco, cortando también las conexiones de socket en ese
        // instante. Aquí se avisa a quien esté conectado y se cierra con más cuidado.
        process.on('SIGTERM', () => {
            console.log('🛑 SIGTERM recibido (posible redeploy) — cerrando con cuidado...');

            io.emit('server_shutdown', {
                message: 'El servidor se está reiniciando. La página se recargará sola en unos segundos.'
            });

            server.close(() => {
                console.log('👋 Servidor cerrado.');
                process.exit(0);
            });

            // server.close() no se completa mientras haya conexiones de socket abiertas (es su
            // comportamiento normal). Se les da un instante para que reciban el aviso de
            // arriba y luego se cierran a propósito, así el apagado no depende del timeout
            // de emergencia de abajo en el caso normal (con jugadores conectados).
            setTimeout(() => {
                io.disconnectSockets(true);
            }, 300);

            // Por si algo se queda colgado cerrando, no esperar para siempre
            setTimeout(() => process.exit(0), 5000);
        });
    } catch (error) {
        console.error("❌ Error fatal al iniciar el servidor:", error);
        // Salir con error para que la plataforma lo reinicie. Antes el proceso se quedaba
        // "vivo" sin escuchar en ningún puerto y parecía que el despliegue había ido bien.
        process.exit(1);
    }
}

startServer();