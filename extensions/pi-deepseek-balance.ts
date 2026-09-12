/**
 * pi-deepseek-balance
 *
 * Shows the DeepSeek account balance in the footer status bar and refreshes it
 * after each agent run. Reuses pi's already-configured DeepSeek API key
 * (env `DEEPSEEK_API_KEY` or pi's stored credentials) — no extra secret setup.
 *
 * Usage:
 *   pi -e ./extensions/pi-deepseek-balance.ts
 *   # or install into ~/.pi/agent/extensions/
 *
 * Manual refresh: /deepseek-balance
 */

import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

const PROVIDER_ID = "deepseek";
const BALANCE_URL = "https://api.deepseek.com/user/balance";
const STATUS_KEY = "pi-deepseek-balance";

/** Skip automatic refreshes that happen within this window. */
const THROTTLE_MS = 30_000;
const REQUEST_TIMEOUT_MS = 10_000;

interface BalanceInfo {
	currency: string;
	total_balance: string;
	granted_balance: string;
	topped_up_balance: string;
}

interface BalanceResponse {
	is_available: boolean;
	balance_infos: BalanceInfo[];
}

const CURRENCY_SYMBOLS: Record<string, string> = { CNY: "¥", USD: "$" };

function formatBalance(info: BalanceInfo): string {
	const symbol = CURRENCY_SYMBOLS[info.currency] ?? `${info.currency} `;
	return `${symbol}${info.total_balance}`;
}

function errorMessage(error: unknown): string {
	return error instanceof Error ? error.message : String(error);
}

export default function (pi: ExtensionAPI) {
	let lastRequestedAt = 0;
	let inFlight: Promise<void> | undefined;

	async function refresh(
		ctx: ExtensionContext,
		options: { force?: boolean; notify?: boolean } = {},
	): Promise<void> {
		const now = Date.now();
		if (!options.force && now - lastRequestedAt < THROTTLE_MS) {
			return;
		}
		if (inFlight) {
			return inFlight;
		}

		inFlight = (async () => {
			const theme = ctx.ui.theme;
			const apiKey = await ctx.modelRegistry.getApiKeyForProvider(PROVIDER_ID);

			if (!apiKey) {
				ctx.ui.setStatus(STATUS_KEY, theme.fg("dim", "DeepSeek: no API key"));
				if (options.notify) {
					ctx.ui.notify("No DeepSeek API key configured", "warning");
				}
				return;
			}

			// Throttle failures too, so an outage does not hammer the endpoint.
			lastRequestedAt = Date.now();

			try {
				const response = await fetch(BALANCE_URL, {
					headers: {
						Accept: "application/json",
						Authorization: `Bearer ${apiKey}`,
					},
					signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
				});

				if (!response.ok) {
					throw new Error(`HTTP ${response.status} ${response.statusText}`.trim());
				}

				const data = (await response.json()) as BalanceResponse;
				const parts = (data.balance_infos ?? []).map(formatBalance);
				const label = parts.length > 0 ? `DeepSeek ${parts.join(" / ")}` : "DeepSeek: no balance info";

				if (data.is_available) {
					ctx.ui.setStatus(STATUS_KEY, theme.fg("accent", label));
				} else {
					ctx.ui.setStatus(STATUS_KEY, theme.fg("error", `${label} (unavailable)`));
				}

				if (options.notify) {
					ctx.ui.notify(label, data.is_available ? "info" : "warning");
				}
			} catch (error) {
				const message = errorMessage(error);
				ctx.ui.setStatus(STATUS_KEY, theme.fg("error", `DeepSeek: ${message}`));
				if (options.notify) {
					ctx.ui.notify(`Failed to fetch DeepSeek balance: ${message}`, "error");
				}
			}
		})().finally(() => {
			inFlight = undefined;
		});

		return inFlight;
	}

	pi.on("session_start", async (_event, ctx) => {
		await refresh(ctx, { force: true });
	});

	// Fires once an agent run has fully settled (no pending retries/continuations).
	pi.on("agent_settled", async (_event, ctx) => {
		await refresh(ctx);
	});

	pi.on("session_shutdown", async (_event, ctx) => {
		ctx.ui.setStatus(STATUS_KEY, undefined);
	});

	pi.registerCommand("deepseek-balance", {
		description: "Refresh and show the DeepSeek account balance",
		handler: async (_args, ctx) => {
			await refresh(ctx, { force: true, notify: true });
		},
	});
}
