"""Portfolio math for morning briefings: cash deployment, execution legs, and risk flags."""

from typing import Any

from app.schemas.recommendations import (
    CashDeploymentOption,
    ExecutionRecommendation,
    HoldingAction,
    HoldingSnapshot,
    MarketResearchResponse,
    RiskFlag,
    SellLeg,
    StockIdea,
)


def normalize_symbols(symbols: list[str]) -> list[str]:
    """Deduplicate and uppercase a list of ticker symbols."""
    normalized: list[str] = []
    seen: set[str] = set()
    for raw in symbols:
        symbol = raw.strip().upper()
        if not symbol or symbol in seen:
            continue
        seen.add(symbol)
        normalized.append(symbol)
    return normalized


def map_research_stance_to_action(stance: str) -> str:
    """Convert a research stance string to a portfolio action string."""
    mapping = {
        "exit": "sell",
        "trim": "trim",
        "hold": "hold",
        "add": "add",
        "watch": "watch",
    }
    return mapping.get(stance.strip().lower(), "watch")


def default_morning_focus(raw_focus: str) -> str:
    """Return the trimmed focus text, or a sensible default."""
    trimmed = raw_focus.strip()
    return trimmed if trimmed else "general stock market news, macroeconomy, and world news"


def clamp_strategy_growth(strategy_growth_pct: float) -> float:
    """Clamp the growth percentage to [0, 100]."""
    return max(0.0, min(100.0, float(strategy_growth_pct)))


def strategy_context_text(strategy_growth_pct: float, strategy_fixed_pct: float) -> str:
    """Return a human-readable description of the portfolio strategy posture."""
    growth = round(clamp_strategy_growth(strategy_growth_pct), 1)
    fixed_income = round(max(0.0, min(100.0, float(strategy_fixed_pct))), 1)
    if growth <= 20:
        posture = "conservative"
    elif growth <= 40:
        posture = "moderate-conservative"
    elif growth <= 60:
        posture = "moderate"
    elif growth <= 80:
        posture = "moderate-aggressive"
    else:
        posture = "aggressive"
    return (
        f"Portfolio strategy target: {growth:.1f}% growth / {fixed_income:.1f}% fixed income "
        f"({posture} risk posture)."
    )


def build_risk_flags(research: MarketResearchResponse) -> list[RiskFlag]:
    """Derive risk flags from a market research response."""
    flags: list[RiskFlag] = []
    severe_do_not_buy = sorted(
        [row for row in research.do_not_buy if row.confidence >= 0.65],
        key=lambda row: row.confidence,
        reverse=True,
    )[:3]
    for row in severe_do_not_buy:
        flags.append(
            RiskFlag(
                category="symbol",
                severity="high" if row.confidence >= 0.8 else "medium",
                summary=f"{row.symbol}: {row.reason}",
            )
        )

    macro_text = research.macro_summary.lower()
    macro_keywords = (
        "inflation",
        "recession",
        "geopolitical",
        "war",
        "tariff",
        "volatility",
        "liquidity",
        "credit",
    )
    if any(keyword in macro_text for keyword in macro_keywords):
        flags.append(
            RiskFlag(
                category="macro",
                severity="medium",
                summary="Macro conditions include elevated uncertainty; size positions conservatively.",
            )
        )

    if not flags:
        flags.append(
            RiskFlag(
                category="macro",
                severity="low",
                summary="No elevated systemic risk signal detected in current briefing.",
            )
        )
    return flags


