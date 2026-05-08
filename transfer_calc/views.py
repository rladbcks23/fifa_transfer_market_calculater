import re

import cv2
import easyocr
import numpy as np
from django.http import JsonResponse
from django.shortcuts import render
from django.views.decorators.csrf import csrf_exempt


reader = easyocr.Reader(["ko", "en"])

IGNORE_WORDS = {"받기", "반기"}
END_WORD = "판매완료"


def index(request):
    return render(request, "transfer_calc/index.html")


def is_price(text):
    return bool(re.search(r"\d[\d,\s]*(?:조|억)", text))


def clean_price(text):
    match = re.search(r"\d[\d,\s]*(?:조\s*\d*[\d,\s]*(?:억)?|억)", text)

    if not match:
        return None

    price = match.group().strip()

    if "조" not in price and "억" not in price:
        return None

    return price


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

    return {"price": price}


@csrf_exempt
def upload_image(request):
    if request.method != "POST":
        return JsonResponse({"error": "POST 요청만 허용합니다."}, status=405)

    image_file = request.FILES.get("image")

    if not image_file:
        return JsonResponse({"error": "이미지 파일이 없습니다."}, status=400)

    file_bytes = np.frombuffer(image_file.read(), np.uint8)
    img = cv2.imdecode(file_bytes, cv2.IMREAD_COLOR)

    if img is None:
        return JsonResponse({"error": "이미지를 읽을 수 없습니다."}, status=400)

    results = reader.readtext(img)

    texts = []

    for _bbox, text, prob in results:
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

    groups = []
    current = []

    for text in texts:
        if text == END_WORD:
            if current:
                groups.append(current)
            current = []
            continue

        current.append(text)

    if current:
        groups.append(current)

    players = []

    for group in groups:
        player = extract_player_from_group(group)

        if player is None:
            continue

        players.append(player)

    return JsonResponse({"players": players})
