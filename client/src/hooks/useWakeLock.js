import { useCallback, useEffect, useRef, useState } from 'react';

// Mantener la pantalla encendida.
//
// Por qué la versión anterior fallaba: el navegador LIBERA el bloqueo de pantalla cada vez
// que la página deja de estar visible (cambiar de app, bloquear el móvil, avisos...) y el
// código lo pedía una sola vez. Además, al recargar la página el jugador se reconectaba
// solo, pero sin pasar por el botón "Unirse", así que nunca se volvía a pedir.
//
// Esta versión:
//  1. Pide el bloqueo con la API nativa (Screen Wake Lock).
//  2. Lo vuelve a pedir al volver a la app, al restaurar la página y si el sistema lo revoca.
//  3. Revisa cada 10 s que siga activo (por si un navegador lo suelta sin avisar).
//  4. Si el navegador no soporta la API (iOS < 16.4, algunos navegadores integrados), usa
//     NoSleep.js como respaldo (un vídeo mínimo en bucle; necesita un toque del usuario).

const CHECK_EVERY_MS = 10000;
const MIN_HELD_MS = 3000;   // si el sistema lo revoca antes de esto, no insistimos (evita bucles)

export const useWakeLock = () => {
    const sentinelRef = useRef(null);
    const noSleepRef = useRef(null);
    const wantedRef = useRef(false);
    const pendingRef = useRef(false);
    const acquiredAtRef = useRef(0);
    const acquireRef = useRef(() => {});
    const fallbackActiveRef = useRef(false);
    const fallbackPendingRef = useRef(false);
    const gestureListenerRef = useRef(null);
    const armGestureRef = useRef(() => {});   // rompe la dependencia circular enableFallback <-> armGestureListener

    const [isActive, setIsActive] = useState(false);

    const nativeSupported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;

    // ---------- API nativa ----------
    const acquireNative = useCallback(async () => {
        if (!wantedRef.current || !nativeSupported) return;
        if (document.visibilityState !== 'visible') return;                 // oculta: el navegador lo rechaza
        if (sentinelRef.current && !sentinelRef.current.released) return;   // ya lo tenemos
        if (pendingRef.current) return;                                     // ya hay una petición en curso

        pendingRef.current = true;
        try {
            const sentinel = await navigator.wakeLock.request('screen');

            // Si mientras tanto se pidió liberar (salió de la partida), se suelta enseguida
            if (!wantedRef.current) {
                sentinel.release().catch(() => {});
                return;
            }

            sentinelRef.current = sentinel;
            acquiredAtRef.current = Date.now();
            setIsActive(true);
            console.log('🔆 Wake Lock activado');

            sentinel.addEventListener('release', () => {
                if (sentinelRef.current === sentinel) sentinelRef.current = null;
                setIsActive(false);

                // Si sigue visible y lo queremos (p. ej. el ahorro de batería lo revocó), reintentar
                const heldFor = Date.now() - acquiredAtRef.current;
                if (wantedRef.current && document.visibilityState === 'visible' && heldFor > MIN_HELD_MS) {
                    setTimeout(() => acquireRef.current(), 1000);
                }
            });
        } catch (err) {
            console.log('❌ No se pudo activar Wake Lock:', err?.name || err);
        } finally {
            pendingRef.current = false;
        }
    }, [nativeSupported]);

    useEffect(() => { acquireRef.current = acquireNative; }, [acquireNative]);

    // ---------- Respaldo NoSleep.js (navegadores sin API nativa) ----------
    const removeGestureListener = useCallback(() => {
        if (gestureListenerRef.current) {
            ['touchend', 'click'].forEach(ev => document.removeEventListener(ev, gestureListenerRef.current));
            gestureListenerRef.current = null;
        }
    }, []);

    const enableFallback = useCallback(async () => {
        if (nativeSupported || !wantedRef.current || fallbackActiveRef.current) return;
        if (fallbackPendingRef.current) return;   // ya hay una activación en curso
        fallbackPendingRef.current = true;

        try {
            if (!noSleepRef.current) {
                // Carga diferida: solo la descargan los navegadores que la necesitan
                const mod = await import('nosleep.js');
                noSleepRef.current = new mod.default();
            }
            await noSleepRef.current.enable();
            fallbackActiveRef.current = true;
            setIsActive(true);
            removeGestureListener();
            console.log('🔆 NoSleep (respaldo) activado');
        } catch (err) {
            // Normal si no hubo un toque del usuario: se reintenta en el siguiente
            console.log('ℹ️ NoSleep necesita un toque del usuario:', err?.name || err);
            armGestureRef.current();
        } finally {
            fallbackPendingRef.current = false;
        }
    }, [nativeSupported, removeGestureListener]);

    const armGestureListener = useCallback(() => {
        if (nativeSupported || gestureListenerRef.current || !wantedRef.current) return;

        const handler = () => { enableFallback(); };
        gestureListenerRef.current = handler;
        ['touchend', 'click'].forEach(ev => document.addEventListener(ev, handler));
    }, [nativeSupported, enableFallback]);

    useEffect(() => { armGestureRef.current = armGestureListener; }, [armGestureListener]);

    // ---------- Pedir / soltar ----------
    const requestWakeLock = useCallback(async () => {
        wantedRef.current = true;

        if (nativeSupported) {
            await acquireNative();
        } else {
            // Si esta llamada viene de un clic (botón "Unirse") funciona al instante;
            // si no, se activa con el primer toque.
            await enableFallback();
            armGestureListener();
        }
    }, [nativeSupported, acquireNative, enableFallback, armGestureListener]);

    const releaseWakeLock = useCallback(async () => {
        wantedRef.current = false;
        removeGestureListener();

        try {
            if (sentinelRef.current) {
                const sentinel = sentinelRef.current;
                sentinelRef.current = null;
                await sentinel.release();
                console.log('🌙 Wake Lock liberado');
            }
            if (noSleepRef.current && fallbackActiveRef.current) {
                noSleepRef.current.disable();
                fallbackActiveRef.current = false;
            }
        } catch (err) {
            console.log('❌ Error liberando Wake Lock:', err);
        }

        setIsActive(false);
    }, [removeGestureListener]);

    // ---------- Mantenerlo mientras se quiera ----------
    useEffect(() => {
        const reacquire = () => {
            if (!wantedRef.current || document.visibilityState !== 'visible') return;

            if (nativeSupported) {
                acquireNative();
            } else {
                fallbackActiveRef.current = false;   // el vídeo se pausa al ocultar la página
                armGestureListener();
            }
        };

        const onVisibility = () => reacquire();
        const onPageShow = () => reacquire();     // al restaurar la página desde la caché de "atrás/adelante"

        document.addEventListener('visibilitychange', onVisibility);
        window.addEventListener('pageshow', onPageShow);

        const timer = setInterval(() => {
            if (!wantedRef.current || document.visibilityState !== 'visible') return;

            if (nativeSupported && (!sentinelRef.current || sentinelRef.current.released)) {
                acquireNative();
            }
        }, CHECK_EVERY_MS);

        return () => {
            document.removeEventListener('visibilitychange', onVisibility);
            window.removeEventListener('pageshow', onPageShow);
            clearInterval(timer);
        };
    }, [nativeSupported, acquireNative, armGestureListener]);

    // Al desmontar, soltar todo
    useEffect(() => {
        return () => {
            wantedRef.current = false;
            removeGestureListener();
            sentinelRef.current?.release?.().catch(() => {});
            try { noSleepRef.current?.disable(); } catch { /* nada */ }
        };
    }, [removeGestureListener]);

    return {
        requestWakeLock,
        releaseWakeLock,
        isActive
    };
};
