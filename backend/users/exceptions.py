"""Custom API exceptions for the users app.

Kept in a neutral module so serializers can raise them without importing
views (which import serializers, creating a cycle).
"""

from rest_framework.exceptions import APIException


class HasActiveTickets(APIException):
    status_code = 409
    default_code = "HAS_ACTIVE_TICKETS"
    default_detail = "User has active tickets."

    def __init__(self, ticket_count=0):
        super().__init__()
        self.ticket_count = ticket_count


class OnlyMasterAdmin(APIException):
    status_code = 400
    default_code = "ONLY_MASTER_ADMIN"
    default_detail = "You are the only master admin. Promote another user to master before deleting your account."


class ProtectedTransferRequired(APIException):
    status_code = 400
    default_code = "PROTECTED_TRANSFER_REQUIRED"
    default_detail = "You are the protected master. Designate a successor master before deleting your account."


class WrongPassword(APIException):
    status_code = 400
    default_code = "WRONG_PASSWORD"
    default_detail = "Incorrect password."


class InvalidVerificationToken(APIException):
    status_code = 400
    default_code = "INVALID_VERIFICATION_TOKEN"
    default_detail = "Invalid or expired verification link."


class InvalidPasswordResetToken(APIException):
    status_code = 400
    default_code = "INVALID_RESET_TOKEN"
    default_detail = "Invalid or expired password reset link."


class InvalidEmailChangeToken(APIException):
    status_code = 400
    default_code = "INVALID_EMAIL_CHANGE_TOKEN"
    default_detail = "Invalid or expired email change confirmation link."
