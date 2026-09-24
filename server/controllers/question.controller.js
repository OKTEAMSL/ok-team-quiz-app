const Question = require('../models/Questions.js')
const { sequelize } = require('../config/db');
const { findAllOrdered } = require('../utils/questionUtils');

// Funciones de validacion./ 

// Sanitiza un string eliminando caracteres peligrosos
function sanitizeString(str) {
    if (typeof str !== 'string') return '';
    
    // Eliminar scripts y tags HTML peligrosos.
    return str
        .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
        .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
        .replace(/<object\b[^<]*(?:(?!<\/object>)<[^<]*)*<\/object>/gi, '')
        .replace(/<embed\b[^<]*>/gi, '')
        .trim();
}

// Valida que URL sea valida.
function isValidUrl(string) {
    if (!string) return false;
    try {
        const url = new URL(string);
        return url.protocol === 'http:' || url.protocol === 'https:';
    } catch (_) {
        return false;
    }
}

// Valida los datos de una pregunta.
function validateQuestionData(data) {
    const errors = [];
    
    // Validar title
    if (!data.title || typeof data.title !== 'string') {
        errors.push('El título es obligatorio');
    } else {
        const sanitizedTitle = sanitizeString(data.title);
        
        if (sanitizedTitle.length < 5) {
            errors.push('El título debe tener al menos 5 caracteres');
        }
        
        if (sanitizedTitle.length > 500) {
            errors.push('El título no puede superar 500 caracteres');
        }
        
        // Actualizar con versión sanitizada
        data.title = sanitizedTitle;
    }
    
    // Validar type
    const validTypes = ['TEXT', 'IMAGE', 'VIDEO'];
    if (!data.type) {
        data.type = 'TEXT'; // Default
    } else if (!validTypes.includes(data.type)) {
        errors.push('El tipo debe ser TEXT, IMAGE o VIDEO');
    }
    
    // Validar options
    if (!data.options) {
        errors.push('Las opciones son obligatorias');
    } else if (!Array.isArray(data.options)) {
        errors.push('Las opciones deben ser un array');
    } else {
        // Validar cantidad
        if (data.options.length < 2) {
            errors.push('Debe haber al menos 2 opciones');
        }
        
        if (data.options.length > 6) {
            errors.push('No puede haber más de 6 opciones');
        }
        
        // Validar cada opción
        const sanitizedOptions = [];
        data.options.forEach((opt, index) => {
            if (typeof opt !== 'string') {
                errors.push(`La opción ${index + 1} debe ser texto`);
            } else {
                const sanitized = sanitizeString(opt);
                
                if (!sanitized || sanitized.trim() === '') {
                    errors.push(`La opción ${index + 1} no puede estar vacía`);
                }
                
                if (sanitized.length > 200) {
                    errors.push(`La opción ${index + 1} no puede superar 200 caracteres`);
                }
                
                sanitizedOptions.push(sanitized);
            }
        });
        
        // Actualizar con versión sanitizada
        data.options = sanitizedOptions;
    }
    
    // Validar respuestas correctas (1 o más).
    // Acepta correctIndexes (array) y, por compatibilidad, correctIndex (número).
    let rawCorrect = data.correctIndexes;
    if (rawCorrect === undefined || rawCorrect === null) {
        rawCorrect = (data.correctIndex !== undefined && data.correctIndex !== null)
            ? [data.correctIndex]
            : [];
    }

    if (!Array.isArray(rawCorrect) || rawCorrect.length === 0) {
        errors.push('Debe indicar cuál es la respuesta correcta');
        data.correctIndexes = [];
    } else {
        const optionCount = Array.isArray(data.options) ? data.options.length : 0;
        const parsed = rawCorrect.map((v) => Number(v));

        if (parsed.some((n) => !Number.isInteger(n))) {
            errors.push('Los índices de respuesta correcta deben ser números enteros');
        } else if (parsed.some((n) => n < 0)) {
            errors.push('El índice de respuesta correcta no puede ser negativo');
        } else if (optionCount && parsed.some((n) => n >= optionCount)) {
            errors.push(`Hay un índice de respuesta correcta fuera de rango. Hay ${optionCount} opciones.`);
        } else {
            // Sin repetidos y ordenados
            const unique = [...new Set(parsed)].sort((a, b) => a - b);

            if (optionCount && unique.length >= optionCount) {
                errors.push('Debe quedar al menos una opción incorrecta');
            }

            data.correctIndexes = unique;
        }
    }

    // correctIndex = primera respuesta correcta (compatibilidad con código/datos antiguos)
    data.correctIndex = Array.isArray(data.correctIndexes) && data.correctIndexes.length > 0
        ? data.correctIndexes[0]
        : 0;

    // Validar tiempo límite (5 a 120 segundos). Se valida aquí para responder 400
    // con un mensaje claro en lugar de un error 500 del modelo.
    if (data.timeLimit === undefined || data.timeLimit === null || data.timeLimit === '') {
        data.timeLimit = 10;
    } else {
        const seconds = Number(data.timeLimit);
        if (!Number.isInteger(seconds) || seconds < 5 || seconds > 120) {
            errors.push('El tiempo límite debe ser un número entero entre 5 y 120 segundos');
        } else {
            data.timeLimit = seconds;
        }
    }
    
    // Validar MediaURL
    if (data.type === 'IMAGE' || data.type === 'VIDEO') {
        if (!data.mediaUrl) {
            errors.push(`Debe proporcionar una URL para el tipo ${data.type}`);
        } else if (!isValidUrl(data.mediaUrl)) {
            errors.push('La URL del archivo multimedia no es válida');
        }
    } else {
        // Si es TEXT, limpiar mediaUrl
        data.mediaUrl = null;
    }
    
    // Solo se devuelven los campos permitidos. Así nadie puede cambiar 'position', 'id'
    // o fechas desde el body, y editar una pregunta nunca altera su lugar en el orden.
    const { title, type, options, mediaUrl, correctIndex, correctIndexes, timeLimit } = data;

    return {
        isValid: errors.length === 0,
        errors: errors,
        data: { title, type, options, mediaUrl, correctIndex, correctIndexes, timeLimit }
    };
}

