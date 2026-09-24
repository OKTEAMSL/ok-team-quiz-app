import PropTypes from 'prop-types';
import GameHeader from '../common/GameHeader';
import '../../styles/AnswerRevealScreen.css';

// Pantalla del móvil cuando el presentador pulsa "Mostrar respuesta".
// Muestra SOLO la respuesta correcta (o las respuestas, si hay más de una).
// A propósito NO recibe ni muestra el texto de la pregunta.
const AnswerRevealScreen = ({ playerName, score, correctOptions }) => {
    const hasAnswers = Array.isArray(correctOptions) && correctOptions.length > 0;

    return (
        <div className="mobile-container">
            <GameHeader playerName={playerName} score={score} />

            <div className="reveal-container">
                {hasAnswers ? (
                    <>
                        <p className="reveal-label">
                            {correctOptions.length > 1 ? 'Respuestas correctas' : 'Respuesta correcta'}
                        </p>

                        <div className="reveal-list">
                            {correctOptions.map((text, i) => (
                                <div key={i} className="reveal-answer">{text}</div>
                            ))}
                        </div>
                    </>
                ) : (
                    // Por ejemplo, si el jugador entró justo en este momento
                    <p className="reveal-label">Mira la pantalla principal</p>
                )}

                <p className="reveal-hint">Mantente atento a la pantalla principal</p>
            </div>
        </div>
    );
};

AnswerRevealScreen.propTypes = {
    playerName: PropTypes.string.isRequired,
    score: PropTypes.number.isRequired,
    correctOptions: PropTypes.arrayOf(PropTypes.string)
};

export default AnswerRevealScreen;
