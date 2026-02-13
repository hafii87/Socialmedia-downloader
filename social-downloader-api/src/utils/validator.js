const { z } = require('zod');
const logger = require('../Logger/logger');  

// Define URL validation schema
const urlSchema = z.object({
  url: z.string()
    .trim()
    .url('Must be a valid URL')
    .min(10, 'URL is too short')
});

/**
 * Middleware to validate request body against schema
 * @param {ZodSchema} schema - Zod schema to validate against
 */
const validate = (schema) => {
  return (req, res, next) => {
    try {
      const validatedData = schema.parse(req.body);
      req.validatedData = validatedData;
      next();
    } catch (error) {
      logger.warn(`Validation error: ${error.message}`);
      
      return res.status(400).json({
        success: false,
        error: 'Validation failed',
        details: error.errors.map(e => ({
          field: e.path.join('.'),
          message: e.message
        }))
      });
    }
  };
};

/**
 * Middleware specifically for URL validation
 */
const validateUrl = validate(urlSchema);

module.exports = {
  validate,
  validateUrl,
  urlSchema
};
