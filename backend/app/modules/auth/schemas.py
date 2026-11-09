from datetime import datetime
from uuid import UUID

from pydantic import BaseModel, ConfigDict, EmailStr, SecretStr, field_validator


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
