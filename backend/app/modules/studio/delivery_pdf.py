"""PDF privado de entrega: generación local y conservación del archivo exacto."""
from datetime import timedelta, timezone
from functools import lru_cache
from html import escape
from io import BytesIO
from pathlib import Path
import logging
import re
from tempfile import TemporaryDirectory
from threading import Lock
import unicodedata
from urllib.parse import urlencode
from uuid import uuid4

from fastapi import HTTPException
from reportlab import __file__ as reportlab_file
from reportlab.graphics.barcode.qr import QrCodeWidget
from reportlab.graphics.shapes import Drawing
from reportlab.lib import colors
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle

from app.core.config import get_settings
from app.modules.auth.security import now
from app.modules.organizations.models import Organization
from app.modules.studio import work_service
from app.modules.studio.models import ServiceEvent
from app.storage.factory import get_storage

MAX_PDF_BYTES = 2 * 1024 * 1024
logger = logging.getLogger(__name__)
font_lock = Lock()


@lru_cache(maxsize=1)
def fonts():
    with font_lock:
        if {'Delivery', 'Delivery-Bold'} <= set(pdfmetrics.getRegisteredFontNames()):
            return
        directory = Path(reportlab_file).parent / 'fonts'
        pdfmetrics.registerFont(TTFont('Delivery', str(directory / 'Vera.ttf')))
        pdfmetrics.registerFont(TTFont('Delivery-Bold', str(directory / 'VeraBd.ttf')))
        pdfmetrics.registerFontFamily('Delivery', normal='Delivery', bold='Delivery-Bold')


def filename(client, title, identifier, issued):
    def part(value):
        ascii_text = unicodedata.normalize('NFKD', value).encode('ascii', 'ignore').decode()
        return re.sub(r'[^a-zA-Z0-9]+', '-', ascii_text).strip('-')[:60].rstrip('-') or '360'
    return f'Entrega_{part(client)}_{part(title)}_{issued:%Y-%m-%d}_{str(identifier)[:8]}.pdf'


def maps_url(location):
    if location.get('latitude') is not None and location.get('longitude') is not None:
        destination = f"{location['latitude']},{location['longitude']}"
    elif location['label'].startswith('https://'):
        # PublicLocation ya valida que los enlaces sean HTTPS de Google Maps.
        return location['label']
    else:
        destination = location['label']
    return 'https://www.google.com/maps/dir/?' + urlencode({'api': '1', 'destination': destination, 'dir_action': 'navigate'})


def render(job, client, link, issued, language):
    fonts()
    portuguese = language == 'pt-BR'
    def text(es, pt):
        return pt if portuguese else es
    brand = colors.HexColor('#16828c')
    ink = colors.HexColor('#17313a')
    styles = {
        'body': ParagraphStyle('body', fontName='Delivery', fontSize=10, leading=15, textColor=ink, spaceAfter=7, splitLongWords=True),
        'small': ParagraphStyle('small', fontName='Delivery', fontSize=8, leading=12, textColor=ink, spaceAfter=7, splitLongWords=True),
        'title': ParagraphStyle('title', fontName='Delivery-Bold', fontSize=24, leading=30, spaceBefore=14, spaceAfter=14, textColor=ink, splitLongWords=True),
        'heading': ParagraphStyle('heading', fontName='Delivery-Bold', fontSize=13, leading=18, spaceBefore=15, spaceAfter=8, textColor=brand, keepWithNext=True),
    }
    def paragraph(value, kind='body'):
        return Paragraph(escape(str(value)).replace('\n', '<br/>'), styles[kind])
    def anchor(label, target):
        return Paragraph(f'<a href="{escape(target, quote=True)}" color="#08717d"><u>{escape(label)}</u></a>', styles['body'])
    settings = job.delivery_document
    story = [paragraph('360° · ' + settings.studio_name, 'heading'), paragraph(job.title, 'title'),
             paragraph(text('Preparado para', 'Preparado para') + ': ' + client),
             paragraph(text('Fecha de emisión', 'Data de emissão') + ': ' + issued.strftime('%d/%m/%Y'), 'small')]
    if job.delivered_at:
        story.append(paragraph(text('Fecha de entrega', 'Data de entrega') + ': ' + job.delivered_at.astimezone(issued.tzinfo).strftime('%d/%m/%Y'), 'small'))
    story.append(paragraph(text('Explorá el recorrido', 'Explore o tour'), 'heading'))
    code = QrCodeWidget(link, barLevel='M')
    x1, y1, x2, y2 = code.getBounds()
    qr = Drawing(110, 110, transform=[110 / (x2-x1), 0, 0, 110 / (y2-y1), 0, 0])
    qr.add(code)
    visit = Table([[[paragraph(text('Abrí el enlace o escaneá el QR con la cámara del celular.', 'Abra o link ou escaneie o QR com a câmera do celular.')),
                      anchor(text('Abrir recorrido 360°', 'Abrir tour 360°'), link), paragraph(link, 'small')], qr]], colWidths=[340, 120])
    visit.setStyle(TableStyle([('VALIGN', (0, 0), (-1, -1), 'MIDDLE'), ('BOX', (0, 0), (-1, -1), .6, brand),
                              ('LEFTPADDING', (0, 0), (-1, -1), 12), ('TOPPADDING', (0, 0), (-1, -1), 12), ('BOTTOMPADDING', (0, 0), (-1, -1), 12)]))
    story.append(visit)
    if job.delivery_location:
        location = job.delivery_location.model_dump()
        story.extend([paragraph(text('Ubicación y cómo llegar', 'Localização e como chegar'), 'heading'),
                      paragraph(location['label']), anchor(text('Ver indicaciones en Google Maps', 'Ver rotas no Google Maps'), maps_url(location))])
    story.extend([paragraph(text('Condiciones de entrega', 'Condições de entrega'), 'heading'), paragraph(settings.conditions),
                  paragraph(text('Contacto y consultas', 'Contato e dúvidas'), 'heading'), paragraph(settings.studio_name), paragraph(settings.contact), Spacer(1, 12),
                  paragraph(text('El recorrido se abre en Internet. Este PDF conserva el enlace y las condiciones; no contiene una copia del recorrido.',
                                 'O tour é aberto na Internet. Este PDF conserva o link e as condições; não contém uma cópia do tour.'), 'small')])
    result = BytesIO()
    def footer(canvas, doc):
        canvas.saveState()
        canvas.setFillColor(colors.white)
        canvas.rect(0, 0, *A4, fill=1, stroke=0)
        canvas.restoreState()
        canvas.setFont('Delivery', 7)
        canvas.setFillColor(ink)
        canvas.drawString(54, 28, f"{text('Referencia', 'Referência')}: {job.id}")
        canvas.drawRightString(A4[0]-54, 28, f'Vision360 · {doc.page}')
    SimpleDocTemplate(result, pagesize=A4, rightMargin=54, leftMargin=54, topMargin=42, bottomMargin=50,
                      title=f'{job.title} - {client}', author=settings.studio_name, pageCompression=1).build(story, onFirstPage=footer, onLaterPages=footer)
    return result.getvalue()


