const Question = require('../models/Questions');
const Quiz = require('../models/Quiz');
const { sequelize } = require('../config/db');

// ---------------------------------------------------------------------------
// Tipos de pregunta
// ---------------------------------------------------------------------------
const KINDS = ['CHOICE', 'TRUE_FALSE', 'NUMBER', 'POLL'];
const TRUE_FALSE_OPTIONS = ['Verdadero', 'Falso'];

// Puntos de las preguntas NUMBER según lo cerca que quedó cada equipo:
// el más cercano 100, el siguiente 70, el siguiente 40, el resto 0.
// (Los empates comparten puesto y puntos.)
const NUMBER_POINTS = [100, 70, 40];

// Las preguntas creadas antes de esta versión no tienen 'kind': son de opción múltiple.
const getKind = (question) => (question && KINDS.includes(question.kind)) ? question.kind : 'CHOICE';

// ---------------------------------------------------------------------------
// Orden de las preguntas
// ---------------------------------------------------------------------------
// Orden canónico: por posición y, si hubiera empate o preguntas antiguas sin posición,
// por fecha de creación (que NO cambia al editar). Sin un ORDER BY explícito, PostgreSQL
// devuelve las filas en orden físico y una fila editada (UPDATE) pasa al final de la tabla.
const QUESTION_ORDER = [
    ['position', 'ASC NULLS LAST'],
    ['createdAt', 'ASC'],
    ['id', 'ASC']
];

// Preguntas de un cuestionario, en orden. Sin quizId devuelve todas (modo de emergencia).
const findAllOrdered = (quizId) =>
    Question.findAll({ where: quizId ? { quizId } : {}, order: QUESTION_ORDER });

const comparePosition = (a, b) => {
    const pa = a.position ?? Infinity;
    const pb = b.position ?? Infinity;
    if (pa !== pb) return pa < pb ? -1 : 1;

    const ta = new Date(a.createdAt).getTime();
    const tb = new Date(b.createdAt).getTime();
    if (ta !== tb) return ta - tb;

    return a.id < b.id ? -1 : 1;
};

// Asigna posiciones 1..N DENTRO DE CADA cuestionario a las preguntas que no la tengan y
// repara huecos/duplicados. Es idempotente: si ya está todo bien, no toca nada.
const backfillQuestionPositions = async () => {
    const all = await Question.findAll();

    const groups = new Map();
    for (const q of all) {
        const key = q.quizId || 'none';
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(q);
    }

    const pending = [];
    for (const list of groups.values()) {
        list.sort(comparePosition);
        list.forEach((q, i) => { if (q.position !== i + 1) pending.push([q, i + 1]); });
    }

    if (pending.length === 0) return 0;

    await sequelize.transaction(async (transaction) => {
        for (const [question, position] of pending) {
            // silent: no modifica updatedAt (es solo un reordenamiento interno)
            await question.update({ position }, { transaction, silent: true });
        }
    });

    return pending.length;
};

// ---------------------------------------------------------------------------
// Cuestionarios
// ---------------------------------------------------------------------------
// Cuestionario en uso (el que se juega). null si todavía no existe ninguno.
// El logo (hasta ~300 KB en base64) solo se carga si se pide: casi nadie lo necesita y
// esta función se usa en cada carga de pantalla de los móviles.
const getActiveQuiz = ({ withLogo = false } = {}) => Quiz.findOne({
    where: { isActive: true },
    order: [['createdAt', 'ASC']],
    attributes: withLogo ? undefined : { exclude: ['logo'] }
});

// Garantiza que exista un cuestionario en uso y que TODAS las preguntas pertenezcan a alguno.
// Es lo que migra los datos anteriores: las preguntas que ya tenías pasan a
// "Cuestionario principal". Es idempotente (arrancar varias veces no cambia nada).
const ensureDefaultQuiz = async () => {
    return sequelize.transaction(async (transaction) => {
        let quizzes = await Quiz.findAll({ order: [['createdAt', 'ASC']], transaction });

        if (quizzes.length === 0) {
            quizzes = [await Quiz.create({ name: 'Cuestionario principal', isActive: true }, { transaction })];
        }

        let active = quizzes.filter((q) => q.isActive);

        if (active.length === 0) {
            await quizzes[0].update({ isActive: true }, { transaction });
            active = [quizzes[0]];
        } else if (active.length > 1) {
            // Nunca debe haber dos en uso: se conserva el más antiguo
            for (const extra of active.slice(1)) {
                await extra.update({ isActive: false }, { transaction });
            }
            active = [active[0]];
        }

        // Preguntas sin cuestionario (datos anteriores) -> al que está en uso
        await Question.update(
            { quizId: active[0].id },
            { where: { quizId: null }, silent: true, transaction }
        );

        return active[0];
    });
};

