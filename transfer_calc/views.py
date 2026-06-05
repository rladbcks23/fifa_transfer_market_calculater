import os
import re

import requests
from django.http import JsonResponse
from django.shortcuts import render
from django.views.decorators.csrf import csrf_exempt


IGNORE_WORDS = {"받기", "반기"}
END_WORD = "판매완료"
OCR_SERVER_URL = os.environ.get("OCR_SERVER_URL", "http://127.0.0.1:8001/ocr")
OCR_API_KEY = os.environ.get("OCR_API_KEY")
MAX_IMAGE_SIZE = int(os.environ.get("MAX_IMAGE_SIZE", 5 * 1024 * 1024))


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


def clean_quantity(text):
    clean = re.sub(r"[\s,]", "", text).lower()
    clean = clean.replace("×", "x")
    match = re.fullmatch(r"x?(\d{1,3})(?:개|장)?", clean)

    if not match:
        return None

    quantity = int(match.group(1))

    if quantity < 1:
        return None

    return quantity


def get_bbox_metrics(bbox):
    if not bbox:
        return None

    try:
        xs = [float(point[0]) for point in bbox]
        ys = [float(point[1]) for point in bbox]
    except (TypeError, ValueError, IndexError):
        return None

    return {
        "x": (min(xs) + max(xs)) / 2,
        "y": (min(ys) + max(ys)) / 2,
        "height": max(ys) - min(ys),
    }


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

    quantity = 1

    for text in group[price_idx + 1 :]:
        parsed_quantity = clean_quantity(text)

        if parsed_quantity is not None:
            quantity = parsed_quantity
            break

    return {"price": price, "quantity": quantity}


def extract_players_from_positioned_results(items):
    price_items = [item for item in items if is_price(item["text"]) and item["prob"] > 0.2]
    players = []

    for price_item in price_items:
        price = clean_price(price_item["text"])

        if price is None:
            continue

        row_tolerance = max(18, price_item["height"] * 1.4)
        same_row_items = [
            item
            for item in items
            if abs(item["y"] - price_item["y"]) <= row_tolerance
        ]
        end_items = [
            item
            for item in same_row_items
            if item["text"] == END_WORD and item["x"] > price_item["x"]
        ]
        end_x = min((item["x"] for item in end_items), default=None)
        quantity_candidates = []

        for item in same_row_items:
            if item["x"] <= price_item["x"]:
                continue

            if end_x is not None and item["x"] >= end_x:
                continue

            quantity = clean_quantity(item["text"])

            if quantity is None:
                continue

            quantity_candidates.append((item["x"] - price_item["x"], quantity))

        quantity = min(quantity_candidates, default=(None, 1))[1]
        players.append({"price": price, "quantity": quantity})

    return players


def parse_ocr_results(results):
    positioned_items = []
    texts = []

    for result in results:
        text = str(result.get("text", "")).strip()
        prob = float(result.get("prob", 0))

        if not text:
            continue

        if text in IGNORE_WORDS:
            continue

        metrics = get_bbox_metrics(result.get("bbox"))

        if metrics:
            positioned_items.append({"text": text, "prob": prob, **metrics})

        if text == END_WORD:
            texts.append(text)
            continue

        if is_price(text) and prob > 0.2:
            texts.append(text)
            continue

        if clean_quantity(text) is not None and prob > 0.2:
            texts.append(text)
            continue

    if positioned_items:
        players = extract_players_from_positioned_results(positioned_items)

        if players:
            return players

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

    return players


def request_ocr(image_file):
    headers = {}

    if OCR_API_KEY:
        headers["X-OCR-API-Key"] = OCR_API_KEY

    response = requests.post(
        OCR_SERVER_URL,
        files={
            "image": (
                image_file.name,
                image_file.read(),
                image_file.content_type or "application/octet-stream",
            )
        },
        headers=headers,
        timeout=(5, 120),
    )
    response.raise_for_status()
    return response.json()


@csrf_exempt
def upload_image(request):
    if request.method != "POST":
        return JsonResponse({"error": "POST 요청만 허용합니다."}, status=405)

    image_file = request.FILES.get("image")

    if not image_file:
        return JsonResponse({"error": "이미지 파일이 없습니다."}, status=400)

    if image_file.size > MAX_IMAGE_SIZE:
        return JsonResponse({"error": "이미지 파일이 너무 큽니다."}, status=413)

    try:
        ocr_data = request_ocr(image_file)
    except requests.HTTPError as exc:
        status_code = exc.response.status_code if exc.response is not None else 502

        try:
            detail = exc.response.json().get("detail")
        except (AttributeError, ValueError):
            detail = None

        return JsonResponse(
            {"error": detail or "OCR 서버가 요청을 처리하지 못했습니다."},
            status=status_code,
        )
    except requests.Timeout:
        return JsonResponse({"error": "OCR 서버 응답 시간이 초과되었습니다."}, status=504)
    except requests.RequestException:
        return JsonResponse({"error": "OCR 서버에 연결할 수 없습니다."}, status=502)

    players = parse_ocr_results(ocr_data.get("results", []))

    return JsonResponse({"players": players})
