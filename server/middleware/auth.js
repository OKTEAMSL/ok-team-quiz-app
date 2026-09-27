const jwt = require('jsonwebtoken')

// Sin fallback: si JWT_SECRET no está configurado, server.js aborta el arranque (ver
// startServer). Antes había un secreto de repuesto ('fallback-secret-key') escrito en el
// código: cualquiera que leyera el código podía fabricar tokens de administrador válidos.
const JWT_SECRET = process.env.JWT_SECRET;

// Verifica un JWT de administrador. Se usa tanto desde HTTP (authenticateAdmin, abajo)
// como desde los sockets (ver socketAuth.js), para que ambos caminos confíen en la misma
// regla: el token tiene que venir firmado por el servidor con JWT_SECRET.
const verifyAdminToken = (token) => {
    if (!token) return null;

    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (error) {
        return null;
    }
};

const authenticateAdmin = (req, res, next) => {
    console.log('🔍 authenticateAdmin - Validando request a:', req.path);
    
    const authHeader = req.headers.authorization;
    
    if (!authHeader) {
        console.log('⛔ Request sin token de autorización');
        return res.status(401).json({ 
            error: 'No autorizado - Token requerido' 
        });
    }
    
    const token = authHeader.split(' ')[1];
    
    if (!token) {
        console.log('⛔ Token vacío');
        return res.status(401).json({ 
            error: 'No autorizado - Token vacío' 
        });
    }
    
    // Verificar JWT
    const decoded = verifyAdminToken(token);

    if (decoded) {
        console.log('✅ JWT válido:', decoded);
        req.user = decoded;
        next();
    } else {
        console.log('⛔ JWT inválido o expirado');
        return res.status(403).json({ 
            error: 'No autorizado - Token inválido o expirado'
        });
    }
};

module.exports = { authenticateAdmin, verifyAdminToken, JWT_SECRET };