// ---------------------------------------------------------------------------
// Respuestas correctas
// ---------------------------------------------------------------------------
// Índices de las respuestas correctas de una pregunta.
// Compatible con preguntas antiguas que solo tienen correctIndex.
const getCorrectIndexes = (question) => {
    if (!question) return [];

    const list = Array.isArray(question.correctIndexes)
        ? question.correctIndexes.filter(Number.isInteger)
        : [];

    if (list.length > 0) return list;

    return Number.isInteger(question.correctIndex) ? [question.correctIndex] : [];
};

// Respuesta(s) correcta(s) listas para enviar: índices y textos.
const getRevealPayload = (question) => {
    const correctIndexes = getCorrectIndexes(question);
    const correctOptions = correctIndexes
        .map((i) => question.options[i])
        .filter((text) => text !== undefined);

    return { correctIndexes, correctOptions };
};

// ---------------------------------------------------------------------------
// Resultados por tipo de pregunta
// ---------------------------------------------------------------------------
// NUMBER: clasificación por cercanía. 'answers' es un Map { nombre -> número }.
const computeNumberRanking = (question, answers) => {
    const target = Number(question.correctNumber);

    const rows = [...answers.entries()]
        .filter(([, value]) => Number.isFinite(value))
        .map(([name, answer]) => ({ name, answer, distance: Math.abs(answer - target) }));

    rows.sort((a, b) => (a.distance - b.distance) || a.name.localeCompare(b.name));

    // Puestos "densos": los empates comparten puesto y el siguiente distinto es el puesto +1
    let place = -1;
    let lastDistance = null;

    for (const row of rows) {
        if (lastDistance === null || Math.abs(row.distance - lastDistance) > 1e-9) {
            place += 1;
            lastDistance = row.distance;
        }
        row.place = place + 1;
        row.points = NUMBER_POINTS[place] || 0;
    }

    return rows;
};

// POLL: cuántos votos tuvo cada opción. 'answers' es un Map { nombre -> índice }.
const computePollResults = (question, answers) => {
    const counts = new Array(question.options.length).fill(0);

    for (const value of answers.values()) {
        if (Number.isInteger(value) && value >= 0 && value < counts.length) counts[value] += 1;
    }

    return { counts, total: counts.reduce((sum, n) => sum + n, 0) };
};

// Lo que se envía cuando el presentador pulsa "Mostrar respuesta":
//   host  -> pantalla principal (todo el detalle)
//   phone -> móviles de los jugadores (SOLO la respuesta / los resultados; nunca la pregunta)
// 'storedRanking' es la clasificación NUMBER ya calculada (y ya puntuada) al mostrar la respuesta.
const buildReveal = (question, answers, storedRanking) => {
    const kind = getKind(question);

    if (kind === 'NUMBER') {
        const ranking = storedRanking || computeNumberRanking(question, answers);

        return {
            host: { kind, correctNumber: question.correctNumber, ranking, correctOptions: [] },
            phone: { kind, correctNumber: question.correctNumber }
        };
    }

    if (kind === 'POLL') {
        const { counts, total } = computePollResults(question, answers);
        const data = { kind, options: question.options, counts, total };

        return { host: { ...data, correctOptions: [] }, phone: data };
    }

    const { correctIndexes, correctOptions } = getRevealPayload(question);

    return {
        host: {
            kind,
            correctIndex: correctIndexes[0],
            correctOption: correctOptions[0],
            correctIndexes,
            correctOptions
        },
        phone: { kind, correctOptions }
    };
};

// Lo que se envía a los clientes al presentar una pregunta.
// NUNCA incluye la respuesta correcta (ni el número objetivo).
const toClientQuestion = (question) => {
    const kind = getKind(question);

    return {
        title: question.title,
        options: kind === 'NUMBER' ? [] : question.options,
        type: question.type,
        mediaUrl: question.mediaUrl,
        kind
    };
};

module.exports = {
    KINDS,
    TRUE_FALSE_OPTIONS,
    NUMBER_POINTS,
    QUESTION_ORDER,
    getKind,
    findAllOrdered,
    backfillQuestionPositions,
    getActiveQuiz,
    ensureDefaultQuiz,
    getCorrectIndexes,
    getRevealPayload,
    computeNumberRanking,
    computePollResults,
    buildReveal,
    toClientQuestion
};
