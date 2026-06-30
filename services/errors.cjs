class AppError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = 'AppError';
    this.code = options.code || 'APP_ERROR';
    this.userMessage = options.userMessage || message;
    this.details = options.details || null;
    this.cause = options.cause || null;
  }
}

class InputValidationError extends AppError {
  constructor(message, options = {}) {
    super(message, {
      code: 'INPUT_VALIDATION_ERROR',
      userMessage: `Dato inválido: ${message}`,
      ...options
    });
    this.name = 'InputValidationError';
  }
}

class ApiError extends AppError {
  constructor(message, options = {}) {
    super(message, {
      code: 'API_ERROR',
      userMessage: `Error de servidor: ${message}`,
      ...options
    });
    this.name = 'ApiError';
  }
}

class FileSystemError extends AppError {
  constructor(message, options = {}) {
    super(message, {
      code: 'FILE_SYSTEM_ERROR',
      userMessage: `Error de archivo: ${message}`,
      ...options
    });
    this.name = 'FileSystemError';
  }
}

class OptimizationError extends AppError {
  constructor(message, options = {}) {
    super(message, {
      code: 'OPTIMIZATION_ERROR',
      userMessage: `Error de optimización: ${message}`,
      ...options
    });
    this.name = 'OptimizationError';
  }
}

module.exports = { AppError, InputValidationError, ApiError, FileSystemError, OptimizationError };
