import easyocr
import cv2
import re
import json
from rapidfuzz import process, fuzz

reader = easyocr.Reader(['ko', 'en'])

PATH = 'sample_img/img4.png'
PLAYER_JSON_PATH = 'test_name.json'

img = cv2.imread(PATH)
results = reader.readtext(img)

IGNORE_WORDS = {'받기', '반기'}
END_WORD = '판매완료'

with open(PLAYER_JSON_PATH, 'r', encoding='utf-8') as f:
    PLAYER_NAMES = json.load(f)


def has_korean(text):
    return bool(re.search(r'[가-힣]', text))


def clean_name(text):
    text = re.sub(r'[^가-힣\s]', '', text).strip()
    chunks = re.findall(r'[가-힣]{2,}', text)

    if not chunks:
        return ''

    return max(chunks, key=len)


def normalize_name(name):
    if not name:
        return ''

    return clean_name(name).replace(' ', '')


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
        scorer=fuzz.WRatio
    )

    if match is None:
        return ocr_name

    matched_key, score, _ = match

    # 너무 짧은 이름으로 잘못 붙는 것 방지
    if len(matched_key) <= 3 and len(query) >= 5:
        return ocr_name

    if score >= threshold:
        return NORMALIZED_PLAYER_MAP[matched_key]

    return ocr_name


def is_price(text):
    # 숫자가 포함된 조/억만 가격으로 인정
    # 예: 1,610억 / 69조 5,000억 / 83조1,000억
    return bool(re.search(r'\d[\d,\s]*(조|억)', text))


def clean_price(text):
    match = re.search(r'\d[\d,\s]*(?:조)?\s*\d*[\d,\s]*(?:억)?', text)

    if not match:
        return None

    price = match.group().strip()

    if '조' not in price and '억' not in price:
        return None

    return price


def is_overall(text):
    return text.isdigit() and 90 <= int(text) <= 150


def is_upgrade_number(text):
    return text.isdigit() and 1 <= int(text) <= 40


def is_noise(text):
    return text in IGNORE_WORDS or text == END_WORD


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

    name = None

    if name_candidates:
        name = max(name_candidates, key=len)

    corrected_name = find_best_name(name)

    return {
        'name': corrected_name,
        'overall': overall,
        'price': price,
    }


players = []

for group in groups:
    player = extract_player_from_group(group)

    if player is None:
        continue

    players.append(player)


for player in players:
    print(player)


