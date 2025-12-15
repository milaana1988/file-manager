from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    gcp_project_id: str
    gcs_bucket: str
    firebase_project_id: str
    admin_emails: str = ""

    class Config:
        env_file = ".env"


settings = Settings()
