"""Custom API exceptions for the catalog app."""

from rest_framework.exceptions import APIException


class SessionsHaveValidTickets(APIException):
    status_code = 409
    default_code = "SESSIONS_HAVE_VALID_TICKETS"
    default_detail = "One or more sessions still have valid tickets."

    def __init__(self, session_count=0, ticket_count=0, detail=None):
        super().__init__(detail=detail)
        self.session_count = session_count
        self.ticket_count = ticket_count
