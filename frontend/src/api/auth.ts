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

export type UpdateProfilePayload = {
  // Required by the API when changing the email (re-authentication).
  currentPassword?: string;
  email?: string;
  username?: string;
};

export type UpdateProfileResponse = CurrentUserResponse & {
  email_change_requested: boolean;
};

export type ChangePasswordPayload = {
  currentPassword: string;
  newPassword: string;
};

export type ChangePasswordResponse = {
  // Fresh token pair: changing the password invalidates all previous tokens.
  access: string;
  detail: string;
  refresh: string;
};

export type ConfirmEmailChangeResponse = {
  changed: boolean;
  email: string;
};

export type DeleteAccountPayload = {
  confirm?: boolean;
  password: string;
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

  updateProfile({ currentPassword, email, username }: UpdateProfilePayload) {
    return apiRequest<UpdateProfileResponse>("/api/v1/users/me/", {
      auth: "required",
      json: {
        ...(username !== undefined ? { username } : {}),
        ...(email !== undefined ? { email } : {}),
        ...(currentPassword !== undefined
          ? { current_password: currentPassword }
          : {}),
      },
      method: "PATCH",
    });
  },

  changePassword({ currentPassword, newPassword }: ChangePasswordPayload) {
    return apiRequest<ChangePasswordResponse>("/api/v1/users/me/change-password/", {
      auth: "required",
      json: { current_password: currentPassword, new_password: newPassword },
      method: "POST",
    });
  },

  confirmEmailChange(token: string) {
    // POST so email link scanners prefetching the URL cannot apply the change.
    return apiRequest<ConfirmEmailChangeResponse>("/api/v1/auth/change-email/", {
      auth: "none",
      json: { token },
      method: "POST",
    });
  },

  deleteAccount({ confirm = false, password }: DeleteAccountPayload) {
    const path = confirm ? "/api/v1/users/me/?confirm=true" : "/api/v1/users/me/";
    return apiRequest<void>(path, {
      auth: "required",
      json: { password },
      method: "DELETE",
    });
  },
};
