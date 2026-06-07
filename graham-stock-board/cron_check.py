import json
import re
from pathlib import Path
from urllib.error import HTTPError, URLError
from urllib.parse import quote
from urllib.request import Request, urlopen


BASE = Path(__file__).resolve().parent
HEADERS = {"User-Agent": "Mozilla/5.0"}


def load_json(name):
    return json.loads((BASE / name).read_text(encoding="utf-8"))


def fetch_quote(ticker):
    url = f"https://query1.finance.yahoo.com/v8/finance/chart/{quote(ticker)}?interval=1d&range=2d"
    req = Request(url, headers=HEADERS)
    try:
        with urlopen(req, timeout=20) as res:
            payload = json.load(res)
    except (HTTPError, URLError, TimeoutError, json.JSONDecodeError):
        return None

    result = payload.get("chart", {}).get("result", [None])[0]
    meta = (result or {}).get("meta", {})
    price = meta.get("regularMarketPrice")
    prev_close = (
        meta.get("chartPreviousClose")
        or meta.get("previousClose")
        or meta.get("regularMarketPreviousClose")
    )
    if not isinstance(price, (int, float)):
        return None

    chg_pct = 0
    if isinstance(prev_close, (int, float)) and prev_close:
        chg_pct = ((price - prev_close) / prev_close) * 100

    return {
        "price": round(price, 2),
        "prevClose": round(prev_close, 2) if isinstance(prev_close, (int, float)) else None,
        "chgPct": round(chg_pct, 2),
    }


def parse_range(text):
    match = re.search(
        r"\$?([0-9,]+(?:\.[0-9]+)?)\s*[-\u2013\u2014]\s*\$?([0-9,]+(?:\.[0-9]+)?)",
        text or "",
    )
    if not match:
        return None
    low = float(match.group(1).replace(",", ""))
    high = float(match.group(2).replace(",", ""))
    return min(low, high), max(low, high)


paper = load_json("paper-trades.json")
alerts = load_json("alerts.json")
board = load_json("board.seed.json")

watch = paper.get("watchlist", {})
card_map = {card["ticker"]: card for card in board.get("cards", []) if card.get("ticker")}
positions = paper.get("positions", [])
tickers = sorted(
    set(watch.keys())
    | {pos["ticker"] for pos in positions if pos.get("ticker")}
    | set(card_map.keys())
    | {alert["ticker"] for alert in alerts if alert.get("ticker")}
)

quotes = {ticker: fetch_quote(ticker) for ticker in tickers}
prices = {ticker: quote_data for ticker, quote_data in quotes.items() if quote_data}

triggered = []
for alert in alerts:
    if not alert.get("active"):
        continue
    quote_data = prices.get(alert.get("ticker"))
    if not quote_data:
        continue
    price = quote_data["price"]
    level = alert.get("price")
    condition = alert.get("condition")
    if condition == "above" and level is not None and price >= level:
        triggered.append({"ticker": alert.get("ticker"), "condition": condition, "level": level, "price": price, "note": alert.get("note")})
    if condition == "below" and level is not None and price <= level:
        triggered.append({"ticker": alert.get("ticker"), "condition": condition, "level": level, "price": price, "note": alert.get("note")})

zone_issues = []
for ticker, card in card_map.items():
    parsed = parse_range(card.get("starterBuy"))
    quote_data = prices.get(ticker)
    if not parsed or not quote_data:
        continue
    low, high = parsed
    price = quote_data["price"]
    if price < low * 0.8 or price > high * 1.2:
        zone_issues.append({"ticker": ticker, "price": price, "low": low, "high": high, "starterBuy": card.get("starterBuy")})

print(json.dumps({"prices": prices, "triggered": triggered, "zone_issues": zone_issues}, indent=2))