def build_cash_deployment_options(
    *,
    candidates: list[StockIdea],
    deployable_cash_budget: float,
    strategy_growth_pct: float,
    known_names_by_symbol: dict[str, str] | None = None,
) -> list[CashDeploymentOption]:
    """Allocate deployable cash across buy candidates using confidence-weighted allocation."""
    if deployable_cash_budget <= 0 or not candidates:
        return []

    safe_budget = round(max(0.0, float(deployable_cash_budget)), 2)
    if safe_budget <= 0:
        return []

    weights = [max(0.01, float(row.confidence)) for row in candidates]
    total_weight = sum(weights)
    if total_weight <= 0:
        return []

    raw_allocations = [safe_budget * (weight / total_weight) for weight in weights]

    growth = clamp_strategy_growth(strategy_growth_pct)
    if growth <= 20:
        max_single_allocation_pct = 0.40
    elif growth <= 40:
        max_single_allocation_pct = 0.50
    elif growth <= 60:
        max_single_allocation_pct = 0.60
    elif growth <= 80:
        max_single_allocation_pct = 0.70
    else:
        max_single_allocation_pct = 0.80

    n = len(candidates)
    if n >= 2:
        diversity_cap = min(0.42, (1.0 / n) + 0.10)
        max_single_allocation_pct = min(max_single_allocation_pct, diversity_cap)

    max_single_allocation_amount = safe_budget * max_single_allocation_pct

    if len(raw_allocations) > 1:
        capped = [min(amount, max_single_allocation_amount) for amount in raw_allocations]
        remaining = safe_budget - sum(capped)
        if remaining > 0:
            while remaining > 1e-9:
                capacity_indices = [
                    idx
                    for idx, amount in enumerate(capped)
                    if amount < max_single_allocation_amount - 1e-9
                ]
                if not capacity_indices:
                    break
                total_capacity_weight = sum(weights[idx] for idx in capacity_indices)
                if total_capacity_weight <= 0:
                    break
                distributed = 0.0
                for idx in capacity_indices:
                    proportional = remaining * (weights[idx] / total_capacity_weight)
                    headroom = max_single_allocation_amount - capped[idx]
                    add_amount = min(headroom, proportional)
                    capped[idx] += add_amount
                    distributed += add_amount
                if distributed <= 1e-9:
                    break
                remaining -= distributed
        raw_allocations = capped

    allocations: list[float] = []
    running_total = 0.0
    for idx, amount in enumerate(raw_allocations):
        if idx == len(raw_allocations) - 1:
            final_amount = round(max(0.0, safe_budget - running_total), 2)
            allocations.append(final_amount)
            running_total += final_amount
            continue
        rounded_amount = round(max(0.0, amount), 2)
        allocations.append(rounded_amount)
        running_total += rounded_amount

    if allocations:
        delta = round(safe_budget - round(sum(allocations), 2), 2)
        if delta != 0:
            allocations[-1] = round(max(0.0, allocations[-1] + delta), 2)

    symbol_name_lookup = {
        str(symbol).upper(): str(name).strip()
        for symbol, name in (known_names_by_symbol or {}).items()
        if str(symbol).strip()
    }
    options: list[CashDeploymentOption] = []
    for row, amount in zip(candidates, allocations, strict=False):
        allocation_pct = (amount / safe_budget) if safe_budget > 0 else 0.0
        resolved_name = (
            row.company_name.strip()
            or symbol_name_lookup.get(row.symbol.upper(), "").strip()
            or row.symbol
        )
        options.append(
            CashDeploymentOption(
                symbol=row.symbol,
                name=resolved_name,
                sector=row.sector,
                thesis=row.thesis,
                recommendation_reason=row.thesis,
                risk=row.risk,
                entry_style=row.entry_style,
                confidence=row.confidence,
                suggested_amount=amount,
                suggested_allocation_pct=round(allocation_pct, 4),
            )
        )
    return options


def should_suppress_new_buys(
    holdings_actions: list[HoldingAction],
    holdings_snapshot: list[HoldingSnapshot],
) -> bool:
    """Return True when every held position looks healthy enough to defer new purchases."""
    held = [
        row
        for row in holdings_snapshot
        if row.symbol and row.shares > 0 and row.price > 0
    ]
    if not held:
        return False
    action_by_symbol = {row.symbol.upper(): row for row in holdings_actions}
    for snap in held:
        sym = snap.symbol.upper()
        action = action_by_symbol.get(sym)
        if action is None:
            return False
        if action.action in ("sell", "trim", "watch"):
            return False
        if action.action == "hold" and float(action.confidence) < 0.52:
            return False
        if action.action == "add" and float(action.confidence) < 0.45:
            return False
    return True


def collect_rotation_sell_candidates(
    holdings_actions: list[HoldingAction],
    holdings_snapshot: list[HoldingSnapshot],
    *,
    exclude_symbols: set[str] | None = None,
) -> list[dict[str, Any]]:
    """Rank held positions eligible for sale to fund rotation buys."""
    holdings_by_symbol = {
        row.symbol.upper(): row
        for row in holdings_snapshot
        if row.symbol and row.shares > 0 and row.price > 0
    }
    action_by_symbol = {row.symbol.upper(): row for row in holdings_actions}
    blocked = {s.upper() for s in (exclude_symbols or set())}

    sell_candidates: list[dict[str, Any]] = []
    for symbol, snapshot in holdings_by_symbol.items():
        if symbol in blocked:
            continue
        action = action_by_symbol.get(symbol)
        if action is None:
            continue
        confidence = float(action.confidence)
        if action.action == "sell":
            priority = 0
            max_shares = snapshot.shares
        elif action.action == "trim":
            priority = 1
            max_shares = snapshot.shares * 0.5
        elif action.action == "watch" and confidence <= 0.55:
            priority = 2
            max_shares = snapshot.shares * 0.35
        elif action.action == "hold" and confidence <= 0.45:
            priority = 3
            max_shares = snapshot.shares * 0.25
        else:
            continue
        if max_shares <= 0:
            continue
        sell_candidates.append(
            {
                "symbol": symbol,
                "name": snapshot.name,
                "sector": snapshot.sector,
                "price": snapshot.price,
                "remaining_shares": max_shares,
                "action": action.action,
                "reason": action.reason,
                "confidence": confidence,
                "priority": priority,
            }
        )

    sell_candidates.sort(
        key=lambda row: (
            int(row["priority"]),
            -float(row["confidence"]),
            -float(row["remaining_shares"] * row["price"]),
        )
    )
    return sell_candidates


