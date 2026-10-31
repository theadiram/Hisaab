"""Exact source amounts. Missing tokens never become zero."""

import re
from decimal import Decimal


def rupees(value, unit):
    if not re.fullmatch(r"-?\d[\d,]*(?:\.\d+)?", value.strip()):
        return None
    scale = {
        "crore": Decimal("10000000"),
        "lakh": Decimal("100000"),
        "thousand": Decimal("1000"),
        "rupee": Decimal(1),
    }[unit]
    amount = Decimal(value.replace(",", "")) * scale
    if amount != amount.quantize(Decimal(".01")):
        raise ValueError("Sub-paise amount needs review")
    return format(amount, ".2f")


def reference(doc, locator):
    return {
        "url": doc["url"],
        "sha256": doc["sha256"],
        "retrievedAt": doc["retrievedAt"],
        "locator": locator,
    }
