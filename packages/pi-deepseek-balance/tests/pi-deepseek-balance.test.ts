import { afterEach, describe, expect, it, vi } from "vitest";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

import extension, {
	BALANCE_URL,
	PROVIDER_ID,
	STATUS_KEY,
	errorMessage,
	formatBalance,
	formatBalanceLabel,
	type BalanceInfo,
	type BalanceResponse,
} from "../extensions/index.ts";

// ---------------------------------------------------------------------------
// Test doubles
// ---------------------------------------------------------------------------

type EventHandler = (event: unknown, ctx: ExtensionContext) => unknown;
type CommandHandler = (args: string, ctx: ExtensionContext) => unknown;

interface FakePi {
	pi: ExtensionAPI;
	handlers: Map<string, EventHandler[]>;
	commands: Map<string, { description?: string; handler: CommandHandler }>;
	emit(event: string, ctx: ExtensionContext): Promise<void>;
}

function createFakePi(): FakePi {
	const handlers = new Map<string, EventHandler[]>();
	const commands = new Map<string, { description?: string; handler: CommandHandler }>();

	const pi = {
		on(event: string, handler: EventHandler) {
			const list = handlers.get(event) ?? [];
			list.push(handler);
			handlers.set(event, list);
			return pi;
		},
		registerCommand(name: string, command: { description?: string; handler: CommandHandler }) {
			commands.set(name, command);
			return pi;
		},
	} as unknown as ExtensionAPI;

	return {
		pi,
		handlers,
		commands,
		async emit(event, ctx) {
			for (const handler of handlers.get(event) ?? []) {
				await handler({}, ctx);
			}
		},
	};
}

interface FakeCtx {
	ctx: ExtensionContext;
	statuses: Map<string, string | undefined>;
	notifications: Array<{ message: string; type: string | undefined }>;
}

function createFakeCtx(options: { apiKey?: string | null } = {}): FakeCtx {
	const statuses = new Map<string, string | undefined>();
	const notifications: Array<{ message: string; type: string | undefined }> = [];
	const apiKey = options.apiKey === undefined ? "test-key" : options.apiKey;

	const ctx = {
		ui: {
			theme: {
				fg: (color: string, text: string) => `[${color}]${text}`,
			},
			setStatus(key: string, text: string | undefined) {
				statuses.set(key, text);
			},
			notify(message: string, type?: string) {
				notifications.push({ message, type });
			},
		},
		modelRegistry: {
			async getApiKeyForProvider(provider: string) {
				return provider === PROVIDER_ID ? apiKey : undefined;
			},
		},
	} as unknown as ExtensionContext;

	return { ctx, statuses, notifications };
}

function jsonResponse(
	body: unknown,
	init: { ok?: boolean; status?: number; statusText?: string } = {},
): Response {
	return {
		ok: init.ok ?? true,
		status: init.status ?? 200,
		statusText: init.statusText ?? "OK",
		json: async () => body,
	} as unknown as Response;
}

function stubFetch(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
	const mock = vi.fn(async (url: string, init?: RequestInit) => handler(url, init));
	vi.stubGlobal("fetch", mock);
	return mock;
}

const AVAILABLE_RESPONSE: BalanceResponse = {
	is_available: true,
	balance_infos: [
		{
			currency: "CNY",
			total_balance: "12.34",
			granted_balance: "2.34",
			topped_up_balance: "10.00",
		},
	],
};

afterEach(() => {
	vi.unstubAllGlobals();
	vi.restoreAllMocks();
});

// ---------------------------------------------------------------------------
// Pure helpers
// ---------------------------------------------------------------------------

describe("formatBalance", () => {
	const base: BalanceInfo = {
		currency: "CNY",
		total_balance: "12.34",
		granted_balance: "0.00",
		topped_up_balance: "12.34",
	};

	it("uses the symbol for known currencies", () => {
		expect(formatBalance(base)).toBe("¥12.34");
		expect(formatBalance({ ...base, currency: "USD", total_balance: "5.00" })).toBe("$5.00");
	});

	it("falls back to the currency code for unknown currencies", () => {
		expect(formatBalance({ ...base, currency: "EUR", total_balance: "1.00" })).toBe("EUR 1.00");
	});
});

