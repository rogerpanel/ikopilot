"""iKo Doc-Handler — document conversion and manipulation module.

Provides PDF/DOCX/image conversion, merging, splitting, compression,
watermarking, rotation, and password protection. Replicates core
iLovePDF/SmallPDF functionality using only local Python libraries.
"""

import io
import os
import re
import tempfile
import zipfile
from pathlib import Path
from typing import List, Optional

import fitz  # PyMuPDF
import img2pdf
from docx import Document as DocxDocument
from PIL import Image
from reportlab.lib.pagesizes import letter
from reportlab.lib.units import inch
from reportlab.pdfgen import canvas

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile
from fastapi.responses import StreamingResponse

from auth import get_current_user
from database import User

router = APIRouter(prefix="/api/docs", tags=["doc-handler"])

MAX_FILE_SIZE = 50 * 1024 * 1024  # 50 MB

PDF_MIME = {".pdf"}
DOCX_MIME = {".docx"}
IMAGE_MIME = {".png", ".jpg", ".jpeg", ".gif", ".bmp", ".tiff", ".webp"}


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _validate_file_ext(filename: Optional[str], allowed: set[str], label: str = "file"):
    """Raise 400 if the file extension is not in *allowed*."""
    if not filename:
        raise HTTPException(status_code=400, detail=f"No {label} provided")
    ext = Path(filename).suffix.lower()
    if ext not in allowed:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported {label} type '{ext}'. Allowed: {', '.join(sorted(allowed))}",
        )
    return ext


async def _read_upload(file: UploadFile, allowed: set[str], label: str = "file") -> tuple[bytes, str]:
    """Read an UploadFile, validate extension + size, return (bytes, ext)."""
    ext = _validate_file_ext(file.filename, allowed, label)
    data = await file.read()
    if len(data) > MAX_FILE_SIZE:
        raise HTTPException(status_code=400, detail="File too large. Maximum 50 MB.")
    return data, ext


def _stream_bytes(data: bytes, filename: str, media_type: str) -> StreamingResponse:
    """Return a StreamingResponse that serves *data* as a downloadable file."""
    return StreamingResponse(
        io.BytesIO(data),
        media_type=media_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _parse_page_ranges(spec: str, total_pages: int) -> list[list[int]]:
    """Parse a comma-separated page range spec like '1-3,4-6' into lists of 0-based indices.

    Each range produces one list of page indices.
    """
    ranges: list[list[int]] = []
    for part in spec.split(","):
        part = part.strip()
        if not part:
            continue
        m = re.match(r"^(\d+)\s*-\s*(\d+)$", part)
        if m:
            start, end = int(m.group(1)), int(m.group(2))
        else:
            start = end = int(part)
        # clamp to valid 1-based range, then convert to 0-based
        start = max(1, min(start, total_pages))
        end = max(1, min(end, total_pages))
        if start > end:
            start, end = end, start
        ranges.append(list(range(start - 1, end)))
    if not ranges:
        raise HTTPException(status_code=400, detail="Invalid page range specification")
    return ranges


# ---------------------------------------------------------------------------
# 1. PDF → DOCX
# ---------------------------------------------------------------------------

@router.post("/pdf-to-word")
async def pdf_to_word(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
):
    """Convert a PDF to DOCX. Text is extracted per page via PyMuPDF."""
    data, _ = await _read_upload(file, PDF_MIME, "PDF")

    doc = fitz.open(stream=data, filetype="pdf")
    docx_doc = DocxDocument()

    for page_num in range(len(doc)):
        page = doc[page_num]
        text = page.get_text()
        if page_num > 0:
            docx_doc.add_page_break()
        docx_doc.add_paragraph(text)

    doc.close()

    buf = io.BytesIO()
    docx_doc.save(buf)
    buf.seek(0)

    stem = Path(file.filename).stem if file.filename else "converted"
    return _stream_bytes(
        buf.getvalue(),
        f"{stem}.docx",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )


# ---------------------------------------------------------------------------
# 2. DOCX → PDF
# ---------------------------------------------------------------------------

@router.post("/word-to-pdf")
async def word_to_pdf(
    file: UploadFile = File(...),
    user: User = Depends(get_current_user),
):
    """Convert a DOCX to PDF using python-docx + reportlab."""
    data, _ = await _read_upload(file, DOCX_MIME, "DOCX")

    docx_doc = DocxDocument(io.BytesIO(data))

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=letter)
    width, height = letter
    margin = 1 * inch
    usable_width = width - 2 * margin
    line_height = 14
    y = height - margin

    for para in docx_doc.paragraphs:
        text = para.text
        if not text.strip():
            y -= line_height
            if y < margin:
                c.showPage()
                y = height - margin
            continue

        # Simple word-wrap
        words = text.split()
        line = ""
        for word in words:
            test = f"{line} {word}".strip()
            if c.stringWidth(test, "Helvetica", 10) < usable_width:
                line = test
            else:
                if line:
                    c.drawString(margin, y, line)
                    y -= line_height
                    if y < margin:
                        c.showPage()
                        y = height - margin
                line = word
        if line:
            c.drawString(margin, y, line)
            y -= line_height
            if y < margin:
                c.showPage()
                y = height - margin

    c.save()
    buf.seek(0)

    stem = Path(file.filename).stem if file.filename else "converted"
    return _stream_bytes(buf.getvalue(), f"{stem}.pdf", "application/pdf")


