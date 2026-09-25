// Reduce el logo que sube el administrador antes de enviarlo al servidor.
// Devuelve un data URL (PNG, o JPEG si el PNG pesara demasiado).
// Así el administrador puede subir el archivo tal cual, sin preocuparse del tamaño.

const MAX_WIDTH = 480;
const MAX_HEIGHT = 240;
const MAX_CHARS = 380000;   // debe ser menor que el límite del servidor (400000)

const ACCEPTED = /^image\/(png|jpeg|webp|gif|svg\+xml)$/;

export const fileToLogoDataUrl = (file) => new Promise((resolve, reject) => {
    if (!file || !ACCEPTED.test(file.type)) {
        reject(new Error('Elige una imagen PNG, JPG, WEBP, GIF o SVG.'));
        return;
    }

    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
        try {
            // Los SVG sin tamaño propio pueden dar 0: se usa un tamaño por defecto
            const naturalW = img.naturalWidth || 300;
            const naturalH = img.naturalHeight || 150;
            const baseScale = Math.min(1, MAX_WIDTH / naturalW, MAX_HEIGHT / naturalH);

            const draw = (scale, mime, background) => {
                const canvas = document.createElement('canvas');
                canvas.width = Math.max(1, Math.round(naturalW * scale));
                canvas.height = Math.max(1, Math.round(naturalH * scale));

                const ctx = canvas.getContext('2d');
                if (background) {
                    ctx.fillStyle = background;
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                }
                ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

                return canvas.toDataURL(mime, 0.85);
            };

            // 1) PNG (conserva la transparencia), cada vez más pequeño si hace falta
            for (const factor of [1, 0.75, 0.5, 0.35]) {
                const png = draw(baseScale * factor, 'image/png');
                if (png.length <= MAX_CHARS) { resolve(png); return; }
            }

            // 2) JPEG sobre fondo blanco (pesa mucho menos)
            for (const factor of [1, 0.75, 0.5, 0.35]) {
                const jpeg = draw(baseScale * factor, 'image/jpeg', '#ffffff');
                if (jpeg.length <= MAX_CHARS) { resolve(jpeg); return; }
            }

            reject(new Error('La imagen es demasiado compleja. Prueba con un logo más sencillo.'));
        } catch {
            reject(new Error('No se pudo procesar la imagen.'));
        } finally {
            URL.revokeObjectURL(objectUrl);
        }
    };

    img.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error('No se pudo leer la imagen. Prueba con otro archivo.'));
    };

    img.src = objectUrl;
});