exports.getQuestion = async(req, res) => {
 try{
    const question = await findAllOrdered();
    return res.status(200).json(question);
 }catch(error){
    console.error('Error al obtener preguntas:', error);
    return res.status(500).json({ message: 'Error al obtener preguntas' });
 }
}

exports.createQuestion = async(req, res) => {
   try{
      const validation = validateQuestionData(req.body);
      
      if(!validation.isValid){
         return res.status(400).json({
            message: 'Datos invalidos',
            errors: validation.errors
         });
      }

      // La nueva pregunta va al final de la lista
      const lastPosition = await Question.max('position');
      const newQuestion = await Question.create({
         ...validation.data,
         position: (lastPosition || 0) + 1
      });
      return res.status(201).json(newQuestion)
      
   }catch(error){
      console.error('Error al crear pregunta:', error)
      return res.status(500).json({ message: 'Error al crear preguntas' });
   }  
}

exports.updateQuestion = async(req, res) => {
   try{
      const { id } = req.params;

      const question = await Question.findByPk(id);
      if (!question) {
         return res.status(404).json({ error: 'Pregunta no encontrada' });
      }

      const validation = validateQuestionData(req.body);

      if(!validation.isValid) {
         return res.status(400).json({
            message: 'Datos invalidos',
            errors: validation.errors
         });
      }

      await question.update(validation.data);

      res.status(200).json(question);

   } catch (error){
      console.error('Error al actualizar pregunta:', error);
      return res.status(500).json({ message: 'Error al actualizar pregunta' });
   }  
}

exports.deleteQuestion = async(req, res) => {
  try{
      const { id } = req.params

      if(!id){
         return res.status(400).json({
            message: 'ID no proporcionado.'
         })
      }

      const question = await Question.findByPk(id);

      if(!question){
         return res.status(404).json({
            message: 'Pregunta no encontrada.'
         })
      }

      await question.destroy();

      res.status(204).end();
   }catch(error){
      console.error('Error al borrar pregunta:', error)
      return res.status(500).json({ message: 'Error al borrar pregunta' });
   }  
}

// PUT /api/questions/reorder
// Body: { ids: [id1, id2, ...] } -> lista COMPLETA de preguntas en el nuevo orden.
exports.reorderQuestions = async(req, res) => {
   try{
      const { ids } = req.body || {};

      if (!Array.isArray(ids) || ids.length === 0 || ids.some((id) => typeof id !== 'string')) {
         return res.status(400).json({ message: 'Se requiere la lista completa de IDs en el nuevo orden' });
      }

      if (new Set(ids).size !== ids.length) {
         return res.status(400).json({ message: 'La lista contiene IDs repetidos' });
      }

      // La lista debe coincidir exactamente con las preguntas existentes. Si alguien
      // añadió/borró una pregunta mientras tanto, se pide recargar en vez de guardar
      // un orden incompleto.
      const existing = await Question.findAll({ attributes: ['id'] });
      const existingIds = new Set(existing.map((q) => q.id));

      if (existingIds.size !== ids.length || ids.some((id) => !existingIds.has(id))) {
         return res.status(409).json({
            message: 'La lista de preguntas cambió. Recarga la página e inténtalo de nuevo.'
         });
      }

      await sequelize.transaction(async (transaction) => {
         for (let i = 0; i < ids.length; i++) {
            await Question.update(
               { position: i + 1 },
               { where: { id: ids[i] }, transaction, silent: true }
            );
         }
      });

      const ordered = await findAllOrdered();
      return res.status(200).json(ordered);

   }catch(error){
      console.error('Error al reordenar preguntas:', error);
      return res.status(500).json({ message: 'Error al reordenar preguntas' });
   }
}
