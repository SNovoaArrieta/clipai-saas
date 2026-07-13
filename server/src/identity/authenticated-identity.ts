export interface AuthenticatedIdentity {
  readonly authSubject: string;
  readonly email?: string;
}
