import { useEffect, useState } from 'react';

// Autentica el socket como administrador (independiente de HTTP): manda el token guardado
// en localStorage con el evento 'admin_auth' y espera la confirmación del servidor.
// Hace falta esto para poder usar los eventos de control del juego (next_question,
// activate_answers, show_answer, reset_game) y para unirse como 'HOST'.
//
// Se repite automáticamente en cada reconexión: el servidor solo recuerda 'isAdmin' en el
// socket mientras dura esa conexión — si el WiFi falla y el socket se reconecta, es un
// socket nuevo para el servidor y hay que volver a demostrar quién es.
export const useAdminSocketAuth = (socket, isConnected) => {
    // null = todavía no se sabe, true = autenticado, false = el token no es válido
    const [isAdminReady, setIsAdminReady] = useState(null);

    useEffect(() => {
        if (!socket || !isConnected) return;

        const token = localStorage.getItem('admin_token');

        if (!token) {
            setIsAdminReady(false);
            return;
        }

        const handleResult = (data) => {
            setIsAdminReady(Boolean(data?.ok));

            if (!data?.ok) {
                // El token guardado ya no sirve (contraseña cambiada, token expirado a las
                // 24h...): se limpia para que AuthGuard vuelva a pedir la contraseña.
                console.log('⛔ Autenticación de administrador por socket rechazada');
                localStorage.removeItem('admin_token');
            }
        };

        socket.on('admin_auth_result', handleResult);
        socket.emit('admin_auth', { token });

        return () => {
            socket.off('admin_auth_result', handleResult);
        };
    // Se repite en cada (re)conexión: isConnected pasa a true de nuevo tras una reconexión.
    }, [socket, isConnected]);

    return { isAdminReady };
};
