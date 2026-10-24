export class MvpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}
