import re
import unicodedata
from datetime import datetime
from typing import Annotated, Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

Attendance = Literal["attending", "not_attending", "maybe"]
Relationship = Literal["family", "friend", "parents_friend", "other"]
PartyCount = Annotated[int, Field(strict=True, ge=0, le=20)]


class RsvpCreate(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)

    name: str = Field(min_length=2, max_length=100)
    relationship: Relationship
    contact_number: str = Field(max_length=32)
    attendance: Attendance
    adults: PartyCount
    kids: PartyCount
    message: str = Field(default="", max_length=200)

    @field_validator("name", "message", mode="before")
    @classmethod
    def clean_text(cls, value, info):
        if not isinstance(value, str):
            return value
        value = value.strip()
        allowed = {"\n", "\r", "\t"} if info.field_name == "message" else set()
        if any(unicodedata.category(char) == "Cc" and char not in allowed for char in value):
            raise ValueError("Remove control characters from this field.")
        if info.field_name == "name":
            value = " ".join(value.split())
        return value

    @field_validator("contact_number")
    @classmethod
    def normalize_phone(cls, value):
        phone = re.sub(r"[\s().-]", "", value)
        if re.fullmatch(r"09[0-9]{9}", phone):
            return "+63" + phone[1:]
        if re.fullmatch(r"\+?639[0-9]{9}", phone):
            return "+" + phone.lstrip("+")
        raise ValueError("Enter a Philippine mobile number, such as 0917 123 4567.")

    @model_validator(mode="after")
    def validate_party(self):
        if self.attendance == "not_attending":
            self.adults = 0
            self.kids = 0
        if self.attendance == "attending" and self.adults + self.kids == 0:
            raise ValueError("Add at least one adult or child to your party.")
        return self


class RsvpResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    name: str
    attendance: Attendance
    adults: int
    kids: int
    message: str
    created_at: datetime
