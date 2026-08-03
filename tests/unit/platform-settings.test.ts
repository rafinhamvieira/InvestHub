import { describe, expect, it } from "vitest";
import {
  PLATFORM_SETTINGS,
  PLATFORM_SETTING_KEYS,
  isPlatformSettingKey,
  validateSetting,
} from "@/config/platform-settings";

describe("registro de parâmetros", () => {
  it("todo parâmetro tem rótulo, descrição, unidade e faixa coerente", () => {
    for (const key of PLATFORM_SETTING_KEYS) {
      const spec = PLATFORM_SETTINGS[key];

      expect(spec.label).toBeTruthy();
      expect(spec.description.length).toBeGreaterThan(40);
      expect(spec.unit).toBeTruthy();
      expect(spec.min).toBeLessThanOrEqual(spec.max);
    }
  });

  it("o padrão de cada parâmetro cabe na própria faixa", () => {
    // Padrão fora da faixa deixaria a tela num estado que ela mesma recusa salvar — e o
    // valor viria do `.env`, então bastaria alguém escrever um número absurdo lá.
    for (const key of PLATFORM_SETTING_KEYS) {
      const spec = PLATFORM_SETTINGS[key];

      expect(validateSetting(key, spec.fallback)).toBeNull();
    }
  });

  it("reconhece só as chaves do registro", () => {
    expect(isPlatformSettingKey("stepUpTtlSeconds")).toBe(true);
    expect(isPlatformSettingKey("authSecret")).toBe(false);
    expect(isPlatformSettingKey("")).toBe(false);
  });
});

describe("validação de valor", () => {
  it("recusa chave desconhecida", () => {
    // O campo vem do navegador; nada impede alguém de inventar uma chave na requisição.
    expect(validateSetting("databaseUrl", 1)?.reason).toBe("UNKNOWN_KEY");
  });

  it("recusa valor não inteiro", () => {
    expect(validateSetting("syncStaleHours", 2.5)?.reason).toBe("NOT_INTEGER");
    expect(validateSetting("syncStaleHours", Number.NaN)?.reason).toBe("NOT_INTEGER");
  });

  it("recusa valor fora da faixa, nas duas pontas", () => {
    const spec = PLATFORM_SETTINGS.fundamentalsPerCycle;

    expect(validateSetting("fundamentalsPerCycle", spec.min - 1)?.reason).toBe("OUT_OF_RANGE");
    expect(validateSetting("fundamentalsPerCycle", spec.max + 1)?.reason).toBe("OUT_OF_RANGE");
  });

  it("aceita os extremos da faixa", () => {
    const spec = PLATFORM_SETTINGS.fundamentalsPerCycle;

    expect(validateSetting("fundamentalsPerCycle", spec.min)).toBeNull();
    expect(validateSetting("fundamentalsPerCycle", spec.max)).toBeNull();
  });

  it("a janela do step-up não passa de uma hora", () => {
    // É o parâmetro mais sensível da lista: janela longa aproxima o painel de não ter
    // step-up nenhum, e um token roubado de manhã valeria o dia inteiro.
    expect(PLATFORM_SETTINGS.stepUpTtlSeconds.max).toBeLessThanOrEqual(3600);
    expect(validateSetting("stepUpTtlSeconds", 86400)?.reason).toBe("OUT_OF_RANGE");
  });

  it("a cota de fundamentos não pode ser esticada a ponto de estourar o plano em uma rodada", () => {
    expect(validateSetting("fundamentalsPerCycle", 500)?.reason).toBe("OUT_OF_RANGE");
  });

  it("a mensagem de recusa diz o limite, não só que recusou", () => {
    const violation = validateSetting("syncFailureThreshold", 999);

    expect(violation?.message).toContain("1");
    expect(violation?.message).toContain("20");
  });
});
