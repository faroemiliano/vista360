from contextlib import asynccontextmanager
import asyncio

from fastapi import FastAPI, HTTPException, Request
from fastapi.exceptions import RequestValidationError
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse, JSONResponse
from fastapi.staticfiles import StaticFiles

from app.core.config import get_settings
from app.db.session import create_db_engine, create_session_factory
from app.modules.auth.router import router as auth_router
from app.modules.auth.security import AuthThrottle
from app.modules.tours.router import router as tour_router
from app.modules.scenes.router import router as scene_router
from app.modules.assets.router import router as asset_router
from app.modules.hotspots.router import router as hotspot_router
from app.modules.publications.router import router as publication_router
from app.modules.organizations.router import router as organization_router
from app.modules.properties.router import router as property_router
from app.modules.studio.router import router as studio_router
from app.modules.workspaces.router import router as workspace_router
from app.modules.platform.router import router as platform_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    engine = create_db_engine(get_settings())
    app.state.session_factory = create_session_factory(engine)
    app.state.auth_throttle = AuthThrottle()
    app.state.avatar_slot = asyncio.Semaphore(1)
    app.state.service_throttle = AuthThrottle(limit=5)
    try:
        yield
    finally:
        engine.dispose()


def create_app() -> FastAPI:
    settings = get_settings()
    app = FastAPI(title=settings.app_name, version="0.1.0", lifespan=lifespan)
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.cors_origins,
        allow_credentials=True,
        allow_methods=["GET", "POST", "PUT", "DELETE"],
        allow_headers=["Content-Type", "X-CSRF-Token"],
    )
    app.include_router(auth_router, prefix="/api/v1")
    app.include_router(tour_router, prefix="/api/v1")
    app.include_router(scene_router, prefix="/api/v1")
    app.include_router(asset_router, prefix="/api/v1")
    app.include_router(hotspot_router, prefix="/api/v1")
    app.include_router(publication_router, prefix="/api/v1")
    app.include_router(organization_router, prefix="/api/v1")
    app.include_router(property_router, prefix="/api/v1")
    app.include_router(studio_router, prefix="/api/v1")
    app.include_router(workspace_router, prefix="/api/v1")
    app.include_router(platform_router, prefix="/api/v1")

    @app.exception_handler(RequestValidationError)
    async def validation_error(request: Request, error: RequestValidationError):
        return JSONResponse(status_code=422, content={"detail": [
            {"loc": item["loc"], "msg": item["msg"], "type": item["type"]}
            for item in error.errors()
        ]})

    @app.middleware("http")
    async def private_responses(request: Request, call_next):
        response = await call_next(request)
        if request.url.path.startswith("/api/v1/") and not (
            request.url.path.startswith("/api/v1/public/") and response.status_code in (200, 304)
        ):
            response.headers["Cache-Control"] = "no-store"
        return response

    @app.get("/health", tags=["health"])
    def health() -> dict[str, str]:
        return {"status": "ok"}

    # En el contenedor, frontend y API comparten origen HTTPS y cookies.
    # El desarrollo con Vite sigue funcionando sin esta variable.
    if settings.frontend_dist_dir is not None:
        frontend = settings.frontend_dist_dir.resolve()
        if not (frontend / "index.html").is_file() or not (frontend / "assets").is_dir():
            raise RuntimeError("FRONTEND_DIST_DIR debe contener el build de Vite")
        app.mount('/assets', StaticFiles(directory=frontend / 'assets'), name='frontend-assets')

        @app.get('/favicon.svg', include_in_schema=False)
        def favicon():
            return FileResponse(frontend / 'favicon.svg')

        @app.get('/{path:path}', include_in_schema=False)
        def frontend_page(path: str):
            if path in ('', 'inicio', 'studio') or path.startswith(('studio/', 'tour/', 'solicitar/', 'cuenta/')):
                return FileResponse(frontend / 'index.html', headers={'Cache-Control': 'no-cache'})
            raise HTTPException(404, 'Página no encontrada')

    return app


app = create_app()
