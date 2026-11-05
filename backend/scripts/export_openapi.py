"""Exporta el contrato HTTP sin conectar a PostgreSQL ni imprimir configuración."""
import json

from app.main import app

print(json.dumps(app.openapi(), indent=2))
