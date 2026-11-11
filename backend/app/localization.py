import copy
from typing import Any

PROFILE_FIELDS = ("title", "tagline", "description", "author", "bio", "location", "about", "currently", "role", "skills", "purpose")
POST_FIELDS = ("title", "excerpt", "content", "category")


def resolve_locale(header: str) -> str:
    """尊重 Accept-Language 优先级，只选择已支持的中英文，缺省请求继续读取中文。"""
    choices: list[tuple[float, int, str]] = []
    for index, item in enumerate(header.lower().split(",")):
        language, *parameters = item.strip().split(";")
        locale = language.split("-")[0]
        if locale not in {"zh", "en"}:
            continue
        try:
            quality = next((float(value.strip()[2:]) for value in parameters if value.strip().startswith("q=")), 1.0)
        except ValueError:
            continue
        if 0 < quality <= 1:
            choices.append((quality, -index, locale))
    return max(choices)[2] if choices else "zh"


def localize_record(record: dict[str, Any], locale: str, fields: tuple[str, ...], array: str = "") -> None:
    """仅使用作者填写的英文字段覆盖展示，空白逐字段回退并保留技术标签的原始索引。"""
    english = record.pop("en", {})
    if locale != "en":
        return
    for field in fields:
        value = english.get(field, "")
        if field in record and value.strip():
            # Markdown 的开头缩进和末尾换行都有语义，只用去空白结果判空，展示保留作者原串。
            record[field] = value if field in {"content", "about"} else value.strip()
    if array:
        values = english.get(array, [])
        record[array] = [values[index].strip() if index < len(values) and values[index].strip() else value for index, value in enumerate(record[array])]


def public_response(data: Any, kind: str, language_header: str = "") -> dict[str, Any]:
    """在公开响应副本上选择语言，始终移除编辑内容并保留中文筛选值，不改变数据库资料。"""
    localized = copy.deepcopy(data)
    locale = resolve_locale(language_header)
    if kind == "settings":
        localize_record(localized, locale, PROFILE_FIELDS)
    elif kind == "categories":
        for category in localized:
            english_name = category.pop("enName", "")
            if locale == "en" and english_name:
                category["name"] = english_name
    else:
        records = localized["items"] if kind == "posts" else [localized] if kind == "post" else localized
        for record in records:
            if kind in {"post", "posts"}:
                record["categoryValue"] = record["category"]
                record["tagValues"] = list(record["tags"])
                localize_record(record, locale, POST_FIELDS, "tags")
            else:
                localize_record(record, locale, ("title", "description"), "stack")
    return {"data": localized}
