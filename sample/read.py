import json

def load_player_json():
    with open("players.json", "r", encoding="utf-8") as f:
        return json.load(f)


data = load_player_json()

print(data["100000001"])