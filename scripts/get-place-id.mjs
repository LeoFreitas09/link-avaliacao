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

    // A caixa de busca e o balão ficam em shadow DOM fechado: não dá para usar seletores lá dentro.
    // Escutamos o mesmo evento que a página usa (gmp-select), que já traz o Place ID escolhido.
    const box = ctx.locator("gmp-place-autocomplete").first();
    await box.waitFor({ state: "visible", timeout: 30000 });
    await box.evaluate((el) => {
      window.__placeSel = null;
      el.addEventListener("gmp-select", ({ placePrediction: p }) => {
        window.__placeSel = { id: p.placeId, name: p.mainText?.text || "", address: p.secondaryText?.text || "" };
      });
    });

    // O campo de texto interno é montado alguns segundos depois do elemento aparecer.
    // Esperamos ele surgir na árvore de acessibilidade e focamos direto nele.
    const cdp = await context.newCDPSession(page);
    const axNodes = async (role) => (await cdp.send("Accessibility.getFullAXTree")).nodes
      .filter((n) => n.role?.value === role && !n.ignored);
    let focused = false;
    for (const end = Date.now() + 30000; !focused && Date.now() < end; await page.waitForTimeout(500)) {
      const [field] = await axNodes("combobox").catch(() => []);
      if (field?.backendDOMNodeId) {
        focused = await cdp.send("DOM.focus", { backendNodeId: field.backendDOMNodeId }).then(() => true, () => false);
      }
    }
    if (!focused) await box.click(); // página em iframe: tenta pelo clique

    // Etapa 2: digitar o nome na caixa de busca
    await page.keyboard.type(name, { delay: 70 });

    // Etapa 3: esperar as sugestões e listar (lidas pela árvore de acessibilidade)
    let suggestions = [];
    try {
      const end = Date.now() + 8000;
      while (!suggestions.length && Date.now() < end) {
        await page.waitForTimeout(500);
        suggestions = (await axNodes("option"))
          .map((n) => (n.name?.value || "").replace(/\s+/g, " ").trim()).filter(Boolean);
      }
    } catch { /* lista indisponível, segue pelo teclado */ }
    if (!suggestions.length) await page.waitForTimeout(3000);
    if (suggestions.length) console.log(`  sugestões: ${suggestions.map((s, i) => `${i + 1}) ${s}`).join(" | ")}`);

    // Seleciona o resultado escolhido (padrão: 1º)
    for (let i = 0; i < pick; i++) await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");

    // Etapa 4: ler o Place ID do local selecionado
    await ctx.waitForFunction(() => window.__placeSel?.id, null, { timeout: 20000 });
    const { id: placeId, name: placeName, address } = await ctx.evaluate(() => window.__placeSel);
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