# ---------------------------------------------------------------------------
# 3. Merge PDFs
# ---------------------------------------------------------------------------

@router.post("/merge-pdfs")
async def merge_pdfs(
    files: List[UploadFile] = File(...),
    user: User = Depends(get_current_user),
):
    """Merge multiple PDF files into one document."""
    if len(files) < 2:
        raise HTTPException(status_code=400, detail="At least 2 PDF files required for merging")

    merged = fitz.open()

    for f in files:
        data, _ = await _read_upload(f, PDF_MIME, "PDF")
        src = fitz.open(stream=data, filetype="pdf")
        merged.insert_pdf(src)
        src.close()

    out = merged.tobytes(deflate=True, garbage=4, clean=True)
    merged.close()

    return _stream_bytes(out, "merged.pdf", "application/pdf")


# ---------------------------------------------------------------------------
# 4. Split PDF
# ---------------------------------------------------------------------------

@router.post("/split-pdf")
async def split_pdf(
    file: UploadFile = File(...),
    pages: str = Query("1-3,4-6", description="Comma-separated page ranges, e.g. '1-3,4-6'"),
    user: User = Depends(get_current_user),
):
    """Split a PDF into separate files based on page ranges. Returns a zip archive."""
    data, _ = await _read_upload(file, PDF_MIME, "PDF")
    src = fitz.open(stream=data, filetype="pdf")
    total = len(src)

    ranges = _parse_page_ranges(pages, total)

    zip_buf = io.BytesIO()
    with zipfile.ZipFile(zip_buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for idx, page_indices in enumerate(ranges, 1):
            part = fitz.open()
            for pg in page_indices:
                part.insert_pdf(src, from_page=pg, to_page=pg)
            zf.writestr(f"part_{idx}.pdf", part.tobytes(deflate=True, garbage=4, clean=True))
            part.close()

    src.close()
    zip_buf.seek(0)

    stem = Path(file.filename).stem if file.filename else "split"
    return _stream_bytes(zip_buf.getvalue(), f"{stem}_split.zip", "application/zip")


# ---------------------------------------------------------------------------
# 5. Compress PDF
# ---------------------------------------------------------------------------

@router.post("/compress-pdf")
async def compress_pdf(
    file: UploadFile = File(...),
    quality: str = Query("medium", description="Compression quality: low, medium, high"),
    user: User = Depends(get_current_user),
):
    """Compress a PDF to reduce file size."""
    data, _ = await _read_upload(file, PDF_MIME, "PDF")

    if quality not in ("low", "medium", "high"):
        raise HTTPException(status_code=400, detail="Quality must be low, medium, or high")

    doc = fitz.open(stream=data, filetype="pdf")

    # Re-encode images at varying quality depending on level
    image_quality = {"low": 30, "medium": 60, "high": 85}[quality]

    for page in doc:
        images = page.get_images(full=True)
        for img_info in images:
            xref = img_info[0]
            try:
                base_image = doc.extract_image(xref)
                if not base_image:
                    continue
                img_bytes = base_image["image"]
                pil_img = Image.open(io.BytesIO(img_bytes))
                if pil_img.mode in ("RGBA", "P"):
                    pil_img = pil_img.convert("RGB")
                out_buf = io.BytesIO()
                pil_img.save(out_buf, format="JPEG", quality=image_quality, optimize=True)
                out_buf.seek(0)
                # Replace image in the PDF
                doc.update_stream(xref, out_buf.getvalue())
            except Exception:
                # If a particular image can't be recompressed, skip it
                continue

    out = doc.tobytes(deflate=True, garbage=4, clean=True)
    doc.close()

    stem = Path(file.filename).stem if file.filename else "compressed"
    return _stream_bytes(out, f"{stem}_compressed.pdf", "application/pdf")


# ---------------------------------------------------------------------------
# 6. Images → PDF
# ---------------------------------------------------------------------------

@router.post("/image-to-pdf")
async def image_to_pdf(
    files: List[UploadFile] = File(...),
    user: User = Depends(get_current_user),
):
    """Convert one or more images (PNG, JPG, etc.) to a single PDF — one image per page."""
    if not files:
        raise HTTPException(status_code=400, detail="At least one image file is required")

    image_data_list: list[bytes] = []
    for f in files:
        data, ext = await _read_upload(f, IMAGE_MIME, "image")
        # Ensure the image can be opened
        try:
            img = Image.open(io.BytesIO(data))
            # Convert to RGB if necessary for img2pdf compatibility
            if img.mode in ("RGBA", "P", "LA"):
                img = img.convert("RGB")
                buf = io.BytesIO()
                fmt = "JPEG" if ext in (".jpg", ".jpeg") else "PNG"
                img.save(buf, format=fmt)
                data = buf.getvalue()
            img.close()
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Invalid image file: {f.filename} — {exc}")
        image_data_list.append(data)

    try:
        pdf_bytes = img2pdf.convert(image_data_list)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Image-to-PDF conversion failed: {exc}")

    return _stream_bytes(pdf_bytes, "images.pdf", "application/pdf")


# ---------------------------------------------------------------------------
# 7. PDF → Images
# ---------------------------------------------------------------------------

@router.post("/pdf-to-images")
async def pdf_to_images(
    file: UploadFile = File(...),
    format: str = Query("png", description="Output image format: png or jpg"),
    dpi: int = Query(150, ge=72, le=600, description="Resolution in DPI"),
    user: User = Depends(get_current_user),
):
    """Render each page of a PDF as an image. Returns a zip archive."""
    data, _ = await _read_upload(file, PDF_MIME, "PDF")

    fmt = format.lower()
    if fmt not in ("png", "jpg", "jpeg"):
        raise HTTPException(status_code=400, detail="Format must be 'png' or 'jpg'")
    if fmt == "jpeg":
        fmt = "jpg"

    doc = fitz.open(stream=data, filetype="pdf")
    zoom = dpi / 72.0
    matrix = fitz.Matrix(zoom, zoom)

    zip_buf = io.BytesIO()
    with zipfile.ZipFile(zip_buf, "w", zipfile.ZIP_DEFLATED) as zf:
        for page_num in range(len(doc)):
            page = doc[page_num]
            pix = page.get_pixmap(matrix=matrix)
            if fmt == "png":
                img_bytes = pix.tobytes("png")
            else:
                img_bytes = pix.tobytes("jpeg")
            zf.writestr(f"page_{page_num + 1}.{fmt}", img_bytes)

    doc.close()
    zip_buf.seek(0)

    stem = Path(file.filename).stem if file.filename else "pages"
    return _stream_bytes(zip_buf.getvalue(), f"{stem}_images.zip", "application/zip")


# ---------------------------------------------------------------------------
# 8. Rotate Pages
# ---------------------------------------------------------------------------

@router.post("/rotate-pages")
async def rotate_pages(
    file: UploadFile = File(...),
    pages: str = Query("all", description="Pages to rotate: 'all' or comma-separated numbers like '1,3,5'"),
    angle: int = Query(90, description="Rotation angle: 90, 180, or 270"),
    user: User = Depends(get_current_user),
):
    """Rotate specific (or all) pages in a PDF by a given angle."""
    data, _ = await _read_upload(file, PDF_MIME, "PDF")

    if angle not in (90, 180, 270):
        raise HTTPException(status_code=400, detail="Angle must be 90, 180, or 270")

    doc = fitz.open(stream=data, filetype="pdf")
    total = len(doc)

    if pages.strip().lower() == "all":
        target_pages = set(range(total))
    else:
        target_pages = set()
        for part in pages.split(","):
            part = part.strip()
            if part.isdigit():
                pg = int(part)
                if 1 <= pg <= total:
                    target_pages.add(pg - 1)
            else:
                raise HTTPException(status_code=400, detail=f"Invalid page number: {part}")

    for pg_idx in target_pages:
        page = doc[pg_idx]
        page.set_rotation((page.rotation + angle) % 360)

    out = doc.tobytes(deflate=True, garbage=4, clean=True)
    doc.close()

    stem = Path(file.filename).stem if file.filename else "rotated"
    return _stream_bytes(out, f"{stem}_rotated.pdf", "application/pdf")


# ---------------------------------------------------------------------------
# 9. Add Watermark
# ---------------------------------------------------------------------------

@router.post("/add-watermark")
async def add_watermark(
    file: UploadFile = File(...),
    text: str = Query("DRAFT", description="Watermark text"),
    opacity: float = Query(0.3, ge=0.05, le=1.0, description="Watermark opacity 0.05–1.0"),
    user: User = Depends(get_current_user),
):
    """Add a diagonal text watermark to every page of a PDF."""
    data, _ = await _read_upload(file, PDF_MIME, "PDF")

    doc = fitz.open(stream=data, filetype="pdf")

    for page in doc:
        rect = page.rect
        # Calculate a font size proportional to page width
        fontsize = min(rect.width, rect.height) / 6

        # Place watermark at center, rotated 45°
        text_point = fitz.Point(rect.width / 2, rect.height / 2)

        page.insert_text(
            text_point,
            text,
            fontsize=fontsize,
            fontname="helv",
            color=(0.5, 0.5, 0.5),
            rotate=45,
            overlay=True,
            fill_opacity=opacity,
        )

    out = doc.tobytes(deflate=True, garbage=4, clean=True)
    doc.close()

    stem = Path(file.filename).stem if file.filename else "watermarked"
    return _stream_bytes(out, f"{stem}_watermarked.pdf", "application/pdf")


# ---------------------------------------------------------------------------
# 10. Protect PDF (password)
# ---------------------------------------------------------------------------

@router.post("/protect-pdf")
async def protect_pdf(
    file: UploadFile = File(...),
    password: str = Query(..., min_length=1, description="Password to protect the PDF"),
    user: User = Depends(get_current_user),
):
    """Add password protection (encryption) to a PDF."""
    data, _ = await _read_upload(file, PDF_MIME, "PDF")

    doc = fitz.open(stream=data, filetype="pdf")

    # fitz.Document.tobytes() does not accept encryption args, so use a temp file
    perm = (
        fitz.PDF_PERM_PRINT
        | fitz.PDF_PERM_COPY
        | fitz.PDF_PERM_ANNOTATE
    )
    with tempfile.NamedTemporaryFile(suffix=".pdf", delete=False) as tmp:
        tmp_path = tmp.name

    try:
        doc.save(
            tmp_path,
            encryption=fitz.PDF_ENCRYPT_AES_256,
            user_pw=password,
            owner_pw=password,
            permissions=perm,
        )
        doc.close()

        protected_data = Path(tmp_path).read_bytes()
    finally:
        if os.path.exists(tmp_path):
            os.unlink(tmp_path)

    stem = Path(file.filename).stem if file.filename else "protected"
    return _stream_bytes(protected_data, f"{stem}_protected.pdf", "application/pdf")


# ---------------------------------------------------------------------------
# 11. List available tools
# ---------------------------------------------------------------------------

@router.get("/tools")
async def list_tools(user: User = Depends(get_current_user)):
    """Return descriptions of every document tool available."""
    return {
        "tools": [
            {
                "endpoint": "/api/docs/pdf-to-word",
                "method": "POST",
                "name": "PDF to Word",
                "description": "Convert a PDF document to DOCX format.",
                "accepts": "Single PDF file",
            },
            {
                "endpoint": "/api/docs/word-to-pdf",
                "method": "POST",
                "name": "Word to PDF",
                "description": "Convert a DOCX document to PDF format.",
                "accepts": "Single DOCX file",
            },
            {
                "endpoint": "/api/docs/merge-pdfs",
                "method": "POST",
                "name": "Merge PDFs",
                "description": "Combine multiple PDF files into a single document.",
                "accepts": "Multiple PDF files",
            },
            {
                "endpoint": "/api/docs/split-pdf",
                "method": "POST",
                "name": "Split PDF",
                "description": "Split a PDF into separate files by page ranges. Returns a ZIP archive.",
                "accepts": "Single PDF file + page ranges parameter",
            },
            {
                "endpoint": "/api/docs/compress-pdf",
                "method": "POST",
                "name": "Compress PDF",
                "description": "Reduce PDF file size with selectable quality (low/medium/high).",
                "accepts": "Single PDF file + quality parameter",
            },
            {
                "endpoint": "/api/docs/image-to-pdf",
                "method": "POST",
                "name": "Image to PDF",
                "description": "Convert one or more images (PNG, JPG, etc.) into a single PDF.",
                "accepts": "One or more image files",
            },
            {
                "endpoint": "/api/docs/pdf-to-images",
                "method": "POST",
                "name": "PDF to Images",
                "description": "Render each PDF page as a PNG or JPG image. Returns a ZIP archive.",
                "accepts": "Single PDF file + format/dpi parameters",
            },
            {
                "endpoint": "/api/docs/rotate-pages",
                "method": "POST",
                "name": "Rotate Pages",
                "description": "Rotate specific or all pages in a PDF (90°, 180°, or 270°).",
                "accepts": "Single PDF file + pages/angle parameters",
            },
            {
                "endpoint": "/api/docs/add-watermark",
                "method": "POST",
                "name": "Add Watermark",
                "description": "Overlay a diagonal text watermark on every page of a PDF.",
                "accepts": "Single PDF file + text/opacity parameters",
            },
            {
                "endpoint": "/api/docs/protect-pdf",
                "method": "POST",
                "name": "Protect PDF",
                "description": "Add AES-256 password encryption to a PDF.",
                "accepts": "Single PDF file + password parameter",
            },
        ]
    }
