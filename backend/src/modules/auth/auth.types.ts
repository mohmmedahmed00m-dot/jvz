export interface AccessPayload {
  sub: string;
  email: string;
  license_status: string;
  type: 'access';
  jti: string;
}

export interface RefreshPayload {
  sub: string;
  type: 'refresh';
  jti: string;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  license_status: string;
}
