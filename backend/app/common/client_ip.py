from fastapi import Request


def get_client_ip(request: Request) -> str | None:
    """Cloud Run sets X-Forwarded-For; use its leftmost client address only."""
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",", 1)[0].strip() or None
    return request.client.host if request.client else None
