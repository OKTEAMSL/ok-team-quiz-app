import { useEffect, useState } from "react";
import io from 'socket.io-client';

let socketInstance = null; 

// Los navegadores móviles congelan los temporizadores de la página cuando está en segundo
// plano, así que el reintento automático puede tardar en dispararse. Al volver a la app (o
// al recuperar la red) se fuerza la reconexión inmediata si el socket está caído.
let removeWakeUpListeners = null;
const registerWakeUpReconnect = (socket) => {
    if (removeWakeUpListeners) return;

    const reconnectIfNeeded = () => {
        if (document.visibilityState === 'visible' && socket && !socket.connected) {
            console.log('🔄 Volvió a la app / a la red: reconectando socket');
            socket.connect();
        }
    };

    document.addEventListener('visibilitychange', reconnectIfNeeded);
    window.addEventListener('online', reconnectIfNeeded);
    window.addEventListener('pageshow', reconnectIfNeeded);

    removeWakeUpListeners = () => {
        document.removeEventListener('visibilitychange', reconnectIfNeeded);
        window.removeEventListener('online', reconnectIfNeeded);
        window.removeEventListener('pageshow', reconnectIfNeeded);
        removeWakeUpListeners = null;
    };
};

export const useSocket = () => {
    const [isConnected, setIsConnected] = useState(false);

    useEffect(() => {
        if (!socketInstance) {
            const SOCKET_URL = import.meta.env.VITE_SOCKET_URL || window.location.origin;
            
            console.log('🔌 Creando nueva instancia de socket:', SOCKET_URL);
            
            socketInstance = io(SOCKET_URL, {
                reconnection: true,
                reconnectionDelay: 1000,
                reconnectionDelayMax: 5000,
                // Antes eran 5 intentos: si el WiFi del evento fallaba unos segundos el
                // móvil se rendía para siempre y el jugador quedaba fuera hasta recargar.
                reconnectionAttempts: Infinity,
                transports: ['websocket', 'polling']
            });

            registerWakeUpReconnect(socketInstance);
        }

        const onConnect = () => {
            console.log('✅ Socket conectado:', socketInstance.id);
            setIsConnected(true);
        };

        const onDisconnect = () => {
            console.log('❌ Socket desconectado');
            setIsConnected(false);
        };

        socketInstance.on('connect', onConnect);
        socketInstance.on('disconnect', onDisconnect);

        setIsConnected(socketInstance.connected);

        return () => {
            socketInstance.off('connect', onConnect);
            socketInstance.off('disconnect', onDisconnect);
        };
    }, []);

    return { 
        socket: socketInstance, 
        isConnected 
    };
};

export const disconnectSocket = () => {
    if (socketInstance) {
        console.log('🔌 Desconectando socket globalmente');
        if (removeWakeUpListeners) removeWakeUpListeners();
        socketInstance.disconnect();
        socketInstance = null;
    }
};