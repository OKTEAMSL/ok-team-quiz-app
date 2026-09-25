const express = require('express');
const router = express.Router();
const {
    listQuizzes, getQuiz, createQuiz, updateQuiz, deleteQuiz, activateQuiz, duplicateQuiz
} = require('../controllers/quiz.controller');

router.get('/', listQuizzes);
router.post('/', createQuiz);
router.get('/:id', getQuiz);
router.put('/:id', updateQuiz);
router.delete('/:id', deleteQuiz);
router.post('/:id/activate', activateQuiz);
router.post('/:id/duplicate', duplicateQuiz);

module.exports = router;
