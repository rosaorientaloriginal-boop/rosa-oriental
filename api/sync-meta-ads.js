// api/sync-meta-ads.js
// Roda 1x por dia via Vercel Cron (ver vercel.json).
// Puxa o gasto e leads de cada anuncio do dia anterior direto do Meta Marketing API
// e grava na tabela "Gastos Diarios" da Airtable. Zero digitacao manual.

const AIRTABLE_BASE_ID = "appWf5RAkNZSWq0cO";
const AIRTABLE_TABLE_GASTOS = "tblGboijBMcKRoX1R";
const FIELD_DATA = "flda9Pqf2Xw0Rwc34";
const FIELD_CRIATIVO = "fldZjDgrjTn9bWxhW";
const FIELD_GASTO = "fldQeWPuMdgv58wMg";
const FIELD_LEADS = "fldto6rcHQBD6Ll9q";

// Regra de normalizacao de nome de criativo (confirmada com o Roger):
// - Ignora sufixo "-JAE"
// - Ignora prefixo de data tipo "09/07 - "
// - "MARCELO PROMO 3-5" e "MARCELO PROMO 6-12" sao criativos DIFERENTES, mantem como estao
function normalizeCriativo(adOrCampaignName) {
let name = adOrCampaignName
.replace(/^\d{2}\/\d{2}\s*-\s*/, "")
.replace(/-JAE$/i, "")
.trim();
return name;
}

async function fetchMetaInsights(dateStr) {
const token = process.env.META_ACCESS_TOKEN;
const adAccountId = process.env.META_AD_ACCOUNT_ID;
const url = `https://graph.facebook.com/v20.0/act_${adAccountId}/insights` +
`?level=campaign&fields=campaign_name,spend,actions` +
`&time_range={"since":"${dateStr}","until":"${dateStr}"}` +
`&access_token=${token}`;

const res = await fetch(url);
const json = await res.json();
if (json.error) {
throw new Error(`Meta API error: ${json.error.message}`);
}
return json.data || [];
}

function extractLeads(actions) {
if (!actions) return 0;
const conv = actions.find(
(a) => a.action_type === "onsite_conversion.messaging_conversation_started_7d"
);
return conv ? parseInt(conv.value, 10) : 0;
}

async function writeToAirtable(records) {
const apiKey = process.env.AIRTABLE_API_KEY;
const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_GASTOS}`;

const res = await fetch(url, {
method: "POST",
headers: {
Authorization: `Bearer ${apiKey}`,
"Content-Type": "application/json",
},
body: JSON.stringify({ records }),
});
const json = await res.json();
if (json.error) {
throw new Error(`Airtable error: ${JSON.stringify(json.error)}`);
}
return json;
}

export default async function handler(req, res) {
try {
const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
const dateStr = yesterday.toISOString().split("T")[0];

const insights = await fetchMetaInsights(dateStr);

const records = insights
.filter((row) => parseFloat(row.spend || "0") > 0)
.map((row) => ({
fields: {
[FIELD_DATA]: dateStr,
[FIELD_CRIATIVO]: normalizeCriativo(row.campaign_name),
[FIELD_GASTO]: parseFloat(row.spend),
[FIELD_LEADS]: extractLeads(row.actions),
},
}));

if (records.length === 0) {
return res.status(200).json({ status: "ok", message: "Sem gasto no dia", date: dateStr });
}

const result = await writeToAirtable(records);
return res.status(200).json({ status: "ok", date: dateStr, criados: result.records.length });
} catch (err) {
console.error(err);
return res.status(500).json({ status: "error", message: err.message });
}
}
