const { verifyAdminToken } = require('../middleware/auth');
const { PRESENTER_ROOM } = require('../utils/gameState');

// Autenticación de administrador para sockets. Es independiente de ser el jugador
// llamado "HOST": esto certifica que quien está al otro lado tiene la contraseña de admin,
// sin importar desde qué pantalla se conectó (Host o Admin).
//
// El cliente manda su token de administrador (el mismo que usa para las peticiones HTTP)
// con el evento 'admin_auth'. Si es válido, se marca 'socket.isAdmin = true' y ese socket
// puede usar los eventos de control del juego (ver isAdminSocket, abajo).
const registerSocketAuth = (io, socket, { getGameState, getPlayers, syncClientToCurrentPhase }) => {
    socket.on('admin_auth', (data) => {
        const token = typeof data === 'string' ? data : data?.token;
        const decoded = verifyAdminToken(token);

        if (decoded) {
            socket.isAdmin = true;
            socket.emit('admin_auth_result', { ok: true });
        } else {
            socket.isAdmin = false;
            socket.emit('admin_auth_result', { ok: false });
        }
    });

    // Deja que el panel de Admin reciba los mismos eventos de partida que el Host
    // (game_state, question_position, new_question, show_correct_answer, timer_update,
    // update_players) SIN convertirse en el jugador "HOST". Si Admin se uniera como
    // "HOST" también, habría dos sockets con ese nombre y el servidor ya no sabría cuál de
    // los dos es "el jugador HOST" a la hora de anotar puntajes — por eso este es un camino
    // aparte, que solo une las salas y sincroniza, sin tocar la lista de jugadores.
    socket.on('join_control_room', () => {
        if (socket.isAdmin !== true) {
            socket.emit('error', { message: 'No autorizado. Vuelve a iniciar sesión.' });
            return;
        }

        socket.join('game_room');
        socket.join(PRESENTER_ROOM);
        socket.emit('game_state', getGameState());
        socket.emit('update_players', Object.values(getPlayers()));
        syncClientToCurrentPhase(io, socket, true);
    });
};

// Comprueba que el socket que dispara un evento de control ya se autenticó como admin.
// Si no, avisa al propio socket (no a la sala) y no ejecuta la acción.
const isAdminSocket = (socket) => {
    if (socket.isAdmin === true) return true;

    socket.emit('error', { message: 'No autorizado. Vuelve a iniciar sesión.' });
    return false;
};

module.exports = { registerSocketAuth, isAdminSocket };
