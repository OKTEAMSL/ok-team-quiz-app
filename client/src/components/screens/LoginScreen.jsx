import PropTypes from 'prop-types';
import { useBranding } from '../../hooks/useBranding';
import '../../styles/LoginScreen.css';

const LoginScreen = ({ 
    nameGroup, 
    setNameGroup, 
    onEnterGame, 
    isConnected 
}) => {
    const { logoUrl, welcomeText } = useBranding();
    
    const handleKeyDown = (e) => {
        if (e.key === 'Enter') {
            onEnterGame();
        }
    };

    return (
        <div className="mobile-container">
            <div className="mobile-card">
                {logoUrl && <img className="login-logo" src={logoUrl} alt="" />}
                <h1 className="welcome-title">{welcomeText || '¿Listos para jugar?'}</h1>
                <p>Ingresa el nombre de tu equipo</p>
                
                <input 
                    className="mobile-input"
                    placeholder="Ej: Los Invencibles"
                    value={nameGroup} 
                    onChange={(e) => setNameGroup(e.target.value)}
                    onKeyDown={handleKeyDown}
                    autoFocus
                />
                
                <button className="btn-login" onClick={onEnterGame}> 
                    Unirse a la Partida 
                </button>
                
                <div className="status-footer">
                    Estado: <span className={isConnected ? 'status-connected' : 'status-disconnected'}>
                        {isConnected ? 'Conectado' : 'Desconectado'}
                    </span>
                </div>
            </div>
        </div>
    );
}

LoginScreen.propTypes = {
    nameGroup: PropTypes.string.isRequired,
    setNameGroup: PropTypes.func.isRequired,
    onEnterGame: PropTypes.func.isRequired,
    isConnected: PropTypes.bool.isRequired
};

export default LoginScreen;