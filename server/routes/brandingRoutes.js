const express = require('express');
const router = express.Router();
const { getBranding, getBrandingLogo } = require('../controllers/branding.controller');

// Rutas PÚBLICAS (no piden contraseña): solo exponen el logo, el color y el texto de bienvenida.
router.get('/', getBranding);
router.get('/logo', getBrandingLogo);

module.exports = router;
