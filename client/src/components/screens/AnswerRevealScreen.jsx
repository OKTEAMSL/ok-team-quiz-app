import PropTypes from 'prop-types';
import GameHeader from '../common/GameHeader';
import '../../styles/AnswerRevealScreen.css';

const formatNumber = (n) => new Intl.NumberFormat('es-ES', { maximumFractionDigits: 6 }).format(n);

// Pantalla del móvil cuando el presentador pulsa "Mostrar respuesta".
// Muestra SOLO la respuesta correcta (o las respuestas, si hay más de una), o los resultados
// de la encuesta. A propósito NO recibe ni muestra el texto de la pregunta.
const AnswerRevealScreen = ({ playerName, score, reveal }) => {
    const kind = reveal?.kind || 'CHOICE';

    let content;

    if (kind === 'NUMBER' && Number.isFinite(reveal?.correctNumber)) {
        content = (
            <>
                <p className="reveal-label">Respuesta correcta</p>
                <div className="reveal-list">
                    <div className="reveal-answer reveal-number">{formatNumber(reveal.correctNumber)}</div>
                </div>
            </>
        );
    } else if (kind === 'POLL' && Array.isArray(reveal?.options)) {
        const total = reveal.total || 0;

        content = (
            <>
                <p className="reveal-label reveal-label-poll">Resultados de la encuesta</p>
                <div className="reveal-poll">
                    {reveal.options.map((text, i) => {
                        const votes = reveal.counts?.[i] || 0;
                        const percent = total > 0 ? Math.round((votes * 100) / total) : 0;

                        return (
                            <div key={i} className="poll-row">
                                <div className="poll-row-head">
                                    <span className="poll-option">{text}</span>
                                    <span className="poll-percent">{percent}%</span>
                                </div>
                                <div className="poll-bar-track">
                                    <div className="poll-bar-fill" style={{ width: `${percent}%` }}></div>
                                </div>
                                <span className="poll-votes">{votes} {votes === 1 ? 'voto' : 'votos'}</span>
                            </div>
                        );
                    })}
                </div>
            </>
        );
    } else if (Array.isArray(reveal?.correctOptions) && reveal.correctOptions.length > 0) {
        content = (
            <>
                <p className="reveal-label">
                    {reveal.correctOptions.length > 1 ? 'Respuestas correctas' : 'Respuesta correcta'}
                </p>

                <div className="reveal-list">
                    {reveal.correctOptions.map((text, i) => (
                        <div key={i} className="reveal-answer">{text}</div>
                    ))}
                </div>
            </>
        );
    } else {
        // Por ejemplo, si el jugador entró justo en este momento
        content = <p className="reveal-label">Mira la pantalla principal</p>;
    }

    return (
        <div className="mobile-container">
            <GameHeader playerName={playerName} score={score} />

            <div className="reveal-container">
                {content}

                <p className="reveal-hint">Mantente atento a la pantalla principal</p>
            </div>
        </div>
    );
};

AnswerRevealScreen.propTypes = {
    playerName: PropTypes.string.isRequired,
    score: PropTypes.number.isRequired,
    reveal: PropTypes.shape({
        kind: PropTypes.string,
        correctOptions: PropTypes.arrayOf(PropTypes.string),
        correctNumber: PropTypes.number,
        options: PropTypes.arrayOf(PropTypes.string),
        counts: PropTypes.arrayOf(PropTypes.number),
        total: PropTypes.number
    })
};

export default AnswerRevealScreen;
