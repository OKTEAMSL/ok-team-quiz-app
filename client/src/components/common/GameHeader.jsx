import PropTypes from 'prop-types';
import { useBranding } from '../../hooks/useBranding';
import '../../styles/GameHeader.css';

const GameHeader = ({ playerName, score }) => {
    const { logoUrl } = useBranding();

    return (
        <>
            <div className="app-header">
                <span className="player-info">
                    {logoUrl && <img className="header-logo" src={logoUrl} alt="" />}
                    <span className="player-name-text">{playerName}</span>
                </span>
                <span className="score-badge">{score}</span>
            </div>
            <div className="header-spacer"></div>
        </>
    );
}

GameHeader.propTypes = {
    playerName: PropTypes.string.isRequired,
    score: PropTypes.number.isRequired
};

export default GameHeader;