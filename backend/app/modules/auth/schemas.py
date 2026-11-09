from datetime import datetime
from uuid import UUID
from typing import Literal
import re

from pydantic import BaseModel, ConfigDict, EmailStr, SecretStr, Field, field_validator


class Credentials(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: EmailStr
    password: SecretStr

    @field_validator("email")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        if len(value) > 254:
            raise ValueError("Email demasiado largo")
        return value.casefold()

    @field_validator("password")
    @classmethod
    def password_length(cls, value: SecretStr) -> SecretStr:
        if not 12 <= len(value.get_secret_value()) <= 128:
            raise ValueError("La contraseña debe tener entre 12 y 128 caracteres")
        return value


class UserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    email_normalized: str
    created_at: datetime
    email_verified_at: datetime | None
    email_verification_required: bool
    display_name: str
    account_kind: Literal['individual', 'company']
    phone: str | None
    company_name: str | None
    pending_email: str | None
    avatar_url: str | None


class SessionResponse(BaseModel):
    user: UserResponse | None
    csrf_token: str


class EmailInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    email: EmailStr

    @field_validator("email")
    @classmethod
    def normalized(cls, value):
        if len(value) > 254:
            raise ValueError("Email demasiado largo")
        return value.casefold()


class ActionInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    token: SecretStr

    @field_validator("token")
    @classmethod
    def token_length(cls, value):
        if not 1 <= len(value.get_secret_value()) <= 256:
            raise ValueError("Enlace inválido o vencido")
        return value


class ResetPasswordInput(ActionInput):
    password: SecretStr
    validate_password = field_validator("password")(Credentials.password_length.__func__)


class ChangePasswordInput(BaseModel):
    model_config = ConfigDict(extra="forbid")
    current_password: SecretStr
    password: SecretStr
    validate_password = field_validator("password")(Credentials.password_length.__func__)
    validate_current = field_validator("current_password")(Credentials.password_length.__func__)


class AuthMessage(BaseModel):
    message: str


class EmailStatus(BaseModel):
    general_delivery_available: bool


class ProfileInput(BaseModel):
    model_config = ConfigDict(extra='forbid', str_strip_whitespace=True)
    display_name: str = Field(min_length=2, max_length=160)
    account_kind: Literal['individual', 'company']
    phone: str | None = Field(default=None, max_length=40)
    company_name: str | None = Field(default=None, max_length=200)

    @field_validator('phone')
    @classmethod
    def valid_phone(cls, value):
        if not value:
            return None
        value = re.sub(r'[\s().-]', '', value)
        if not re.fullmatch(r'\+?[1-9][0-9]{6,14}', value):
            raise ValueError('Ingresá un teléfono válido con código de área o país')
        return value


class ChangeEmailInput(EmailInput):
    current_password: SecretStr
    validate_current = field_validator('current_password')(Credentials.password_length.__func__)
