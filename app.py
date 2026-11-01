from __future__ import annotations

from pathlib import Path
from functools import lru_cache

import pandas as pd
from flask import Flask, jsonify, render_template, request
from pyecharts import options as opts
from pyecharts.charts import Bar


ROOT = Path(__file__).resolve().parent
DATA_FILE = ROOT / "data" / "processed" / "housing_commute.csv"
NATIONAL_FILE = ROOT / "data" / "processed" / "five_city_rentals.csv"

app = Flask(__name__)


def load_data() -> pd.DataFrame:
    if not DATA_FILE.exists():
        raise FileNotFoundError("缺少处理后的数据，请先运行 setup.ps1")
    return pd.read_csv(DATA_FILE, encoding="utf-8-sig")


@lru_cache(maxsize=1)
def load_national_data() -> pd.DataFrame:
    if not NATIONAL_FILE.exists():
        raise FileNotFoundError("缺少五城处理数据，请先运行 scripts/prepare_national_data.py")
    return pd.read_csv(NATIONAL_FILE, encoding="utf-8-sig")


def filtered_frame() -> pd.DataFrame:
    df = load_data()
    district = request.args.get("district", "全部")
    destination = request.args.get("destination", "人民广场")
    budget = float(request.args.get("budget", 4500))
    max_commute = float(request.args.get("max_commute", 60))

    commute_col = {
        "人民广场": "commute_people_square",
        "陆家嘴": "commute_lujiazui",
        "张江高科": "commute_zhangjiang",
        "徐家汇": "commute_xujiahui",
    }.get(destination, "commute_people_square")

    df = df.assign(commute=df[commute_col])
    if district != "全部":
        df = df[df["district"] == district]
    df = df[(df["rent_mid"] <= budget) & (df["commute"] <= max_commute)]
    return df.sort_values(["affordability_score", "commute"], ascending=[False, True])


@app.get("/")
def index():
    return render_template("index.html")


@app.get("/api/health")
def health():
    """云平台启动检查：应用必须能读取两组数据才算就绪。"""
    try:
        shanghai = load_data()
        national = load_national_data()
        if shanghai.empty or national.empty:
            return jsonify({"status": "error", "message": "data unavailable"}), 503
        return jsonify({"status": "ok", "national_records": len(national), "shanghai_records": len(shanghai)})
    except (OSError, ValueError):
        app.logger.exception("Health check could not read deployment data")
        return jsonify({"status": "error", "message": "data unavailable"}), 503


@app.get("/api/meta")
def meta():
    df = load_data()
    return jsonify(
        {
            "districts": ["全部"] + sorted(df["district"].dropna().unique().tolist()),
            "destinations": ["人民广场", "陆家嘴", "张江高科", "徐家汇"],
            "records": int(len(df)),
            "snapshot": "2026-07",
        }
    )


@app.get("/api/dashboard")
def dashboard():
    df = filtered_frame()
    if df.empty:
        return jsonify({"summary": {"count": 0}, "districts": [], "scatter": [], "parallel": [], "listings": []})

    district_stats = (
        df.groupby("district", as_index=False)
        .agg(count=("project", "count"), rent=("rent_mid", "median"), commute=("commute", "mean"))
        .round(1)
        .sort_values("count", ascending=False)
    )
    listing_columns = [
        "project", "district", "address", "room_type", "rent_mid", "area_mid",
        "commute", "affordability_score", "nearest_station"
    ]
    return jsonify(
        {
            "summary": {
                "count": int(len(df)),
                "median_rent": round(float(df["rent_mid"].median())),
                "mean_commute": round(float(df["commute"].mean()), 1),
                "mean_area": round(float(df["area_mid"].mean()), 1),
            },
            "districts": district_stats.to_dict("records"),
            "scatter": df[["project", "district", "area_mid", "rent_mid", "commute"]].head(260).to_dict("records"),
            "parallel": df[["project", "rent_mid", "area_mid", "commute", "affordability_score"]].head(140).to_dict("records"),
            "listings": df[listing_columns].head(80).round(1).to_dict("records"),
        }
    )


