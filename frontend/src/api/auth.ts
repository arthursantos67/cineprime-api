import { apiRequest } from "./client";

export type LoginCredentials = {
  email: string;
  password: string;
};

export type LoginResponse = {
  access: string;
  refresh: string;
};

export type RegisterPayload = {
  email: string;
  password: string;
  username: string;
};

export type RegisterResponse = {
  created_at: string;
  email: string;
  id: string;
  username: string;
};

export type CurrentUserResponse = {
  created_at: string;
  email: string;
  id: string;
  is_staff: boolean;
  is_verified: boolean;
  role: "user" | "staff" | "master";
  username: string;
};

export type RefreshAccessResponse = {
  access: string;
};

export type PasswordResetRequestPayload = {
  email: string;
};

export type PasswordResetRequestResponse = {
  detail: string;
};

export type PasswordResetConfirmPayload = {
  newPassword: string;
  token: string;
  uid: string;
};

export type EmailVerificationResponse = {
  already_verified: boolean;
  verified: boolean;
};

export const authApi = {
  login(credentials: LoginCredentials) {
    return apiRequest<LoginResponse>("/api/v1/auth/login/", {
      auth: "none",
      json: credentials,
      method: "POST",
    });
  },

  register(payload: RegisterPayload) {
    return apiRequest<RegisterResponse>("/api/v1/auth/register/", {
      auth: "none",
      json: payload,
      method: "POST",
    });
  },

  currentUser(accessToken?: string) {
    return apiRequest<CurrentUserResponse>("/api/v1/users/me/", {
      auth: accessToken ? "none" : "required",
      token: accessToken,
    });
  },

  refreshAccess(refreshToken: string) {
    return apiRequest<RefreshAccessResponse>("/api/v1/auth/token/refresh/", {
      auth: "none",
      json: { refresh: refreshToken },
      method: "POST",
    });
  },

  requestPasswordReset(payload: PasswordResetRequestPayload) {
    return apiRequest<PasswordResetRequestResponse>("/api/v1/auth/password-reset/", {
      auth: "none",
      json: payload,
      method: "POST",
    });
  },

  confirmPasswordReset({ newPassword, token, uid }: PasswordResetConfirmPayload) {
    return apiRequest<PasswordResetRequestResponse>("/api/v1/auth/password-reset/confirm/", {
      auth: "none",
      json: { new_password: newPassword, token, uid },
      method: "POST",
    });
  },

  verifyEmail(token: string) {
    return apiRequest<EmailVerificationResponse>(
      `/api/v1/auth/verify-email/${encodeURIComponent(token)}/`,
      { auth: "none" }
    );
  },

  resendVerificationEmail() {
    return apiRequest<EmailVerificationResponse>("/api/v1/auth/verify-email/resend/", {
      auth: "required",
      method: "POST",
    });
  },
};
