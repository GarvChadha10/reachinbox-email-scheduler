export class AppError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const badRequest = (message: string, details?: unknown) => new AppError(400, 'BAD_REQUEST', message, details);
export const unauthorized = (message = 'Authentication required') => new AppError(401, 'UNAUTHORIZED', message);
export const notFound = (message = 'Not found') => new AppError(404, 'NOT_FOUND', message);
export const notConfigured = (what: string) =>
  new AppError(503, 'NOT_CONFIGURED', `${what} is not configured on the server. See .env.example.`);
