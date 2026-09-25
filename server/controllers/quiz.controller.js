const Quiz = require('../models/Quiz');
const Question = require('../models/Questions');
const { sequelize } = require('../config/db');
const gameState = require('../utils/gameState');
const { QUESTION_ORDER } = require('../utils/questionUtils');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;
const LOGO_RE = /^data:(image\/(?:png|jpeg|webp|gif));base64,([A-Za-z0-9+/]+={0,2})$/;
const MAX_LOGO_CHARS = 400000;   // ~300 KB de imagen

// Avisa a todos los móviles y al Host de que cambió la imagen de marca
const notifyBrandingChanged = (req) => {
    const io = req.app.get('io');
    if (io) io.emit('branding_updated');
};

// Comprueba que los primeros bytes son de verdad de una imagen del tipo indicado
const hasImageSignature = (mime, base64) => {
    const bytes = Buffer.from(base64.slice(0, 24), 'base64');
    const startsWith = (...sig) => sig.every((b, i) => bytes[i] === b);

    switch (mime) {
        case 'image/png':  return startsWith(0x89, 0x50, 0x4e, 0x47);
        case 'image/jpeg': return startsWith(0xff, 0xd8, 0xff);
        case 'image/gif':  return startsWith(0x47, 0x49, 0x46, 0x38);
        case 'image/webp': return startsWith(0x52, 0x49, 0x46, 0x46) &&
                                  bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50;
        default: return false;
    }
};

// Valida los campos de un cuestionario. En 'partial' solo se validan los que vengan.
const validateQuizData = (body, { partial }) => {
    const errors = [];
    const data = {};
    const has = (key) => Object.prototype.hasOwnProperty.call(body || {}, key);

    // Nombre
    if (has('name') || !partial) {
        const name = typeof body?.name === 'string' ? body.name.trim() : '';
        if (name.length < 1) errors.push('El nombre es obligatorio');
        else if (name.length > 80) errors.push('El nombre no puede superar 80 caracteres');
        else data.name = name;
    }

    // Color principal
    if (has('primaryColor')) {
        const color = body.primaryColor;
        if (color === null || color === '') data.primaryColor = null;
        else if (typeof color === 'string' && HEX_COLOR_RE.test(color)) data.primaryColor = color.toLowerCase();
        else errors.push('El color debe tener el formato #rrggbb');
    }

    // Texto de bienvenida
    if (has('welcomeText')) {
        const text = body.welcomeText;
        if (text === null || text === '') {
            data.welcomeText = null;
        } else if (typeof text !== 'string') {
            errors.push('El texto de bienvenida no es válido');
        } else {
            const clean = text.replace(/[<>]/g, '').trim();
            if (clean.length > 60) errors.push('El texto de bienvenida no puede superar 60 caracteres');
            else data.welcomeText = clean || null;
        }
    }

    // Logo (null = quitarlo)
    if (has('logo')) {
        const logo = body.logo;
        if (logo === null || logo === '') {
            data.logo = null;
        } else if (typeof logo !== 'string' || logo.length > MAX_LOGO_CHARS) {
            errors.push('El logo es demasiado grande (máximo unos 300 KB). Usa una imagen más pequeña.');
        } else {
            const match = LOGO_RE.exec(logo);
            if (!match) errors.push('El logo debe ser una imagen PNG, JPG, WEBP o GIF');
            else if (!hasImageSignature(match[1], match[2])) errors.push('El archivo del logo no es una imagen válida');
            else data.logo = logo;
        }
    }

    return { errors, data };
};

// Lo que se envía al panel de administración (sin el logo, que es pesado)
const toSummary = (quiz, questionCount) => ({
    id: quiz.id,
    name: quiz.name,
    isActive: quiz.isActive,
    primaryColor: quiz.primaryColor,
    welcomeText: quiz.welcomeText,
    hasLogo: quiz.get('hasLogo') !== undefined ? Boolean(quiz.get('hasLogo')) : Boolean(quiz.logo),
    questionCount: questionCount || 0,
    createdAt: quiz.createdAt,
    updatedAt: quiz.updatedAt
});

const countQuestions = async (quizId) => Question.count({ where: { quizId } });

// GET /api/quizzes
exports.listQuizzes = async (req, res) => {
    try {
        const quizzes = await Quiz.findAll({
            attributes: [
                'id', 'name', 'isActive', 'primaryColor', 'welcomeText', 'createdAt', 'updatedAt',
                [sequelize.literal('("logo" IS NOT NULL)'), 'hasLogo']
            ],
            order: [['createdAt', 'ASC']]
        });

        const counts = await Question.findAll({
            attributes: ['quizId', [sequelize.fn('COUNT', sequelize.col('id')), 'n']],
            group: ['quizId'],
            raw: true
        });
        const countByQuiz = new Map(counts.map((row) => [row.quizId, Number(row.n)]));

        return res.status(200).json(quizzes.map((quiz) => toSummary(quiz, countByQuiz.get(quiz.id))));
    } catch (error) {
        console.error('Error al listar cuestionarios:', error);
        return res.status(500).json({ message: 'Error al obtener los cuestionarios' });
    }
};

// GET /api/quizzes/:id  (incluye el logo, para editarlo)
exports.getQuiz = async (req, res) => {
    try {
        const { id } = req.params;
        if (!UUID_RE.test(id)) return res.status(400).json({ message: 'ID no válido' });

        const quiz = await Quiz.findByPk(id);
        if (!quiz) return res.status(404).json({ message: 'Cuestionario no encontrado' });

        return res.status(200).json({ ...toSummary(quiz, await countQuestions(id)), logo: quiz.logo });
    } catch (error) {
        console.error('Error al obtener cuestionario:', error);
        return res.status(500).json({ message: 'Error al obtener el cuestionario' });
    }
};

