const express = require('express')
const router = express.Router();
const { getQuestion, createQuestion, updateQuestion, deleteQuestion, reorderQuestions } = require('../controllers/question.controller')

router.get('/', getQuestion);
router.post('/', createQuestion);

// IMPORTANTE: /reorder debe declararse ANTES que /:id, si no Express interpretaría
// "reorder" como si fuera el id de una pregunta.
router.put('/reorder', reorderQuestions);

router.delete('/:id', deleteQuestion);
router.put('/:id', updateQuestion);

module.exports = router;
