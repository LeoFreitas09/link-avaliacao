// Abre o Place ID Finder do Google, digita o nome, escolhe o resultado e lê o Place ID.
import { chromium } from "playwright";
import fs from "node:fs";

const DEMO_URLS = [
  process.env.DEMO_URL,
  "https://maps-docs-team.web.app/samples/places-placeid-finder/dist/",
  "https://developers.google.com/maps/documentation/javascript/examples/places-placeid-finder",
].filter(Boolean);

const REVIEW_BASE = "https://search.google.com/local/writereview?placeid=";
const names = (process.env.NAMES || process.argv.slice(2).join("\n"))
  .split("\n").map((s) => s.trim()).filter(Boolean);
const pick = Math.max(1, parseInt(process.env.PICK || "1", 10) || 1);
const headless = process.env.HEADED !== "1";

if (!names.length) {
  console.error("Informe pelo menos um nome de estabelecimento.");
  process.exit(2);
}

fs.mkdirSync("out", { recursive: true });

// Procura a página/iframe que contém a caixa de busca do Google.
async function findContext(page, timeoutMs = 30000) {
  const end = Date.now() + timeoutMs;
  while (Date.now() < end) {
    for (const f of page.frames()) {
      try {
        if (await f.locator("gmp-place-autocomplete").count()) return f;
      } catch { /* frame ainda carregando */ }
    }
    await page.waitForTimeout(500);
  }
  return null;
}

async function lookup(browser, name, idx) {
  const context = await browser.newContext({ locale: "pt-BR", viewport: { width: 1200, height: 800 } });
  const page = await context.newPage();
  try {
    let ctx = null;
    for (const url of DEMO_URLS) {
      try {
        await page.goto(url, { waitUntil: "domcontentloaded", timeout: 45000 });
        ctx = await findContext(page);
        if (ctx) break;
      } catch (e) {
        console.log(`  (não abriu ${url}: ${e.message.split("\n")[0]})`);
      }
    }
    if (!ctx) throw new Error("Não encontrei a caixa de busca do Google na página.");

    // Etapa 2: digitar o nome na caixa de busca
    const input = ctx.locator("gmp-place-autocomplete input").first();
    await input.waitFor({ state: "visible", timeout: 30000 });
    await input.click();
    await input.pressSequentially(name, { delay: 70 });

    // Etapa 3: esperar as sugestões e listar
    const options = ctx.locator('gmp-place-autocomplete [role="option"]');
    let suggestions = [];
    try {
      await options.first().waitFor({ state: "visible", timeout: 8000 });
      suggestions = (await options.allInnerTexts()).map((t) => t.replace(/\s+/g, " ").trim());
    } catch {
      await page.waitForTimeout(3000); // se a lista não for acessível, segue pelo teclado
    }
    if (suggestions.length) console.log(`  sugestões: ${suggestions.map((s, i) => `${i + 1}) ${s}`).join(" | ")}`);

    // Seleciona o resultado escolhido (padrão: 1º)
    for (let i = 0; i < pick; i++) await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");

    // Etapa 4: ler o Place ID que aparece no balão
    await ctx.waitForFunction(() => {
      const el = document.querySelector("#place-id");
      return el && el.textContent && el.textContent.trim().length > 5;
    }, null, { timeout: 20000 });

    const read = (sel) => ctx.locator(sel).first().innerText().then((t) => t.trim()).catch(() => "");
    const placeId = await read("#place-id");
    const placeName = await read("#place-name");
    const address = await read("#place-address");
    return { ok: true, query: name, placeId, placeName, address, suggestions, link: REVIEW_BASE + placeId };
  } catch (e) {
    await page.screenshot({ path: `out/erro-${idx + 1}.png`, fullPage: true }).catch(() => {});
    return { ok: false, query: name, error: e.message.split("\n")[0] };
  } finally {
    await context.close();
  }
}

const browser = await chromium.launch({ headless });
const results = [];
for (const [i, name] of names.entries()) {
  console.log(`[${i + 1}/${names.length}] ${name}`);
  const r = await lookup(browser, name, i);
  console.log(r.ok ? `  ✔ ${r.placeName} — ${r.address}\n  ${r.link}` : `  ✘ ${r.error}`);
  results.push(r);
}
await browser.close();

fs.writeFileSync("out/resultados.json", JSON.stringify(results, null, 2));

// Resumo que aparece na página do GitHub Actions
const esc = (s = "") => s.replace(/\|/g, "\\|");
let md = "## Links de avaliação do Google\n\n";
for (const r of results) {
  if (r.ok) {
    md += `### ${esc(r.placeName || r.query)}\n${esc(r.address)}\n\n`;
    md += `**Place ID:** \`${r.placeId}\`\n\n**Link:**\n\n\`\`\`\n${r.link}\n\`\`\`\n\n[Testar link](${r.link})\n\n`;
    if (r.suggestions.length > 1) {
      md += `<details><summary>Outros resultados da busca</summary>\n\n` +
        r.suggestions.map((s, i) => `${i + 1}. ${s}${i + 1 === pick ? " ← escolhido" : ""}`).join("\n") +
        `\n\nNão era esse? Rode de novo com o campo **Qual resultado usar** = 2, 3…\n</details>\n\n`;
    }
  } else {
    md += `### ❌ ${esc(r.query)}\n${esc(r.error)}\n\n`;
  }
}
fs.writeFileSync("out/resumo.md", md);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);

process.exit(results.every((r) => r.ok) ? 0 : 1);
