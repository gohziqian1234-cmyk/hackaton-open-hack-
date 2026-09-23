/** A rule violation with an HTTP status. Routes turn it into `{ error: code }`. */
export class DomainError extends Error {
  constructor(
    public code: string,
    public status = 409,
  ) {
    super(code);
  }
}