// POST /api/quizzes
exports.createQuiz = async (req, res) => {
    try {
        const { errors, data } = validateQuizData(req.body, { partial: false });

        if (errors.length > 0) {
            return res.status(400).json({ message: 'Datos inválidos', errors });
        }

        const quiz = await Quiz.create({ ...data, isActive: false });
        return res.status(201).json(toSummary(quiz, 0));
    } catch (error) {
        console.error('Error al crear cuestionario:', error);
        return res.status(500).json({ message: 'Error al crear el cuestionario' });
    }
};

// PUT /api/quizzes/:id
exports.updateQuiz = async (req, res) => {
    try {
        const { id } = req.params;
        if (!UUID_RE.test(id)) return res.status(400).json({ message: 'ID no válido' });

        const quiz = await Quiz.findByPk(id);
        if (!quiz) return res.status(404).json({ message: 'Cuestionario no encontrado' });

        const { errors, data } = validateQuizData(req.body, { partial: true });

        if (errors.length > 0) {
            return res.status(400).json({ message: 'Datos inválidos', errors });
        }

        await quiz.update(data);

        // Si es el que se está jugando, los móviles y el Host se actualizan al momento
        if (quiz.isActive) notifyBrandingChanged(req);

        return res.status(200).json(toSummary(quiz, await countQuestions(id)));
    } catch (error) {
        console.error('Error al actualizar cuestionario:', error);
        return res.status(500).json({ message: 'Error al actualizar el cuestionario' });
    }
};

// DELETE /api/quizzes/:id   (borra también sus preguntas)
exports.deleteQuiz = async (req, res) => {
    try {
        const { id } = req.params;
        if (!UUID_RE.test(id)) return res.status(400).json({ message: 'ID no válido' });

        const quiz = await Quiz.findByPk(id);
        if (!quiz) return res.status(404).json({ message: 'Cuestionario no encontrado' });

        if (quiz.isActive) {
            return res.status(409).json({
                message: 'Este cuestionario está en uso. Activa otro antes de borrarlo.'
            });
        }

        if ((await Quiz.count()) <= 1) {
            return res.status(409).json({ message: 'No se puede borrar el único cuestionario.' });
        }

        await sequelize.transaction(async (transaction) => {
            await Question.destroy({ where: { quizId: id }, transaction });
            await quiz.destroy({ transaction });
        });

        return res.status(204).end();
    } catch (error) {
        console.error('Error al borrar cuestionario:', error);
        return res.status(500).json({ message: 'Error al borrar el cuestionario' });
    }
};

// POST /api/quizzes/:id/activate   (lo deja "en uso" para el próximo evento)
exports.activateQuiz = async (req, res) => {
    try {
        const { id } = req.params;
        if (!UUID_RE.test(id)) return res.status(400).json({ message: 'ID no válido' });

        const quiz = await Quiz.findByPk(id);
        if (!quiz) return res.status(404).json({ message: 'Cuestionario no encontrado' });

        if (quiz.isActive) {
            return res.status(200).json(toSummary(quiz, await countQuestions(id)));
        }

        // Cambiar de cuestionario en mitad de una partida dejaría a los equipos a medias
        const state = gameState.getGameState();
        if (state !== 'LOBBY' && state !== 'GAME_OVER') {
            return res.status(409).json({
                message: 'Hay una partida en curso. Reinícala desde la pantalla del presentador antes de cambiar de cuestionario.'
            });
        }

        await sequelize.transaction(async (transaction) => {
            await Quiz.update({ isActive: false }, { where: {}, transaction });
            await quiz.update({ isActive: true }, { transaction });
        });

        notifyBrandingChanged(req);

        return res.status(200).json(toSummary(quiz, await countQuestions(id)));
    } catch (error) {
        console.error('Error al activar cuestionario:', error);
        return res.status(500).json({ message: 'Error al activar el cuestionario' });
    }
};

// POST /api/quizzes/:id/duplicate
exports.duplicateQuiz = async (req, res) => {
    try {
        const { id } = req.params;
        if (!UUID_RE.test(id)) return res.status(400).json({ message: 'ID no válido' });

        const original = await Quiz.findByPk(id);
        if (!original) return res.status(404).json({ message: 'Cuestionario no encontrado' });

        const copyName = `${original.name} (copia)`.slice(0, 80);

        const result = await sequelize.transaction(async (transaction) => {
            const copy = await Quiz.create({
                name: copyName,
                isActive: false,
                primaryColor: original.primaryColor,
                welcomeText: original.welcomeText,
                logo: original.logo
            }, { transaction });

            const questions = await Question.findAll({
                where: { quizId: id },
                order: QUESTION_ORDER,
                transaction
            });

            await Question.bulkCreate(questions.map((q, index) => ({
                title: q.title,
                type: q.type,
                options: q.options,
                mediaUrl: q.mediaUrl,
                correctIndex: q.correctIndex,
                correctIndexes: q.correctIndexes,
                kind: q.kind,
                correctNumber: q.correctNumber,
                timeLimit: q.timeLimit,
                position: index + 1,
                quizId: copy.id
            })), { transaction });

            return { copy, count: questions.length };
        });

        return res.status(201).json(toSummary(result.copy, result.count));
    } catch (error) {
        console.error('Error al duplicar cuestionario:', error);
        return res.status(500).json({ message: 'Error al duplicar el cuestionario' });
    }
};
