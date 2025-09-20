# settings.py

from pydantic import BaseSettings

class Settings(BaseSettings):
    supabase_url: str
    supabase_key: str
    database_url: str

    class Config:
        env_file = ".env"

# This is the instance you import elsewhere in your app
settings = Settings()