describe("formatBalanceLabel", () => {
	it("joins every balance entry on one line", () => {
		const response: BalanceResponse = {
			is_available: true,
			balance_infos: [
				{ currency: "CNY", total_balance: "12.34", granted_balance: "0", topped_up_balance: "0" },
				{ currency: "USD", total_balance: "1.00", granted_balance: "0", topped_up_balance: "0" },
			],
		};
		expect(formatBalanceLabel(response)).toBe("DeepSeek ¥12.34 / $1.00");
	});

	it("reports when no balance info is present", () => {
		expect(formatBalanceLabel({ is_available: true, balance_infos: [] })).toBe(
			"DeepSeek: no balance info",
		);
	});
});

describe("errorMessage", () => {
	it("extracts messages from Error instances", () => {
		expect(errorMessage(new Error("boom"))).toBe("boom");
	});

	it("stringifies non-Error values", () => {
		expect(errorMessage("nope")).toBe("nope");
	});
});

// ---------------------------------------------------------------------------
// Extension behavior
// ---------------------------------------------------------------------------

describe("pi-deepseek-balance extension", () => {
	function setup(options: { apiKey?: string | null } = {}) {
		const fakePi = createFakePi();
		const fakeCtx = createFakeCtx(options);
		extension(fakePi.pi);
		return { ...fakePi, ...fakeCtx };
	}

	it("fetches and shows the balance on session_start", async () => {
		const fetchMock = stubFetch(() => jsonResponse(AVAILABLE_RESPONSE));
		const { ctx, statuses, emit } = setup();

		await emit("session_start", ctx);

		expect(fetchMock).toHaveBeenCalledTimes(1);
		expect(fetchMock).toHaveBeenCalledWith(
			BALANCE_URL,
			expect.objectContaining({
				headers: expect.objectContaining({ Authorization: "Bearer test-key" }),
			}),
		);
		expect(statuses.get(STATUS_KEY)).toBe("[accent]DeepSeek ¥12.34");
	});

	it("shows a dim status when no API key is configured", async () => {
		const fetchMock = stubFetch(() => jsonResponse(AVAILABLE_RESPONSE));
		const { ctx, statuses, emit } = setup({ apiKey: null });

		await emit("session_start", ctx);

		expect(fetchMock).not.toHaveBeenCalled();
		expect(statuses.get(STATUS_KEY)).toBe("[dim]DeepSeek: no API key");
	});

	it("flags an unavailable account", async () => {
		stubFetch(() => jsonResponse({ ...AVAILABLE_RESPONSE, is_available: false }));
		const { ctx, statuses, emit } = setup();

		await emit("session_start", ctx);

		expect(statuses.get(STATUS_KEY)).toBe("[error]DeepSeek ¥12.34 (unavailable)");
	});

	it("surfaces HTTP errors", async () => {
		stubFetch(() => jsonResponse({}, { ok: false, status: 500, statusText: "Server Error" }));
		const { ctx, statuses, emit } = setup();

		await emit("session_start", ctx);

		expect(statuses.get(STATUS_KEY)).toBe("[error]DeepSeek: HTTP 500 Server Error");
	});

	it("surfaces network errors", async () => {
		stubFetch(() => {
			throw new Error("network down");
		});
		const { ctx, statuses, emit } = setup();

		await emit("session_start", ctx);

		expect(statuses.get(STATUS_KEY)).toBe("[error]DeepSeek: network down");
	});

	it("throttles automatic refreshes after an agent run", async () => {
		const fetchMock = stubFetch(() => jsonResponse(AVAILABLE_RESPONSE));
		const { ctx, emit } = setup();

		await emit("session_start", ctx);
		await emit("agent_settled", ctx);

		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("registers a command that forces a refresh and notifies", async () => {
		const fetchMock = stubFetch(() => jsonResponse(AVAILABLE_RESPONSE));
		const { ctx, commands, notifications, emit } = setup();

		await emit("session_start", ctx);
		const command = commands.get("deepseek-balance");
		expect(command).toBeDefined();

		await command?.handler("", ctx);

		expect(fetchMock).toHaveBeenCalledTimes(2);
		expect(notifications.at(-1)).toEqual({ message: "DeepSeek ¥12.34", type: "info" });
	});

	it("clears the status on session_shutdown", async () => {
		stubFetch(() => jsonResponse(AVAILABLE_RESPONSE));
		const { ctx, statuses, emit } = setup();

		await emit("session_start", ctx);
		expect(statuses.get(STATUS_KEY)).toBeDefined();

		await emit("session_shutdown", ctx);
		expect(statuses.get(STATUS_KEY)).toBeUndefined();
	});
});
