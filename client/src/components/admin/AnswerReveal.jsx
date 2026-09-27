import '../../styles/AnswerReveal.css';

// Lo que se ve al pulsar "Mostrar respuesta", según el tipo de pregunta. La usan tanto la
// pantalla del presentador (grande) como el panel de administración (compacto) — mismo
// componente, para que ambos muestren siempre exactamente lo mismo.
const KIND_LABELS = {
    TRUE_FALSE: 'Verdadero o falso',
    NUMBER: 'Número más cercano',
    POLL: 'Encuesta'
};

const PLACE_ICONS = ['🥇', '🥈', '🥉'];

const formatNumber = (n) => new Intl.NumberFormat('es-ES', { maximumFractionDigits: 6 }).format(n);

const AnswerReveal = ({ reveal }) => {
    const kind = reveal.kind || 'CHOICE';

    if (kind === 'NUMBER') {
        const winners = (reveal.ranking || []).filter((row) => row.points > 0);
        const answeredCount = (reveal.ranking || []).length;

        return (
            <div className="answer-reveal">
                <h2 className="answer-title">✅ Respuesta Correcta:</h2>
                <div className="correct-answer-display number-reveal">{formatNumber(reveal.correctNumber)}</div>

                {winners.length > 0 ? (
                    <ul className="number-ranking">
                        {winners.map((row) => (
                            <li key={row.name} className="number-ranking-row">
                                <span className="number-place">{PLACE_ICONS[row.place - 1] || `${row.place}.`}</span>
                                <span className="number-team">{row.name}</span>
                                <span className="number-guess">
                                    {formatNumber(row.answer)}
                                    <small>{row.distance === 0 ? ' · exacto' : ` · a ${formatNumber(row.distance)}`}</small>
                                </span>
                                <strong className="number-points">+{row.points}</strong>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <p className="number-nobody">Nadie respondió esta pregunta</p>
                )}

                {answeredCount > 0 && (
                    <p className="number-answered">{answeredCount} {answeredCount === 1 ? 'equipo respondió' : 'equipos respondieron'}</p>
                )}
            </div>
        );
    }

    if (kind === 'POLL') {
        const total = reveal.total || 0;

        return (
            <div className="answer-reveal poll-reveal">
                <h2 className="answer-title">📊 Resultados de la encuesta</h2>
                {(reveal.options || []).map((text, i) => {
                    const votes = reveal.counts?.[i] || 0;
                    const percent = total > 0 ? Math.round((votes * 100) / total) : 0;

                    return (
                        <div key={i} className="poll-host-row">
                            <div className="poll-host-head">
                                <span className="poll-host-option">{text}</span>
                                <span className="poll-host-numbers">{votes} · {percent}%</span>
                            </div>
                            <div className="poll-host-track">
                                <div className="poll-host-fill" style={{ width: `${percent}%` }}></div>
                            </div>
                        </div>
                    );
                })}
                <p className="number-answered">{total} {total === 1 ? 'voto' : 'votos'}</p>
            </div>
        );
    }

    // Opción múltiple y verdadero/falso
    const options = reveal.correctOptions ?? [reveal.correctOption];

    return (
        <div className="answer-reveal">
            <h2 className="answer-title">
                ✅ {options.length > 1 ? 'Respuestas Correctas:' : 'Respuesta Correcta:'}
            </h2>
            {options.map((option, i) => (
                <div key={i} className="correct-answer-display">
                    {option}
                </div>
            ))}
        </div>
    );
};

export { KIND_LABELS };
export default AnswerReveal;
