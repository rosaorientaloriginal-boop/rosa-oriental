// api/dashboard-data.js
// Endpoint que o dashboard.html chama pra ler os dados ao vivo da Airtable.
// A chave da Airtable fica so aqui no servidor (nunca exposta no navegador).

const AIRTABLE_BASE_ID = "appWf5RAkNZSWq0cO";
const TABLE_GASTOS = "tblGboijBMcKRoX1R";
const TABLE_VENDAS = "tblS8P4XM4HZnauzK";

async function fetchAllRecords(tableId, apiKey) {
  let records = [];
  let offset;
  do {
    const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${tableId}${
      offset ? `?offset=${offset}` : ""
  }`;
    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
  const j = await r.json();
  if (j.error) throw new Error(JSON.stringify(j.error));
  records = records.concat(j.records);
  offset = j.offset;
} while (offset);
return records;
}

export default async function handler(req, res) {
  try {
    const apiKey = process.env.AIRTABLE_API_KEY;

    const [gastos, vendas] = await Promise.all([
      fetchAllRecords(TABLE_GASTOS, apiKey),
      fetchAllRecords(TABLE_VENDAS, apiKey),
      ]);

    const porCriativo = {};

    for (const r of gastos) {
      const f = r.fields;
      const nome = f["Criativo"] || "Sem nome";
      if (!porCriativo[nome]) {
        porCriativo[nome] = { nome, gasto: 0, leads: 0, dias: [], vendasCount: 0, faturamento: 0 };
      }
      porCriativo[nome].gasto += f["Gasto"] || 0;
      porCriativo[nome].leads += f["Leads"] || 0;
      porCriativo[nome].dias.push({
        dia: f["Data"] || null,
        gasto: f["Gasto"] || 0,
        leads: f["Leads"] || 0,
      });
    }

    for (const r of vendas) {
      const f = r.fields;
      const nome = f["Criativo"] || "Sem nome";
      if (!porCriativo[nome]) {
        porCriativo[nome] = { nome, gasto: 0, leads: 0, dias: [], vendasCount: 0, faturamento: 0 };
      }
      porCriativo[nome].vendasCount += 1;
      porCriativo[nome].faturamento += f["Valor"] || 0;
    }

    Object.values(porCriativo).forEach((c) => {
      c.dias.sort((a, b) => (a.dia || "").localeCompare(b.dia || ""));
    });

    const totals = {
      gasto: 0,
      leads: 0,
      vendasCount: vendas.length,
      faturamento: 0,
    };
    Object.values(porCriativo).forEach((c) => {
      totals.gasto += c.gasto;
      totals.leads += c.leads;
      totals.faturamento += c.faturamento;
    });

    res.setHeader("Cache-Control", "s-maxage=60, stale-while-revalidate");
    return res.status(200).json({
      status: "ok",
      totals,
      criativos: Object.values(porCriativo).sort((a, b) => b.gasto - a.gasto),
      atualizadoEm: new Date().toISOString(),
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ status: "error", message: err.message });
  }
}