@app.get("/api/national/meta")
def national_meta():
    df = load_national_data()
    cities = ["北京", "上海", "广州", "深圳", "南京"]
    selected_city = request.args.get("city", "北京")
    if selected_city not in cities:
        selected_city = "北京"
    districts = sorted(df.loc[df["city"] == selected_city, "district"].dropna().unique().tolist())
    return jsonify(
        {
            "cities": cities,
            "districts": ["全部"] + districts,
            "records": int(len(df)),
            "source": "公开五城市租房学习样本",
            "source_url": "https://github.com/Windyhhh/Lianjia-Rental-Data-Analysis",
            "note": "用于课程中的跨城市相对比较，不代表实时市场挂牌；上海通勤模块使用独立的保障性租赁住房快照。",
        }
    )


@app.get("/api/national/dashboard")
def national_dashboard():
    all_data = load_national_data()
    city = request.args.get("city", "北京")
    district = request.args.get("district", "全部")
    budget = float(request.args.get("budget", 15000))
    if city not in set(all_data["city"]):
        city = "北京"

    city_stats = (
        all_data.groupby("city", as_index=False)
        .agg(
            records=("project", "count"),
            median_rent=("rent", "median"),
            median_unit_rent=("rent_per_sqm", "median"),
            median_area=("area", "median"),
        )
        .round(1)
    )
    max_rent = float(city_stats["median_rent"].max())
    max_unit = float(city_stats["median_unit_rent"].max())
    city_stats["affordability"] = (
        100 - city_stats["median_rent"] / max_rent * 60 - city_stats["median_unit_rent"] / max_unit * 40
    ).round(1)
    city_stats["affordability"] = city_stats["affordability"] - city_stats["affordability"].min() + 35
    city_stats = city_stats.sort_values("median_rent", ascending=False)

    df = all_data[all_data["city"] == city].copy()
    if district != "全部":
        df = df[df["district"] == district]
    df = df[df["rent"] <= budget]
    district_stats = (
        df.groupby("district", as_index=False)
        .agg(count=("project", "count"), median_rent=("rent", "median"), unit_rent=("rent_per_sqm", "median"))
        .round(1)
        .sort_values("count", ascending=False)
    )
    room_stats = (
        df.groupby("room_type", as_index=False)
        .agg(count=("project", "count"), median_rent=("rent", "median"))
        .sort_values("count", ascending=False)
        .head(10)
        .round(1)
    )
    return jsonify(
        {
            "selected_city": city,
            "summary": {
                "count": int(len(df)),
                "median_rent": round(float(df["rent"].median())) if not df.empty else 0,
                "median_unit_rent": round(float(df["rent_per_sqm"].median()), 1) if not df.empty else 0,
                "median_area": round(float(df["area"].median()), 1) if not df.empty else 0,
            },
            "city_stats": city_stats.to_dict("records"),
            "districts": district_stats.to_dict("records"),
            "rooms": room_stats.to_dict("records"),
            "scatter": df[["project", "district", "area", "rent", "rent_per_sqm"]].head(500).to_dict("records"),
            "listings": df[
                ["project", "district", "location", "room_type", "rent", "area", "rent_per_sqm", "affordability_score"]
            ].sort_values(["affordability_score", "rent"], ascending=[False, True]).head(60).round(1).to_dict("records"),
        }
    )
@app.get("/api/chart/affordability")
def affordability_chart():
    df = filtered_frame()
    grouped = df.groupby("district")["affordability_score"].mean().sort_values(ascending=False)
    chart = (
        Bar(init_opts=opts.InitOpts(width="900px", height="420px"))
        .add_xaxis(grouped.index.tolist())
        .add_yaxis("平均可负担指数", grouped.round(1).tolist(), category_gap="45%")
        .set_global_opts(
            xaxis_opts=opts.AxisOpts(axislabel_opts=opts.LabelOpts(rotate=25)),
            yaxis_opts=opts.AxisOpts(min_=0, max_=100),
            tooltip_opts=opts.TooltipOpts(trigger="axis"),
        )
    )
    return app.response_class(chart.dump_options(), mimetype="application/json")


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=5000, debug=False)

