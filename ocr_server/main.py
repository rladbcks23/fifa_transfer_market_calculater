import os
import threading

import cv2
import easyocr
import numpy as np
from fastapi import FastAPI, File, Header, HTTPException, UploadFile


app = FastAPI()

reader = easyocr.Reader(["ko", "en"])

MAX_IMAGE_SIZE = int(os.environ.get("MAX_IMAGE_SIZE", 5 * 1024 * 1024))
MAX_IMAGE_DIMENSION = int(os.environ.get("MAX_IMAGE_DIMENSION", 1400))
OCR_MAX_CONCURRENT = int(os.environ.get("OCR_MAX_CONCURRENT", 1))
OCR_WAIT_TIMEOUT = int(os.environ.get("OCR_WAIT_TIMEOUT", 120))
OCR_API_KEY = os.environ.get("OCR_API_KEY")

ocr_slots = threading.BoundedSemaphore(OCR_MAX_CONCURRENT)


def resize_for_ocr(img):
    height, width = img.shape[:2]
    largest = max(width, height)

    if largest <= MAX_IMAGE_DIMENSION:
        return img

    scale = MAX_IMAGE_DIMENSION / largest
    new_size = (int(width * scale), int(height * scale))
    return cv2.resize(img, new_size, interpolation=cv2.INTER_AREA)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/ocr")
def ocr(image: UploadFile = File(...), x_ocr_api_key: str | None = Header(default=None)):
    if OCR_API_KEY and x_ocr_api_key != OCR_API_KEY:
        raise HTTPException(status_code=401, detail="invalid api key")

    data = image.file.read()

    if not data:
        raise HTTPException(status_code=400, detail="image file is required")

    if len(data) > MAX_IMAGE_SIZE:
        raise HTTPException(status_code=413, detail="image file is too large")

    file_bytes = np.frombuffer(data, np.uint8)
    img = cv2.imdecode(file_bytes, cv2.IMREAD_COLOR)

    if img is None:
        raise HTTPException(status_code=400, detail="invalid image")

    acquired = ocr_slots.acquire(timeout=OCR_WAIT_TIMEOUT)

    if not acquired:
        raise HTTPException(status_code=503, detail="ocr server is busy")

    try:
        img = resize_for_ocr(img)
        results = reader.readtext(img)
    finally:
        ocr_slots.release()

    return {
        "results": [
            {
                "text": text.strip(),
                "prob": float(prob),
            }
            for _bbox, text, prob in results
            if text.strip()
        ]
    }
