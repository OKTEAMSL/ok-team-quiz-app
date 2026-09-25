import { useEffect, useSyncExternalStore } from 'react';
import { useSocket } from './useSocket';
import { ensureReadableOnWhite, darken } from '../utils/color';

// Imagen de marca del cuestionario en uso: logo, color principal y texto de bienvenida.
// Es un almacén compartido: aunque varios componentes usen el hook, solo hay una petición
// y todos ven lo mismo. Cuando el administrador cambia la marca, el servidor avisa
// ('branding_updated') y los móviles y el Host se actualizan sin recargar.

const API_URL = import.meta.env.VITE_API_URL || '';

let state = { primaryColor: null, welcomeText: null, logoUrl: null, loaded: false };
const listeners = new Set();
let inflight = null;

const subscribe = (listener) => {
    listeners.add(listener);
    return () => listeners.delete(listener);
};

const getSnapshot = () => state;

// El color de marca sustituye al azul de OK Team en TODA la interfaz (botones, títulos...)
const applyColor = (color) => {
    const root = document.documentElement;

    if (color) {
        const readable = ensureReadableOnWhite(color);
        root.style.setProperty('--primary-blue', readable);
        root.style.setProperty('--primary-blue-dark', darken(readable, 0.2));
    } else {
        root.style.removeProperty('--primary-blue');
        root.style.removeProperty('--primary-blue-dark');
    }
};

// 'force' vuelve a pedirla aunque ya esté cargada (cuando el servidor avisa de un cambio).
// Sin 'force', si ya se cargó no se hace nada: cada pantalla del móvil usa este hook y, sin
// esto, cada cambio de pantalla habría vuelto a pedir la marca al servidor.
export const loadBranding = (force = false) => {
    if (!force && state.loaded) return Promise.resolve();
    if (inflight) return inflight;

    inflight = fetch(`${API_URL}/api/branding`, { cache: 'no-store' })
        .then((response) => (response.ok ? response.json() : null))
        .then((data) => {
            if (!data) return;

            state = {
                primaryColor: data.primaryColor || null,
                welcomeText: data.welcomeText || null,
                logoUrl: data.logoUrl ? `${API_URL}${data.logoUrl}` : null,
                loaded: true
            };

            applyColor(state.primaryColor);
            listeners.forEach((listener) => listener());
        })
        .catch((error) => {
            // Sin marca no pasa nada: se ve el diseño normal de OK Team
            console.log('ℹ️ No se pudo cargar la imagen de marca:', error?.message || error);
        })
        .finally(() => { inflight = null; });

    return inflight;
};

export const useBranding = () => {
    const { socket } = useSocket();
    const branding = useSyncExternalStore(subscribe, getSnapshot);

    useEffect(() => {
        loadBranding();
    }, []);

    useEffect(() => {
        if (!socket) return;

        const reload = () => { loadBranding(true); };

        socket.on('branding_updated', reload);
        socket.on('connect', reload);   // p. ej. tras reiniciarse el servidor

        return () => {
            socket.off('branding_updated', reload);
            socket.off('connect', reload);
        };
    }, [socket]);

    return branding;
};
