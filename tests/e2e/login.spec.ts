import { test, expect } from "@playwright/test";

test("página de login renderiza o formulário", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "Entrar" })).toBeVisible();
  await expect(page.getByLabel("E-mail")).toBeVisible();
  await expect(page.getByLabel("Senha")).toBeVisible();
});

test("link para cadastro está presente", async ({ page }) => {
  await page.goto("/login");
  await page.getByRole("link", { name: "Cadastre-se" }).click();
  await expect(page).toHaveURL(/register/);
});
