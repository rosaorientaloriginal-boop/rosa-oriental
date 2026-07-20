// api/whatsapp-sale.js
// O Typebot chama esse endpoint no momento em que uma venda fecha no WhatsApp.
// Ele faz DUAS coisas ao mesmo tempo:
// 1. Grava a venda na tabela "Vendas" da Airtable (fim do "me manda que eu digito")
// 2. Dispara o evento de Purchase pro Meta via Conversions API (conserta o pixel de vez,
// nao depende do navegador da cliente, so do seu servidor)
//
// Espera um POST com JSON:
// { nome, telefone, tratamento, formaPagamento, tipoVenda, criativo, valor, codigoRastreio }

import crypto from "crypto";

const AIRTABLE_BASE_ID = "appWf5RAkNZSWq0cO";
const AIRTABLE_TABLE_VENDAS = "tblS8P4XM4HZnauzK";

const FIELD_NOME = "fld9NhfaLjHOoEkew";
const FIELD_DATA = "fldlEeF0i05iUtA5X";
const FIELD_TRATAMENTO = "fldxmUCB2oXAWUzbR";
const FIELD_TELEFONE = "flddxKeSfkr07Y9To";
const FIELD_PAGAMENTO = "fldpEhJbQm8Zgn1OJ";
const FIELD_TIPO_VENDA = "fldpWEVObLDvUNo8d";
const FIELD_CRIATIVO = "fld1FaO68o8uHAd8i";
const FIELD_VALOR = "fld2ddoqL5YXj0GpZ";
const FIELD_RASTREIO = "fldQnLrKqoFh1kNbF";

function hashSha256(value) {
  return crypto.createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

async function gravarNaAirtable(venda) {
  const apiKey = process.env.AIRTABLE_API_KEY;
  const url = `https://api.airtable.com/v0/${AIRTABLE_BASE_ID}/${AIRTABLE_TABLE_VENDAS}`;

const res = await fetch(url, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    records: [
      {
        fields: {
          [FIELD_NOME]: venda.nome,
          [FIELD_DATA]: new Date().toISOString().split("T")[0],
          [FIELD_TRATAMENTO]: venda.tratamento,
          [FIELD_TELEFONE]: venda.telefone,
          [FIELD_PAGAMENTO]: venda.formaPagamento,
          [FIELD_TIPO_VENDA]: venda.tipoVenda,
          [FIELD_CRIATIVO]: venda.criativo,
          [FIELD_VALOR]: venda.valor,
          [FIELD_RASTREIO]: venda.codigoRastreio || "",
        },
      },
      ],
  }),
});
  const json = await res.json();
  if (json.error) throw new Error(`Airtable error: ${JSON.stringify(json.error)}`);
  return json;
}

async function dispararConversionsAPI(venda) {
  const pixelId = process.env.META_PIXEL_ID;
  const token = process.env.META_ACCESS_TOKEN;
  const url = `https://graph.facebook.com/v20.0/${pixelId}/events?access_token=${token}`;

const body = {
  data: [
    {
      event_name: "Purchase",
      event_time: Math.floor(Date.now() / 1000),
      action_source: "chat",
      user_data: {
        ph: [hashSha256(venda.telefone.replace(/\D/g, ""))],
      },
      custom_data: {
        value: venda.valor,
        currency: "BRL",
      },
    },
    ],
};

const res = await fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});
  return res.json();
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ status: "error", message: "Use POST" });
  }

try {
  const venda = req.body;

  if (!venda.nome || !venda.telefone || !venda.valor) {
    return res.status(400).json({ status: "error", message: "Faltam campos obrigatorios" });
  }

  const [airtableResult, metaResult] = await Promise.all([
    gravarNaAirtable(venda),
    dispararConversionsAPI(venda),
    ]);

  return res.status(200).json({ status: "ok", airtable: airtableResult, meta: metaResult });
} catch (err) {
  console.error(err);
  return res.status(500).json({ status: "error", message: err.message });
}
}
