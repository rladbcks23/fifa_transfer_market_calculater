import requests
import json

SPID_URL = "https://open.api.nexon.com/static/fconline/meta/spid.json"
OUTPUT_FILE = "players_name.json"


def create_unique_name_json():
    res = requests.get(SPID_URL)
    res.raise_for_status()

    players = res.json()

    # 이름만 추출 + 중복 제거
    unique_names = sorted({player["name"] for player in players})

    # JSON 파일 저장
    with open(OUTPUT_FILE, "w", encoding="utf-8") as f:
        json.dump(unique_names, f, ensure_ascii=False, indent=2)

    print(f"{OUTPUT_FILE} 생성 완료! (총 {len(unique_names)}명)")


if __name__ == "__main__":
    create_unique_name_json()