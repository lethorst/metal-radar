#!/usr/bin/env python3
"""Fetch metal news from RSS and upcoming metal releases from MusicBrainz.
Designed for GitHub Actions and personal, non-commercial use.
"""
from __future__ import annotations
import hashlib, html, json, re, time
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from urllib.parse import quote

import feedparser
import requests

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
USER_AGENT = "MetalRadar/1.0 (personal PWA; GitHub repository contact)"

FEEDS = [
    ("Metal Injection", "https://metalinjection.net/feed"),
    ("MetalSucks", "https://www.metalsucks.net/feed/"),
    ("Blabbermouth", "https://blabbermouth.net/feed"),
]

METAL_TERMS = {
    "metal","heavy","doom","stoner","thrash","death","black metal","power metal",
    "progressive metal","hard rock","nwobhm","sludge","metalcore","grindcore"
}

def clean(value: str, limit: int = 260) -> str:
    text = re.sub(r"<[^>]+>", " ", html.unescape(value or ""))
    text = re.sub(r"\s+", " ", text).strip()
    return text[:limit].rstrip() + ("…" if len(text) > limit else "")

def stable_id(value: str) -> str:
    return hashlib.sha256(value.encode("utf-8")).hexdigest()[:18]

def parse_date(entry) -> str:
    stamp = entry.get("published_parsed") or entry.get("updated_parsed")
    if stamp:
        return datetime(*stamp[:6], tzinfo=timezone.utc).isoformat()
    return datetime.now(timezone.utc).isoformat()

def fetch_news() -> tuple[list[dict], list[str]]:
    items, ok_sources = [], []
    for source, url in FEEDS:
        try:
            feed = feedparser.parse(url, agent=USER_AGENT)
            if getattr(feed, "bozo", False) and not feed.entries:
                raise RuntimeError(str(getattr(feed, "bozo_exception", "invalid feed")))
            for e in feed.entries[:45]:
                link = e.get("link", "")
                title = clean(e.get("title", ""), 180)
                if not link or not title:
                    continue
                items.append({
                    "id": stable_id(link),
                    "title": title,
                    "summary": clean(e.get("summary", "") or e.get("description", "")),
                    "source": source,
                    "published": parse_date(e),
                    "url": link,
                    "artist": "",
                })
            ok_sources.append(source)
        except Exception as exc:
            print(f"WARNING: {source} failed: {exc}")
    dedup = {}
    for item in items:
        key = re.sub(r"\W+", "", item["title"].lower())[:100]
        dedup.setdefault(key, item)
    result = sorted(dedup.values(), key=lambda x: x["published"], reverse=True)[:250]
    if not result:
        old = DATA / "news.json"
        if old.exists():
            return json.loads(old.read_text(encoding="utf-8")), ok_sources
    return result, ok_sources

def mb_get(params: dict) -> dict:
    headers = {"User-Agent": USER_AGENT, "Accept": "application/json"}
    response = requests.get("https://musicbrainz.org/ws/2/release-group/", params=params, headers=headers, timeout=30)
    response.raise_for_status()
    time.sleep(1.1)  # Respect MusicBrainz rate limit.
    return response.json()

def fetch_releases() -> list[dict]:
    start = date.today() - timedelta(days=30)
    end = date.today() + timedelta(days=150)
    query = f'tag:metal AND firstreleasedate:[{start.isoformat()} TO {end.isoformat()}] AND primarytype:album'
    releases, offset = [], 0
    try:
        while offset < 200:
            payload = mb_get({"query": query, "fmt": "json", "limit": 100, "offset": offset})
            groups = payload.get("release-groups", [])
            if not groups:
                break
            for g in groups:
                artist = (g.get("artist-credit") or [{}])[0].get("name", "Ukjent artist")
                release_date = g.get("first-release-date")
                if not release_date or len(release_date) < 10:
                    continue
                tags = [t.get("name","") for t in g.get("tags", [])]
                releases.append({
                    "id": g.get("id") or stable_id(f'{artist}|{g.get("title")}|{release_date}'),
                    "artist": artist,
                    "title": g.get("title", "Uten tittel"),
                    "releaseDate": release_date[:10],
                    "type": g.get("primary-type") or "Album",
                    "genre": ", ".join(tags[:3]) if tags else "Metal",
                    "source": "MusicBrainz",
                    "url": f'https://musicbrainz.org/release-group/{g.get("id")}',
                })
            offset += len(groups)
            if offset >= int(payload.get("count", 0)):
                break
    except Exception as exc:
        print(f"WARNING: MusicBrainz failed: {exc}")
        old = DATA / "releases.json"
        return json.loads(old.read_text(encoding="utf-8")) if old.exists() else []
    unique = {r["id"]: r for r in releases}
    return sorted(unique.values(), key=lambda x: (x["releaseDate"], x["artist"].lower()))[:300]

def main() -> None:
    DATA.mkdir(exist_ok=True)
    news, sources = fetch_news()
    releases = fetch_releases()
    (DATA / "news.json").write_text(json.dumps(news, ensure_ascii=False, indent=2), encoding="utf-8")
    (DATA / "releases.json").write_text(json.dumps(releases, ensure_ascii=False, indent=2), encoding="utf-8")
    meta = {
        "updated": datetime.now(timezone.utc).isoformat(),
        "news_sources": sources,
        "release_source": "MusicBrainz",
        "news_count": len(news),
        "release_count": len(releases),
    }
    (DATA / "meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Saved {len(news)} news items and {len(releases)} releases.")

if __name__ == "__main__":
    main()
