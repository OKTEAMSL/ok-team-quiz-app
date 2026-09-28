const express = require('express')
const router = express.Router();
const { getQuestion, createQuestion, updateQuestion, deleteQuestion, reorderQuestions, getQuestionAnswers } = require('../controllers/question.controller')

router.get('/', getQuestion);
router.post('/', createQuestion);

// IMPORTANTE: /reorder debe declararse ANTES que /:id, si no Express interpretaría
// "reorder" como si fuera el id de una pregunta. Lo mismo para /:id/answers: debe ir
// ANTES que /:id a secas, o Express probaría a hacer match con /:id primero y nunca
// llegaría a esta ruta más específica.
router.put('/reorder', reorderQuestions);
router.get('/:id/answers', getQuestionAnswers);

router.delete('/:id', deleteQuestion);
router.put('/:id', updateQuestion);

module.exports = router;