def build_sell_only_execution_recommendations(
    holdings_actions: list[HoldingAction],
    holdings_snapshot: list[HoldingSnapshot],
) -> list[ExecutionRecommendation]:
    """Produce standalone sell/trim rows when no new buys are scheduled."""
    candidates = collect_rotation_sell_candidates(
        holdings_actions,
        holdings_snapshot,
    )
    rows: list[ExecutionRecommendation] = []
    for c in candidates:
        sym = str(c["symbol"])
        sell_leg = SellLeg(
            symbol=sym,
            name=str(c["name"] or sym),
            shares=round(float(c["remaining_shares"]), 4),
            estimated_price=float(c["price"]),
            reason=str(c["reason"]) or "Research recommends exit or trim.",
        )
        rows.append(
            ExecutionRecommendation(
                key=f"{sym}:sell_only",
                summary=(
                    f"Sell {sell_leg.name} ({sym.upper()}) — {sell_leg.shares:,.4f} sh "
                    f"({str(c['action']).upper()}) because {sell_leg.reason}"
                ),
                buy=None,
                sell_leg=sell_leg,
                requires_rotation=False,
                is_sell_only=True,
            )
        )
    return rows


def build_execution_recommendations(
    *,
    holdings_actions: list[HoldingAction],
    cash_deployment_options: list[CashDeploymentOption],
    holdings_snapshot: list[HoldingSnapshot],
    deployable_cash_budget: float,
    exclude_rotation_symbols: set[str] | None = None,
) -> list[ExecutionRecommendation]:
    """Pair buy candidates with rotation sells to form actionable execution rows."""
    if not cash_deployment_options:
        return []

    sell_candidates = collect_rotation_sell_candidates(
        holdings_actions,
        holdings_snapshot,
        exclude_symbols=exclude_rotation_symbols,
    )

    available_cash = max(0.0, float(deployable_cash_budget))
    execution_rows: list[ExecutionRecommendation] = []
    for buy in cash_deployment_options:
        buy_amount = max(0.0, float(buy.suggested_amount))
        if buy_amount <= 0:
            continue
        key = f"{buy.symbol}:{buy.entry_style}"
        sell_leg: SellLeg | None = None
        deficit = max(0.0, buy_amount - available_cash)
        if deficit > 0:
            for candidate in sell_candidates:
                candidate_price = float(candidate["price"])
                if candidate_price <= 0:
                    continue
                shares_needed = min(
                    float(candidate["remaining_shares"]),
                    deficit / candidate_price,
                )
                shares_needed = round(max(0.0, shares_needed), 4)
                if shares_needed <= 0:
                    continue
                candidate["remaining_shares"] = max(
                    0.0, float(candidate["remaining_shares"]) - shares_needed
                )
                proceeds = shares_needed * candidate_price
                available_cash += proceeds
                deficit = max(0.0, buy_amount - available_cash)
                sell_leg = SellLeg(
                    symbol=str(candidate["symbol"]),
                    name=str(candidate["name"] or candidate["symbol"]),
                    shares=shares_needed,
                    estimated_price=candidate_price,
                    reason=str(candidate["reason"]) or "Fund strong-buy rotation.",
                )
                break
            # If rotation buy needs a sell leg but none is available, skip it.
            if sell_leg is None:
                continue

        if available_cash <= 0:
            continue
        funded_amount = min(available_cash, buy_amount)
        if funded_amount <= 0:
            continue
        available_cash = max(0.0, available_cash - funded_amount)
        funded_buy = buy.model_copy(
            update={
                "suggested_amount": round(funded_amount, 2),
                "suggested_allocation_pct": 0.0,
            }
        )
        if sell_leg is not None:
            summary = (
                f"Sell {sell_leg.name} ({sell_leg.symbol}) because {sell_leg.reason}. "
                f"Then buy {funded_buy.name} ({funded_buy.symbol}) with about "
                f"${funded_buy.suggested_amount:,.2f} because {funded_buy.recommendation_reason}."
            )
        else:
            summary = (
                f"Buy {funded_buy.name} ({funded_buy.symbol}) with about "
                f"${funded_buy.suggested_amount:,.2f} because {funded_buy.recommendation_reason}."
            )
        execution_rows.append(
            ExecutionRecommendation(
                key=key,
                summary=summary,
                buy=funded_buy,
                sell_leg=sell_leg,
                requires_rotation=sell_leg is not None,
            )
        )
    return execution_rows
