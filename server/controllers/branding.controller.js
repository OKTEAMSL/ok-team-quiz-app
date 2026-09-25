const { getActiveQuiz } = require('../utils/questionUtils');
const { sequelize } = require('../config/db');
const Quiz = require('../models/Quiz');

const LOGO_RE = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/]+={0,2})$/;

// GET /api/branding   (PÚBLICO: lo usan los móviles y el Host)
// Devuelve la imagen de marca del cuestionario en uso. No incluye el nombre interno.
exports.getBranding = async (req, res) => {
    try {
        // Sin cargar el logo (solo se necesita saber si existe): esta ruta la piden todos los móviles
        const quiz = await Quiz.findOne({
            where: { isActive: true },
            order: [['createdAt', 'ASC']],
            attributes: ['id', 'primaryColor', 'welcomeText', 'updatedAt', [sequelize.literal('("logo" IS NOT NULL)'), 'hasLogo']]
        });

        res.set('Cache-Control', 'no-cache');

        if (!quiz) {
            return res.status(200).json({ primaryColor: null, welcomeText: null, logoUrl: null });
        }

        return res.status(200).json({
            primaryColor: quiz.primaryColor,
            welcomeText: quiz.welcomeText,
            // La versión (?v=) cambia cuando se edita el cuestionario, así el navegador
            // guarda el logo en caché y solo lo vuelve a bajar si cambió.
            logoUrl: quiz.get('hasLogo') ? `/api/branding/logo?v=${new Date(quiz.updatedAt).getTime()}` : null
        });
    } catch (error) {
        console.error('Error al obtener la marca:', error);
        return res.status(500).json({ message: 'Error al obtener la imagen de marca' });
    }
};

// GET /api/branding/logo   (PÚBLICO)
exports.getBrandingLogo = async (req, res) => {
    try {
        const quiz = await getActiveQuiz({ withLogo: true });
        const match = quiz && quiz.logo ? LOGO_RE.exec(quiz.logo) : null;

        if (!match) {
            return res.status(404).end();
        }

        res.set({
            'Content-Type': match[1],
            'Cache-Control': 'public, max-age=31536000, immutable',
            'X-Content-Type-Options': 'nosniff'
        });

        return res.status(200).send(Buffer.from(match[2], 'base64'));
    } catch (error) {
        console.error('Error al enviar el logo:', error);
        return res.status(500).end();
    }
};
