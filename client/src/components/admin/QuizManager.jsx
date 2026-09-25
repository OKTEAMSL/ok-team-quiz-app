import { useState } from 'react';
import PropTypes from 'prop-types';
import { fileToLogoDataUrl } from '../../utils/imageResize';
import { ensureReadableOnWhite, willBeAdjusted } from '../../utils/color';
import '../../styles/QuizManager.css';

const DEFAULT_COLOR = '#009fe3';   // azul de OK Team

const PRESET_COLORS = [
    '#009fe3', '#1d4ed8', '#7c3aed', '#db2777',
    '#dc2626', '#ea580c', '#16a34a', '#0f766e', '#334155'
];

// Gestión de cuestionarios (un cuestionario por cliente/evento) y de su imagen de marca.
const QuizManager = ({ quizzes, selectedQuizId, onSelect, onChanged, fetchWithAuth, apiUrl }) => {
    const [busy, setBusy] = useState(false);

    // Editor de marca
    const [editing, setEditing] = useState(null);   // { id, isActive } mientras el modal está abierto
    const [name, setName] = useState('');
    const [welcomeText, setWelcomeText] = useState('');
    const [color, setColor] = useState('');          // '' = azul de OK Team
    const [logo, setLogo] = useState(null);          // data URL (o null)
    const [logoError, setLogoError] = useState('');
    const [saving, setSaving] = useState(false);

    // Llamada a la API que avisa si la sesión caducó
    const request = async (path, options = {}) => {
        const response = await fetchWithAuth(`${apiUrl}${path}`, options);

        if (response.status === 401 || response.status === 403) {
            alert('⛔ Sesión expirada');
            localStorage.removeItem('admin_token');
            window.location.reload();
            throw new Error('Sesión expirada');
        }

        return response;
    };

    const readError = async (response, fallback) => {
        try {
            const data = await response.json();
            return data.message || data.errors?.join('\n') || fallback;
        } catch {
            return fallback;
        }
    };

    const run = async (action) => {
        setBusy(true);
        try {
            await action();
        } catch (error) {
            if (error.message !== 'Sesión expirada') {
                console.error(error);
                alert('No se pudo conectar con el servidor.');
            }
        } finally {
            setBusy(false);
        }
    };

    // ---------- Acciones ----------
    const handleCreate = () => {
        const input = window.prompt('Nombre del nuevo cuestionario (por ejemplo, el del cliente):');
        if (!input || !input.trim()) return;

        run(async () => {
            const response = await request('/api/quizzes', {
                method: 'POST',
                body: JSON.stringify({ name: input.trim() })
            });

            if (!response.ok) {
                alert(await readError(response, 'No se pudo crear el cuestionario.'));
                return;
            }

            const created = await response.json();
            await onChanged(created.id);
        });
    };

    const handleActivate = (quiz) => {
        run(async () => {
            const response = await request(`/api/quizzes/${quiz.id}/activate`, { method: 'POST' });

            if (!response.ok) {
                alert(await readError(response, 'No se pudo activar el cuestionario.'));
                return;
            }

            await onChanged();
        });
    };

    const handleDuplicate = (quiz) => {
        run(async () => {
            const response = await request(`/api/quizzes/${quiz.id}/duplicate`, { method: 'POST' });

            if (!response.ok) {
                alert(await readError(response, 'No se pudo duplicar el cuestionario.'));
                return;
            }

            const copy = await response.json();
            await onChanged(copy.id);
        });
    };

    const handleDelete = (quiz) => {
        const message = `¿Borrar el cuestionario "${quiz.name}" y sus ${quiz.questionCount} pregunta${quiz.questionCount === 1 ? '' : 's'}?\n\nEsta acción no se puede deshacer.`;
        if (!window.confirm(message)) return;

        run(async () => {
            const response = await request(`/api/quizzes/${quiz.id}`, { method: 'DELETE' });

            if (!response.ok) {
                alert(await readError(response, 'No se pudo borrar el cuestionario.'));
                return;
            }

            await onChanged();
        });
    };

    // ---------- Editor de marca ----------
    const openEditor = (quiz) => {
        run(async () => {
            // Se pide completo (la lista no trae el logo porque pesa)
            const response = await request(`/api/quizzes/${quiz.id}`);

            if (!response.ok) {
                alert(await readError(response, 'No se pudo cargar el cuestionario.'));
                return;
            }

            const full = await response.json();
            setName(full.name || '');
            setWelcomeText(full.welcomeText || '');
            setColor(full.primaryColor || '');
            setLogo(full.logo || null);
            setLogoError('');
            setEditing({ id: full.id, isActive: full.isActive });
        });
    };

    const closeEditor = () => {
        setEditing(null);
        setLogoError('');
    };

    const handleLogoFile = async (event) => {
        const file = event.target.files?.[0];
        event.target.value = '';   // permite volver a elegir el mismo archivo
        if (!file) return;

        try {
            setLogo(await fileToLogoDataUrl(file));
            setLogoError('');
        } catch (error) {
            setLogoError(error.message);
        }
    };

    const handleSave = async () => {
        if (!name.trim()) {
            alert('El nombre no puede estar vacío');
            return;
        }

        setSaving(true);
        try {
            const response = await request(`/api/quizzes/${editing.id}`, {
                method: 'PUT',
                body: JSON.stringify({
                    name: name.trim(),
                    welcomeText: welcomeText.trim() || null,
                    primaryColor: color || null,
                    logo: logo || null
                })
            });

            if (!response.ok) {
                alert(await readError(response, 'No se pudo guardar.'));
                return;
            }

            closeEditor();
            await onChanged();
        } catch (error) {
            if (error.message !== 'Sesión expirada') {
                console.error(error);
                alert('No se pudo conectar con el servidor.');
            }
        } finally {
            setSaving(false);
        }
    };

    const previewColor = ensureReadableOnWhite(color || DEFAULT_COLOR);

    return (
        <div className="quiz-manager">
            <div className="quiz-manager-header">
                <h2 className="section-title">Cuestionarios</h2>
                <button className="btn-quiz-new" onClick={handleCreate} disabled={busy}>
                    ＋ Nuevo cuestionario
                </button>
            </div>
            <p className="input-hint quiz-manager-hint">
                Un cuestionario por cliente o evento, cada uno con sus preguntas y su imagen de marca.
                El marcado como <strong>EN USO</strong> es el que se juega.
            </p>

            <div className="quiz-list">
                {quizzes.map((quiz) => (
                    <div
                        key={quiz.id}
                        className={`quiz-card ${quiz.id === selectedQuizId ? 'selected' : ''}`}
                    >
                        <button
                            className="quiz-card-main"
                            onClick={() => onSelect(quiz.id)}
                            title="Ver y editar las preguntas de este cuestionario"
                        >
                            <span className="quiz-name">{quiz.name}</span>
                            <span className="quiz-meta">
                                {quiz.questionCount} pregunta{quiz.questionCount === 1 ? '' : 's'}
                                {quiz.hasLogo ? ' · con logo' : ''}
                                {quiz.primaryColor && (
                                    <span className="quiz-color-dot" style={{ background: quiz.primaryColor }}></span>
                                )}
                            </span>
                        </button>

                        <div className="quiz-badges">
                            {quiz.isActive && <span className="quiz-badge in-use">EN USO</span>}
                            {quiz.id === selectedQuizId && <span className="quiz-badge editing">Editando</span>}
                        </div>

                        <div className="quiz-actions">
                            {!quiz.isActive && (
                                <button className="btn-quiz use" onClick={() => handleActivate(quiz)} disabled={busy}>
                                    Usar en el evento
                                </button>
                            )}
                            <button className="btn-quiz" onClick={() => openEditor(quiz)} disabled={busy}>
                                Marca
                            </button>
                            <button className="btn-quiz" onClick={() => handleDuplicate(quiz)} disabled={busy}>
                                Duplicar
                            </button>
                            <button
                                className="btn-quiz danger"
                                onClick={() => handleDelete(quiz)}
                                disabled={busy || quiz.isActive || quizzes.length <= 1}
                                title={quiz.isActive ? 'Está en uso: activa otro antes de borrarlo' : 'Borrar cuestionario'}
                            >
                                🗑️
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {editing && (
                <div className="modal-overlay" onClick={closeEditor}>
                    <div className="modal-content branding-modal" onClick={(e) => e.stopPropagation()}>
                        <div className="modal-header">
                            <h2>Marca del cliente</h2>
                            <button className="modal-close" onClick={closeEditor}>✕</button>
                        </div>

                        <div className="modal-body branding-body">
                            <div className="branding-form">
                                <label className="form-label">Nombre del cuestionario (solo lo ves tú):</label>
                                <input
                                    className="form-input"
                                    type="text"
                                    maxLength={80}
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                />

                                <label className="form-label branding-label">Texto de bienvenida:</label>
                                <input
                                    className="form-input"
                                    type="text"
                                    maxLength={60}
                                    placeholder="Ej: ¡Bienvenidos al Quiz del Colegio San José!"
                                    value={welcomeText}
                                    onChange={(e) => setWelcomeText(e.target.value)}
                                />
                                <p className="input-hint">Se ve en la pantalla de entrada del móvil y en el título de la pantalla principal.</p>

                                <label className="form-label branding-label">Color principal:</label>
                                <div className="color-row">
                                    <input
                                        className="color-picker"
                                        type="color"
                                        value={color || DEFAULT_COLOR}
                                        onChange={(e) => setColor(e.target.value)}
                                        aria-label="Elegir color"
                                    />
                                    <div className="color-presets">
                                        {PRESET_COLORS.map((preset) => (
                                            <button
                                                key={preset}
                                                className={`color-swatch ${color.toLowerCase() === preset ? 'chosen' : ''}`}
                                                style={{ background: preset }}
                                                onClick={() => setColor(preset)}
                                                aria-label={`Color ${preset}`}
                                            />
                                        ))}
                                    </div>
                                    {color && (
                                        <button className="btn-link" onClick={() => setColor('')}>
                                            Usar el azul de OK Team
                                        </button>
                                    )}
                                </div>
                                {color && willBeAdjusted(color) && (
                                    <p className="branding-warning">
                                        Este color es muy claro: se oscurecerá un poco para que los textos blancos se lean bien.
                                    </p>
                                )}

                                <label className="form-label branding-label">Logo:</label>
                                <div className="logo-row">
                                    <label className="btn-quiz logo-upload">
                                        {logo ? 'Cambiar logo' : 'Subir logo'}
                                        <input type="file" accept="image/*" onChange={handleLogoFile} hidden />
                                    </label>
                                    {logo && (
                                        <button className="btn-link" onClick={() => setLogo(null)}>Quitar logo</button>
                                    )}
                                </div>
                                {logoError && <p className="branding-error">{logoError}</p>}
                                <p className="input-hint">PNG, JPG, WEBP, GIF o SVG. Se reduce solo; mejor con fondo transparente.</p>
                            </div>

                            <div className="branding-preview">
                                <p className="form-label">Así se verá en el móvil:</p>
                                <div className="phone-preview">
                                    <div className="phone-preview-header">
                                        <span className="phone-preview-team">
                                            {logo && <img src={logo} alt="" />}
                                            Equipo
                                        </span>
                                        <span className="phone-preview-score" style={{ background: previewColor }}>120</span>
                                    </div>
                                    <div className="phone-preview-body">
                                        {logo && <img className="phone-preview-logo" src={logo} alt="" />}
                                        <h3 style={{ color: previewColor }}>{welcomeText || '¿Listos para jugar?'}</h3>
                                        <div className="phone-preview-input">Nombre del equipo</div>
                                        <div className="phone-preview-button" style={{ background: previewColor }}>Unirse a la Partida</div>
                                    </div>
                                </div>
                                {editing.isActive
                                    ? <p className="input-hint">Este cuestionario está EN USO: al guardar, los móviles conectados se actualizan al momento.</p>
                                    : <p className="input-hint">Este cuestionario no está en uso todavía. La marca se verá cuando lo actives.</p>}
                            </div>
                        </div>

                        <div className="branding-footer">
                            <button className="btn-cancel" onClick={closeEditor}>Cancelar</button>
                            <button className="btn-save" onClick={handleSave} disabled={saving}>
                                {saving ? 'Guardando…' : 'Guardar'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

QuizManager.propTypes = {
    quizzes: PropTypes.arrayOf(PropTypes.shape({
        id: PropTypes.string.isRequired,
        name: PropTypes.string.isRequired,
        isActive: PropTypes.bool,
        questionCount: PropTypes.number,
        hasLogo: PropTypes.bool,
        primaryColor: PropTypes.string
    })).isRequired,
    selectedQuizId: PropTypes.string,
    onSelect: PropTypes.func.isRequired,
    onChanged: PropTypes.func.isRequired,
    fetchWithAuth: PropTypes.func.isRequired,
    apiUrl: PropTypes.string.isRequired
};

export default QuizManager;
