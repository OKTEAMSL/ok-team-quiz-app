// Utilidades de color para la imagen de marca de los clientes.

export const hexToRgb = (hex) => {
    const match = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!match) return null;

    const n = parseInt(match[1], 16);
    return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
};

const rgbToHex = ({ r, g, b }) =>
    '#' + [r, g, b].map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, '0')).join('');

// Luminancia relativa (WCAG)
const luminance = ({ r, g, b }) => {
    const channel = (c) => {
        const v = c / 255;
        return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
};

// Contraste de un color contra el blanco (1 = igual, 21 = negro sobre blanco)
export const contrastWithWhite = (hex) => {
    const rgb = hexToRgb(hex);
    if (!rgb) return 21;
    return 1.05 / (luminance(rgb) + 0.05);
};

// Oscurece un color mezclándolo con negro (amount: 0 a 1)
export const darken = (hex, amount) => {
    const rgb = hexToRgb(hex);
    if (!rgb) return hex;

    return rgbToHex({
        r: rgb.r * (1 - amount),
        g: rgb.g * (1 - amount),
        b: rgb.b * (1 - amount)
    });
};

// Si el color es tan claro que el texto blanco de los botones no se leería, se oscurece
// poco a poco hasta que se lea bien. Así un cliente que elija un amarillo pálido no deja
// las pantallas ilegibles.
export const ensureReadableOnWhite = (hex, minContrast = 3) => {
    let color = hex;

    for (let i = 0; i < 25 && contrastWithWhite(color) < minContrast; i++) {
        color = darken(color, 0.08);
    }

    return color;
};

// ¿Se oscurecerá este color al aplicarlo? (para avisar en el panel de administración)
export const willBeAdjusted = (hex) => contrastWithWhite(hex) < 3;
