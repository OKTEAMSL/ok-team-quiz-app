const Question = require('../models/Questions');
const { sequelize } = require('../config/db');

// Orden canónico de las preguntas: por posición y, si hubiera empate o
// preguntas antiguas sin posición, por fecha de creación (que NO cambia al editar).
// Sin un ORDER BY explícito, PostgreSQL devuelve las filas en orden físico y una
// fila editada (UPDATE) pasa al final de la tabla.
const QUESTION_ORDER = [
    ['position', 'ASC NULLS LAST'],
    ['createdAt', 'ASC'],
    ['id', 'ASC']
];

const findAllOrdered = () => Question.findAll({ order: QUESTION_ORDER });

// Asigna posiciones 1..N a las preguntas que no la tengan (datos anteriores a esta
// versión) y repara huecos/duplicados. Es idempotente: si ya está todo bien, no toca nada.
const backfillQuestionPositions = async () => {
    const all = await findAllOrdered();
    const pending = all.filter((q, i) => q.position !== i + 1);

    if (pending.length === 0) return 0;

    await sequelize.transaction(async (transaction) => {
        for (let i = 0; i < all.length; i++) {
            if (all[i].position !== i + 1) {
                // silent: no modifica updatedAt (es solo un reordenamiento interno)
                await all[i].update({ position: i + 1 }, { transaction, silent: true });
            }
        }
    });

    return pending.length;
};

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

// Lo que se envía a los clientes: NUNCA incluye cuál es la respuesta correcta.
const toClientQuestion = (question) => ({
    title: question.title,
    options: question.options,
    type: question.type,
    mediaUrl: question.mediaUrl
});

module.exports = {
    QUESTION_ORDER,
    findAllOrdered,
    backfillQuestionPositions,
    getCorrectIndexes,
    getRevealPayload,
    toClientQuestion
};