def remove_quietly(storage, key):
    try:
        storage.delete(key)
    except Exception:
        logger.warning('No se pudo limpiar un PDF de entrega reemplazado o incompleto')


def generate(db, user, organization_id, request_id, data, origin):
    item = work_service.access(db, user, organization_id, request_id, write=True)
    work_service.revision(item, data.expected_revision)
    previous = item.delivery_file
    if (str(data.expected_file_id) if data.expected_file_id else None) != (previous['id'] if previous else None):
        raise HTTPException(409, 'El PDF guardado cambió. Actualizá el trabajo antes de reemplazarlo')
    job = work_service.response(db, item)
    if not job.delivery_document:
        raise HTTPException(409, 'Guardá los datos del documento antes de generar el PDF')
    if not job.public_path:
        raise HTTPException(409, 'Publicá el recorrido antes de generar el PDF')
    config = get_settings()
    app_url = config.public_app_url if config.app_env == 'production' else None
    app_url = app_url or (origin if origin in config.cors_origins else None) or config.public_app_url or next(iter(config.cors_origins), None)
    if not app_url:
        raise HTTPException(503, 'Falta configurar la dirección pública de la aplicación')
    client = db.get(Organization, organization_id)
    issued = now()
    local = issued.astimezone(timezone(timedelta(minutes=-data.timezone_offset_minutes)))
    content = render(job, client.name, app_url.rstrip('/') + job.public_path, local, data.language)
    if len(content) > MAX_PDF_BYTES:
        raise HTTPException(413, 'El PDF supera el tamaño permitido')
    from app.modules.subscriptions.service import check_tour
    from app.modules.tours.models import Tour
    check_tour(db, db.get(Tour, item.tour_id), 'upload', reserve=max(0, len(content) - (previous['size_bytes'] if previous else 0)))
    identifier = uuid4()
    key = f'workspaces/{client.workspace_id}/delivery/{item.id}/{identifier}.pdf'
    storage = get_storage()
    try:
        with TemporaryDirectory(prefix='vision360-pdf-') as directory:
            path = Path(directory) / 'delivery.pdf'
            path.write_bytes(content)
            storage.put(key, path, content_type='application/pdf')
        item.delivery_file = dict(id=str(identifier), key=key, backend=config.storage_backend,
                                  filename=filename(client.name, job.title, item.id, local), size_bytes=len(content), created_at=issued.isoformat())
        item.work_revision += 1
        db.add(ServiceEvent(request_id=item.id, actor_id=user.id, previous_status=item.status, status=item.status,
                            note='Se generó y guardó el archivo PDF de entrega.'))
        db.commit()
    except Exception:
        db.rollback()
        remove_quietly(storage, key)
        raise HTTPException(503, 'No se pudo guardar el PDF. El archivo anterior se conserva') from None
    if previous:
        try:
            remove_quietly(get_storage(previous['backend']), previous['key'])
        except Exception:
            logger.warning('No se pudo abrir el storage anterior para limpiar un PDF reemplazado')
    return work_service.response(db, item)


def read(db, user, organization_id, request_id, file_id):
    item = work_service.access(db, user, organization_id, request_id)
    saved = item.delivery_file
    if not saved or saved['id'] != str(file_id):
        raise HTTPException(404, 'Archivo PDF no encontrado')
    try:
        with TemporaryDirectory(prefix='vision360-read-pdf-') as directory:
            path = Path(directory) / 'delivery.pdf'
            get_storage(saved['backend']).download(saved['key'], path, MAX_PDF_BYTES)
            content = path.read_bytes()
        if len(content) != saved['size_bytes'] or not content.startswith(b'%PDF-'):
            raise ValueError('PDF incompleto')
    except Exception:
        raise HTTPException(503, 'No se pudo abrir el PDF guardado. Intentá nuevamente') from None
    return saved, content
