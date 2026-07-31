import { describe, expect, it } from "vitest";
import { extractApiError } from "@/utils/api-error";

function jsonResponse(body: unknown, status = 400): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("extractApiError", () => {
  it("prioriza a mensagem enviada pelo servidor", async () => {
    const message = await extractApiError(
      jsonResponse({ error: "RATE_LIMITED", message: "Tente novamente em 42 minuto(s)." }, 429),
      "fallback",
    );
    expect(message).toBe("Tente novamente em 42 minuto(s).");
  });

  it("usa o primeiro erro de campo do Zod quando não há mensagem", async () => {
    const message = await extractApiError(
      jsonResponse({
        error: "VALIDATION_ERROR",
        issues: { fieldErrors: { confirmPassword: ["As senhas não coincidem."] } },
      }),
      "fallback",
    );
    expect(message).toBe("As senhas não coincidem.");
  });

  it("cai no erro de formulário quando não há erro de campo", async () => {
    const message = await extractApiError(
      jsonResponse({ error: "VALIDATION_ERROR", issues: { formErrors: ["Dados incompletos."] } }),
      "fallback",
    );
    expect(message).toBe("Dados incompletos.");
  });

  it("traduz o código de erro conhecido", async () => {
    const message = await extractApiError(jsonResponse({ error: "RATE_LIMITED" }, 429), "fallback");
    expect(message).toContain("Muitas tentativas");
  });

  it("usa o status quando o corpo não traz nada aproveitável", async () => {
    expect(await extractApiError(new Response("", { status: 429 }), "fallback")).toContain(
      "Muitas tentativas",
    );
    expect(await extractApiError(new Response("", { status: 401 }), "fallback")).toContain(
      "sessão expirou",
    );
  });

  it("cai no fallback com corpo vazio e status desconhecido", async () => {
    const message = await extractApiError(new Response("", { status: 500 }), "Erro genérico.");
    expect(message).toBe("Erro genérico.");
  });

  it("cai no fallback quando o corpo não é JSON válido", async () => {
    const message = await extractApiError(new Response("<html>erro</html>", { status: 502 }), "Erro genérico.");
    expect(message).toBe("Erro genérico.");
  });
});
