from django.utils import timezone


def build_ticket_confirmation_email(*, user, tickets):
    sorted_tickets = sorted(
        tickets,
        key=lambda ticket: (
            ticket.session_seat.session.start_time,
            ticket.session_seat.seat.row.name,
            ticket.session_seat.seat.number,
        ),
    )

    header_lines = [
        f"Hello {user.username},",
        "",
        "Your checkout was completed successfully. Here are your tickets:",
        "",
    ]

    ticket_lines = []
    for index, ticket in enumerate(sorted_tickets, start=1):
        session = ticket.session_seat.session
        start_time = timezone.localtime(session.start_time)
        seat = ticket.session_seat.seat

        ticket_lines.extend(
            [
                f"Ticket {index}",
                f"Movie: {session.movie.title}",
                f"Session: {start_time.strftime('%Y-%m-%d %H:%M %Z')}",
                f"Room: {session.room.name}",
                f"Seat: {seat.row.name}{seat.number}",
                f"Ticket code: {ticket.ticket_code}",
                "",
            ]
        )

    footer_lines = [
        "Present the ticket codes at entry.",
        "",
        "Thank you for choosing Cineprime Natal.",
    ]

    subject = f"Ticket confirmation - {len(sorted_tickets)} ticket(s)"
    body = "\n".join(header_lines + ticket_lines + footer_lines)

    return {
        "subject": subject,
        "body": body,
    }
