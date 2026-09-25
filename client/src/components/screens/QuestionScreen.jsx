import { useState } from 'react';
import PropTypes from 'prop-types';
import GameHeader from '../common/GameHeader';
import '../../styles/QuestionScreen.css';

// Acepta "12,5" y "12.5". Devuelve null si no es un número válido.
const parseNumber = (text) => {
    const clean = text.trim().replace(',', '.');
    return /^-?\d+(\.\d+)?$/.test(clean) ? Number(clean) : null;
};

const PROMPTS = {
    CHOICE: 'Selecciona tu respuesta:',
    TRUE_FALSE: '¿Verdadero o falso?',
    POLL: 'Elige tu opción:',
    NUMBER: 'Escribe tu respuesta (un número):'
};

const QuestionScreen = ({ 
    playerName, 
    score,
    timer,
    optionsAnswers,
    hasAnswered,
    answerStatus,
    myAnswer,
    correctAnswer,
    onSubmitAnswer
}) => {
    // Tipo de pregunta: opción múltiple, verdadero/falso, número o encuesta
    const kind = optionsAnswers?.kind || 'CHOICE';

    const [numberText, setNumberText] = useState('');
    const parsedNumber = parseNumber(numberText);
    const canSendNumber = parsedNumber !== null && timer !== 0 && !hasAnswered;

    const getButtonClass = (index) => {
        if (timer === 0) return 'disabled';

        if (answerStatus === null && !hasAnswered) return 'active';

        if (answerStatus === null && hasAnswered) {
            return index === myAnswer ? 'active' : 'disabled';
        }

        if (answerStatus === 'CORRECT' && index === correctAnswer) {
            return 'correct';
        }

        if (answerStatus === 'INCORRECT' && index === myAnswer) {
            return 'incorrect';
        }
        
        return 'disabled';
    };

    const handleAnswerClick = (index) => {
        if (navigator.vibrate) navigator.vibrate(50);
        onSubmitAnswer(index);
    };

    const toggleSign = () => {
        setNumberText((text) => {
            const clean = text.trim();
            return clean.startsWith('-') ? clean.slice(1) : `-${clean}`;
        });
    };

    const handleSendNumber = () => {
        if (!canSendNumber) return;
        if (navigator.vibrate) navigator.vibrate(50);
        onSubmitAnswer(parsedNumber);
    };

    const optionLabel = (answer, i) => {
        if (kind === 'TRUE_FALSE') return `${i === 0 ? '✅' : '❌'} ${answer}`;
        return answer;
    };

    return (
        <div className="mobile-container">
            <GameHeader playerName={playerName} score={score} />

            <div className="question-container">
                {timer !== null && (
                    <div className="mobile-timer">
                        <span className="mobile-timer-icon"></span>
                        <span className="mobile-timer-number">{timer}</span>
                    </div>
                )}

                {optionsAnswers?.options ? (
                    <div>
                        <h3 className="question-prompt">{PROMPTS[kind] || PROMPTS.CHOICE}</h3>

                        {kind === 'NUMBER' ? (
                            <div className="number-answer">
                                <div className="number-input-row">
                                    <input
                                        className="number-input"
                                        type="text"
                                        inputMode="decimal"
                                        autoComplete="off"
                                        placeholder="0"
                                        value={numberText}
                                        disabled={timer === 0 || hasAnswered}
                                        onChange={(e) => setNumberText(e.target.value)}
                                        onKeyDown={(e) => { if (e.key === 'Enter') handleSendNumber(); }}
                                    />

                                    {/* El teclado numérico del iPhone no tiene el signo menos */}
                                    <button
                                        type="button"
                                        className="number-sign"
                                        disabled={timer === 0 || hasAnswered}
                                        onClick={toggleSign}
                                        aria-label="Cambiar entre positivo y negativo"
                                    >
                                        ±
                                    </button>
                                </div>

                                <button
                                    className="game-btn active number-send"
                                    disabled={!canSendNumber}
                                    onClick={handleSendNumber}
                                >
                                    Enviar respuesta
                                </button>

                                {numberText.trim() !== '' && parsedNumber === null && !hasAnswered && (
                                    <p className="number-hint">Escribe solo números (por ejemplo 1985 o 12,5)</p>
                                )}

                                {hasAnswered && (
                                    <div className="number-sent">
                                        ✓ Respuesta enviada{myAnswer !== null && myAnswer !== undefined ? <>: <strong>{myAnswer}</strong></> : ''}
                                    </div>
                                )}
                            </div>
                        ) : (
                            <div className={`game-grid ${kind === 'TRUE_FALSE' ? 'true-false-grid' : ''}`}>
                                {optionsAnswers.options.map((answer, i) => (
                                    <button
                                        key={i} 
                                        disabled={timer === 0 || (hasAnswered && answerStatus === null)}
                                        onClick={() => handleAnswerClick(i)}
                                        className={`game-btn ${getButtonClass(i)}`}
                                    >
                                        {optionLabel(answer, i)}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="loading-state">
                        <div className="spinner"></div>
                        <p>Cargando pregunta...</p>
                    </div>
                )}
            </div>
        </div>
    );
};

QuestionScreen.propTypes = {
    playerName: PropTypes.string.isRequired,
    score: PropTypes.number.isRequired,
    timer: PropTypes.number,
    optionsAnswers: PropTypes.shape({
        options: PropTypes.arrayOf(PropTypes.string),
        kind: PropTypes.string
    }),
    hasAnswered: PropTypes.bool.isRequired,
    answerStatus: PropTypes.oneOf(['CORRECT', 'INCORRECT', null]),
    myAnswer: PropTypes.number,
    correctAnswer: PropTypes.number,
    onSubmitAnswer: PropTypes.func.isRequired
};

export default QuestionScreen;
