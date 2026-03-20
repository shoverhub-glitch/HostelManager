def validate_room_data(room_data):
    """Validate room data dict. Raises ValueError on invalid input."""
    if not room_data:
        raise ValueError("Room data cannot be empty")
    if not room_data.get("room_number"):
        raise ValueError("room_number is required")
    capacity = room_data.get("capacity")
    if capacity is not None and (not isinstance(capacity, int) or capacity < 1):
        raise ValueError("capacity must be a positive integer")
