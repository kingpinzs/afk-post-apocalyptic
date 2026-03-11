import { gameState, getConfig } from './gameState.js';
import { logEvent, updateDisplay } from './ui.js';
import { addResource } from './resources.js';
import { getEffect } from './effects.js';

/**
 * Check if trading is unlocked (marketplace is built)
 */
export function isTradingUnlocked() {
    return !!gameState.craftedItems.marketplace;
}

/**
 * Run daily trading updates: trader arrivals, currency production, economic growth
 */
export function updateTrading() {
    if (!isTradingUnlocked()) return;
    const config = getConfig();
    const tradingConfig = config.trading;
    if (!tradingConfig) return;

    // Currency production (mint)
    const currencyRate = getEffect('currencyProductionRate');
    if (currencyRate > 0) {
        let production = currencyRate;
        // currencyManagementEfficiency (bank) multiplies currency production
        production *= getEffect('currencyManagementEfficiency');
        // economicOutputMultiplier (metropolis) global economic multiplier
        production *= getEffect('economicOutputMultiplier');
        gameState.currency = (gameState.currency || 0) + production;
        if (production > 0.5) logEvent(`Mint produced ${production.toFixed(1)} currency.`);
    }

    // Economic growth (stock_exchange) — compound growth on currency
    const growthRate = getEffect('economicGrowthRate');
    if (growthRate > 0 && gameState.currency > 0) {
        const growth = gameState.currency * (growthRate / 100);
        gameState.currency += growth;
    }

    // Investment returns (stock_exchange) — periodic bonus resources
    const investReturn = getEffect('investmentReturnMultiplier');
    if (investReturn > 1 && gameState.currency >= 50) {
        if (Math.random() < 0.1) { // 10% daily chance
            const bonus = Math.floor(gameState.currency * 0.02 * investReturn);
            if (bonus > 0) {
                const resources = ['food', 'water', 'wood', 'stone'];
                const resource = resources[Math.floor(Math.random() * resources.length)];
                addResource(resource, bonus);
                logEvent(`Investment returned ${bonus} ${resource}.`);
            }
        }
    }

    // Trader arrivals
    checkTraderArrivals(tradingConfig);

    updateDisplay();
}

function checkTraderArrivals(tradingConfig) {
    if (!tradingConfig.traders) return;

    tradingConfig.traders.forEach(trader => {
        // Check requirements
        if (trader.requiresItem && !gameState.craftedItems[trader.requiresItem]) return;

        // Check frequency
        if (gameState.day % trader.frequency === 0) {
            // Trader arrives — only add if not already present
            const existing = (gameState.traderVisits || []).find(v => v.id === trader.id);
            if (!existing) {
                gameState.traderVisits = gameState.traderVisits || [];
                gameState.traderVisits.push({
                    id: trader.id,
                    name: trader.name || trader.id.replace(/_/g, ' '),
                    arrivedDay: gameState.day,
                    expiresDay: gameState.day + 3, // stays 3 days
                    trades: generateTraderOffers(tradingConfig)
                });
                logEvent(`A ${trader.name || trader.id.replace(/_/g, ' ')} has arrived at your marketplace!`);
            }
        }
    });

    // Remove expired traders
    gameState.traderVisits = (gameState.traderVisits || []).filter(v => gameState.day <= v.expiresDay);
}

function generateTraderOffers(tradingConfig) {
    const baseRates = tradingConfig.baseExchangeRates || [];
    const tradeEff = getEffect('tradeEfficiencyMultiplier');

    return baseRates.map(rate => ({
        give: rate.give,
        giveAmount: Math.max(1, Math.ceil(rate.giveAmount / tradeEff)),
        receive: rate.receive,
        receiveAmount: Math.ceil(rate.receiveAmount * tradeEff),
        available: true
    }));
}

/**
 * Execute a trade
 */
export function executeTrade(traderIndex, tradeIndex) {
    const trader = (gameState.traderVisits || [])[traderIndex];
    if (!trader) return false;

    const trade = trader.trades[tradeIndex];
    if (!trade || !trade.available) return false;

    // Check if player has enough to give
    if ((gameState[trade.give] || 0) < trade.giveAmount) {
        logEvent(`Not enough ${trade.give} for this trade.`);
        return false;
    }

    // Check trade ship safety (for coastal trades)
    const safety = getEffect('tradeShipSafetyMultiplier');
    if (trader.id === 'coastal_trader' && safety < 1.5) {
        if (Math.random() < 0.15) { // 15% failure chance without lighthouse
            gameState[trade.give] -= trade.giveAmount;
            logEvent(`Trade shipment was lost at sea! Lost ${trade.giveAmount} ${trade.give}.`);
            updateDisplay();
            return false;
        }
    }

    // Execute trade
    gameState[trade.give] -= trade.giveAmount;
    addResource(trade.receive, trade.receiveAmount);

    // Track stats
    gameState.stats.totalTraded = (gameState.stats.totalTraded || 0) + 1;

    logEvent(`Traded ${trade.giveAmount} ${trade.give} for ${trade.receiveAmount} ${trade.receive}.`);
    trade.available = false; // One-time per visit

    updateDisplay();
    return true;
}

/**
 * Get available trades for UI display
 */
export function getAvailableTrades() {
    return (gameState.traderVisits || []).map((trader, ti) => ({
        traderName: trader.name,
        expiresIn: trader.expiresDay - gameState.day,
        trades: trader.trades.map((t, idx) => ({
            ...t,
            traderIndex: ti,
            tradeIndex: idx
        }))
    }));
}

/**
 * Loan mechanic (bank)
 */
export function takeLoan(amount) {
    const loanRate = getEffect('loanAvailabilityRate');
    if (loanRate <= 0) {
        logEvent('No bank available to provide loans.');
        return false;
    }

    const maxLoan = Math.floor(100 * loanRate);
    if (amount > maxLoan) {
        logEvent(`Maximum loan amount is ${maxLoan} currency.`);
        return false;
    }

    gameState.currency = (gameState.currency || 0) + amount;
    logEvent(`Took a loan of ${amount} currency.`);
    updateDisplay();
    return true;
}
