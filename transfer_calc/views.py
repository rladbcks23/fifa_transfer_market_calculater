import json
import re
import cv2
import numpy as np
import easyocr

from pathlib import Path
from rapidfuzz import process, fuzz

from django.conf import settings
from django.http import JsonResponse
from django.shortcuts import render
from django.views.decorators.csrf import csrf_exempt


PLAYER_JSON_PATH = settings.BASE_DIR / "static" / "json" / "players_name.json"

with open(PLAYER_JSON_PATH, "r", encoding="utf-8") as f:
    PLAYER_NAMES = json.load(f)


IGNORE_WORDS = {"받기", "반기"}
END_WORD = "판매완료"


def index(request):
    return render(request, "transfer_calc/index.html")


# ✅ OCR reader를 요청마다 생성 (전역 제거)
def get_reader():
    return easyocr.Reader(["ko", "en"])


def has_korean(text):
    return bool(re.search(r"[가-힣]", text))


def clean_name(text):
    text = re.sub(r"[^가-힣\s]", "", text).strip()
    chunks = re.findall(r"[가-힣]{2,}", text)

    if not chunks:
        return ""

    return max(chunks, key=len)


def normalize_name(name):
    if not name:
        return ""

    return clean_name(name).replace(" ", "")


NORMALIZED_PLAYER_MAP = {
    normalize_name(name): name
    for name in PLAYER_NAMES
    if normalize_name(name)
}


def find_best_name(ocr_name, threshold=45):
    if not ocr_name:
        return None

    query = normalize_name(ocr_name)

    match = process.extractOne(
        query,
        NORMALIZED_PLAYER_MAP.keys(),
        scorer=fuzz.WRatio,
    )

    if match is None:
        return ocr_name

    matched_key, score, _ = match

    if len(matched_key) <= 3 and len(query) >= 5:
        return ocr_name

    if score >= threshold:
        return NORMALIZED_PLAYER_MAP[matched_key]

    return ocr_name


def is_price(text):
    return bool(re.search(r"\d[\d,\s]*(조|억)", text))


def clean_price(text):
    match = re.search(r"\d[\d,\s]*(?:조)?\s*\d*[\d,\s]*(?:억)?", text)

    if not match:
        return None

    price = match.group().strip()

    if "조" not in price and "억" not in price:
        return None

    return price


def is_overall(text):
    return text.isdigit() and 90 <= int(text) <= 150


def is_upgrade_number(text):
    return text.isdigit() and 1 <= int(text) <= 40


def is_noise(text):
    return text in IGNORE_WORDS or text == END_WORD


def extract_player_from_group(group):
    price_idx = -1

    for i, text in enumerate(group):
        if is_price(text):
            price_idx = i
            break

    if price_idx == -1:
        return None

    price = clean_price(group[price_idx])

    if price is None:
        return None

    before_price = group[:price_idx]

    overall = None
    overall_idx = -1

    for i in range(len(before_price) - 1, -1, -1):
        text = before_price[i]

        if is_overall(text):
            overall = text
            overall_idx = i
            break

    name_area = before_price[:overall_idx] if overall_idx != -1 else before_price

    name_candidates = []

    for text in name_area:
        if is_noise(text):
            continue

        if is_price(text):
            continue

        if is_overall(text):
            continue

        if is_upgrade_number(text):
            continue

        cleaned = clean_name(text)

        if cleaned:
            name_candidates.append(cleaned)

    name = max(name_candidates, key=len) if name_candidates else ""

    corrected_name = find_best_name(name)

    return {
        "name": corrected_name or name,
        "overall": overall,
        "price": price,
    }


@csrf_exempt
def upload_image(request):
    if request.method != "POST":
        return JsonResponse({"error": "POST 요청만 허용됩니다."}, status=405)

    image_file = request.FILES.get("image")

    if not image_file:
        return JsonResponse({"error": "이미지 파일이 없습니다."}, status=400)

    try:
        file_bytes = np.frombuffer(image_file.read(), np.uint8)
        img = cv2.imdecode(file_bytes, cv2.IMREAD_COLOR)

        if img is None:
            return JsonResponse({"error": "이미지를 읽을 수 없습니다."}, status=400)

        # ✅ 이미지 강제 축소 (메모리 절약 핵심)
        img = cv2.resize(img, (800, 800))

        print("OCR 시작")

        reader = get_reader()  # ← 여기서 생성
        results = reader.readtext(img)

        print("OCR 완료")

    except Exception as e:
        print("OCR 에러:", e)
        return JsonResponse({"error": "OCR 처리 중 오류 발생"}, status=500)

    texts = []

    for bbox, text, prob in results:
        text = text.strip()

        if not text:
            continue

        if text in IGNORE_WORDS:
            continue

        if text == END_WORD:
            texts.append(text)
            continue

        if is_price(text) and prob > 0.2:
            texts.append(text)
            continue

        if has_korean(text) and prob > 0.15:
            texts.append(text)
            continue

        if prob > 0.3:
            texts.append(text)

    groups = []
    current = []

    for text in texts:
        if text == END_WORD:
            if current:
                groups.append(current)
            current = []
            continue

        current.append(text)

    players = []

    for group in groups:
        player = extract_player_from_group(group)

        if player is None:
            continue

        players.append(player)

    return JsonResponse({"players": players})