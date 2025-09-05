import express from "express";
import bodyParser from "body-parser";
import pg from "pg";
import dotenv from "dotenv"
import fetch from "node-fetch";

dotenv.config();

const db = new pg.Client({
  user: process.env.USER_SERVER,
  host: process.env.HOST_SERVER,
  database: process.env.DATABASE_SERVER,
  password: process.env.PASSWORD_SERVER,
  port: process.env.PORT_SERVER,
});
db.connect();

const app = express();
const port = 3000;
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));
app.use(express.json());


app.set('view engine', 'ejs');

function definirCor(rating) {
  const ratingsVerde = ["A+", "A", "A-", "B+", "B"];
  const ratingsAmarelo = ["B-", "C", "C+"];
  const ratingsVermelho = ["C-", "D+", "D", "D-"];

  if (ratingsVerde.includes(rating)) return "green";
  if (ratingsAmarelo.includes(rating)) return "yellow";
  if (ratingsVermelho.includes(rating)) return "red";

  return "";
}

app.get("/", async (req, res) => {
  try {
    const resultado = await db.query(
      "SELECT empresa, rating, id FROM empresas WHERE id >= $1 ORDER BY id ASC LIMIT 6",
      [5001]
    );

    const empresas = resultado.rows.map(empresa => ({
      ...empresa,
      cor: definirCor(empresa.rating)
    }));

    res.render("empresas", { empresas });
  } catch (erro) {
    console.error(erro);
    res.status(500).send("Erro ao buscar empresas");
  }
});

app.get("/analise", async (req, res) => {
  const id = req.query.id;
  if (!id) return res.status(400).send("ID não fornecido");

  try {
    const resultado = await db.query("SELECT * FROM empresas WHERE id = $1", [id]);
    if (resultado.rows.length === 0) {
      return res.status(404).send("Empresa não encontrada");
    }
    const empresa = resultado.rows[0];

    res.render("analise", { empresa });
  } catch (erro) {
    console.error("Erro ao carregar a página de análise:", erro);
    res.status(500).send("Erro ao buscar dados da empresa");
  }
});


app.get("/api/pesquisar", async (req, res) => {
  const termo = req.query.q;
  try {
    const resultado = await db.query(
      "SELECT empresa, rating, id FROM empresas WHERE empresa ILIKE $1 OR CAST(id AS TEXT) = $2 LIMIT 10",
      [`%${termo}%`, termo]
    );
    res.json(resultado.rows);
  } catch (erro) {
    res.status(500).json({ erro: "Erro ao pesquisar empresas" });
  }
});

app.get("/api/sugestao/:id", async (req, res) => {
  const { id } = req.params;

  try {

    const analiseExistente = await db.query(
      `SELECT id, analise, valor_sugerido, taxa_juros, prazo_pagamento, sugestao_justificativa 
       FROM analises 
       WHERE empresa_id = $1 
       ORDER BY id DESC 
       LIMIT 1`,
      [id]
    );


    if (analiseExistente.rows.length > 0 && analiseExistente.rows[0].valor_sugerido) {
      console.log(`Sugestão completa encontrada no cache do DB para a empresa ID: ${id}`);
      const sugestaoCache = analiseExistente.rows[0];

      return res.status(200).json({
        valor_sugerido: Number(sugestaoCache.valor_sugerido),
        taxa_juros: parseFloat(sugestaoCache.taxa_juros),
        prazo_pagamento: parseInt(sugestaoCache.prazo_pagamento, 10),
        justificativa: sugestaoCache.sugestao_justificativa
      });
    }


    console.log(`Nenhuma sugestão no DB. Gerando uma nova para a empresa ID: ${id}`);


    const resultadoDB = await db.query("SELECT * FROM empresas WHERE id = $1", [id]);
    if (resultadoDB.rows.length === 0) {
      return res.status(404).json({ erro: "Empresa não encontrada." });
    }
    const dadosEmpresa = resultadoDB.rows[0];

    let analise;
    let analiseId;


    if (analiseExistente.rows.length > 0) {
      analise = analiseExistente.rows[0].analise;
      analiseId = analiseExistente.rows[0].id;
    } else {

      const respostaPythonAnalise = await fetch("http://localhost:5001/analisar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(dadosEmpresa)
      });
      if (!respostaPythonAnalise.ok) throw new Error("Falha ao gerar análise inicial.");

      const analiseJSON = await respostaPythonAnalise.json();
      analise = analiseJSON.analise;


      const novaAnaliseResult = await db.query(
        "INSERT INTO analises (empresa_id, analise) VALUES ($1, $2) RETURNING id",
        [id, analise]
      );
      analiseId = novaAnaliseResult.rows[0].id;
    }

    if (!analise) {
      return res.status(500).json({ erro: "Não foi possível obter a análise para gerar a sugestão." });
    }


    const respostaPythonSugestao = await fetch("http://localhost:5001/sugerir_credito", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        analise: analise,
        dados_empresa: dadosEmpresa
      })
    });

    if (!respostaPythonSugestao.ok) {
      const erroTexto = await respostaPythonSugestao.text();
      throw new Error(`Erro na API Python de sugestão: ${erroTexto}`);
    }

    const sugestao = await respostaPythonSugestao.json();


    await db.query(
      `UPDATE analises 
         SET valor_sugerido = $1, taxa_juros = $2, prazo_pagamento = $3, sugestao_justificativa = $4
         WHERE id = $5`,
      [sugestao.valor_sugerido, sugestao.taxa_juros, sugestao.prazo_pagamento, sugestao.justificativa, analiseId]
    );
    console.log(`Nova sugestão e justificativa para a empresa ID ${id} foram salvas no DB.`);

    res.status(200).json(sugestao);

  } catch (erro) {
    console.error("Erro ao gerar sugestão de crédito:", erro);
    res.status(500).json({ erro: "Ocorreu um erro interno ao gerar a sugestão." });
  }
});


app.get("/api/analise/:id", async (req, res) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({ erro: "ID da empresa não fornecido." });
  }

  try {
    const analiseExistente = await db.query(
      "SELECT analise FROM analises WHERE empresa_id = $1 ORDER BY id DESC LIMIT 1",
      [id]
    );

    if (analiseExistente.rows.length > 0) {
      console.log(`Análise encontrada no cache do DB para a empresa ID: ${id}`);
      return res.status(200).json({
        analise: analiseExistente.rows[0].analise
      });
    }

    console.log(`Nenhuma análise no DB. Gerando uma nova para a empresa ID: ${id}`);
    const resultadoDB = await db.query("SELECT * FROM empresas WHERE id = $1", [id]);

    if (resultadoDB.rows.length === 0) {
      return res.status(404).json({ erro: "Empresa não encontrada." });
    }
    const dadosEmpresa = resultadoDB.rows[0];

    const respostaPython = await fetch("http://localhost:5001/analisar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(dadosEmpresa)
    });

    if (!respostaPython.ok) {
      const erroTexto = await respostaPython.text();
      throw new Error(`Erro na API Python: ${erroTexto}`);
    }

    const analiseJSON = await respostaPython.json();
    const novaAnaliseTexto = analiseJSON.analise || "Não foi possível obter a análise.";

    if (analiseJSON.analise) {
      await db.query(
        "INSERT INTO analises (empresa_id, analise) VALUES ($1, $2)",
        [id, novaAnaliseTexto]
      );
      console.log(`Nova análise para a empresa ID ${id} foi salva no DB.`);
    }

    res.status(200).json({
      analise: novaAnaliseTexto
    });

  } catch (erro) {
    console.error("Erro ao processar a análise via API:", erro);
    res.status(500).json({ erro: "Ocorreu um erro interno ao processar a análise." });
  }
});

app.put("/api/analise/:id", async (req, res) => {
  const { id } = req.params;

  if (!id) {
    return res.status(400).json({ erro: "ID da empresa não fornecido." });
  }

  try {
    console.log(`Forçando nova análise para a empresa ID: ${id}`);

    const resultadoDB = await db.query("SELECT * FROM empresas WHERE id = $1", [id]);
    if (resultadoDB.rows.length === 0) {
      return res.status(404).json({ erro: "Empresa não encontrada." });
    }
    const dadosEmpresa = resultadoDB.rows[0];

    const respostaPython = await fetch("http://localhost:5001/analisar", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(dadosEmpresa)
    });

    if (!respostaPython.ok) {
      const erroTexto = await respostaPython.text();
      throw new Error(`Erro na API Python: ${erroTexto}`);
    }

    const analiseJSON = await respostaPython.json();
    const novaAnaliseTexto = analiseJSON.analise || "Não foi possível obter a análise.";

    const upsertQuery = `
        INSERT INTO analises (empresa_id, analise)
        VALUES ($1, $2)
        ON CONFLICT (empresa_id) 
        DO UPDATE SET 
            analise = EXCLUDED.analise;
    `;

    await db.query(upsertQuery, [id, novaAnaliseTexto]);
    console.log(`Análise para a empresa ID ${id} foi atualizada no DB.`);

    res.status(200).json({
      analise: novaAnaliseTexto
    });

  } catch (erro) {
    console.error("Erro ao forçar a análise via API:", erro);
    res.status(500).json({ erro: "Ocorreu um erro interno ao processar a análise." });
  }
});

app.put("/api/sugestao/:id", async (req, res) => {
  const { id } = req.params;
  try {
    console.log(`Forçando nova sugestão para a empresa ID: ${id}`);


    const resultadoDB = await db.query("SELECT * FROM empresas WHERE id = $1", [id]);
    if (resultadoDB.rows.length === 0) {
      return res.status(404).json({ erro: "Empresa não encontrada." });
    }
    const dadosEmpresa = resultadoDB.rows[0];

    const resultadoAnalise = await db.query("SELECT analise FROM analises WHERE empresa_id = $1 ORDER BY id DESC LIMIT 1", [id]);
    const analiseTexto = resultadoAnalise.rows.length > 0 ? resultadoAnalise.rows[0].analise : "Não foi encontrada análise prévia.";

    const respostaPythonSugestao = await fetch("http://localhost:5001/sugerir_credito", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        analise: analiseTexto,
        dados_empresa: dadosEmpresa
      })
    });

    if (!respostaPythonSugestao.ok) { }
    const sugestao = await respostaPythonSugestao.json();

    await db.query(
      `UPDATE analises SET valor_sugerido = $1, taxa_juros = $2, prazo_pagamento = $3, sugestao_justificativa = $4
       WHERE id = (SELECT id FROM analises WHERE empresa_id = $5 ORDER BY id DESC LIMIT 1)`,
      [sugestao.valor_sugerido, sugestao.taxa_juros, sugestao.prazo_pagamento, sugestao.justificativa, id]
    );

    console.log(`Nova sugestão para a empresa ID ${id} foi salva no DB.`);
    res.status(200).json(sugestao);

  } catch (erro) {
    console.error("Erro ao forçar nova sugestão:", erro);
    res.status(500).json({ erro: "Ocorreu um erro interno." });
  }
});

app.post("/api/decisao/:id", async (req, res) => {
  const { id } = req.params;
  const { decisao, valor, taxa, prazo } = req.body;

  if (!decisao) {
    return res.status(400).json({ erro: "Decisão não fornecida." });
  }

  try {
    if (decisao === 'Aprovado') {
      const valorNumerico = parseFloat(valor.replace(/[^\d,]/g, '').replace('.', '').replace(',', '.'));
      const taxaNumerica = parseFloat(taxa.replace(/[^\d.,]/g, '').replace(',', '.'));
      const prazoNumerico = parseInt(prazo);

      await db.query(
        `UPDATE empresas 
         SET status = $1, valor_aprovado = $2, taxa_aprovada = $3, prazo_aprovado = $4 
         WHERE id = $5`,
        ['Aprovado', valorNumerico, taxaNumerica, prazoNumerico, id]
      );
      console.log(`Crédito APROVADO para empresa ID ${id}`);
      res.status(200).json({ mensagem: "Crédito aprovado com sucesso!" });

    } else if (decisao === 'Recusado') {
      await db.query(
        `UPDATE empresas SET status = $1, valor_aprovado = NULL, taxa_aprovada = NULL, prazo_aprovado = NULL WHERE id = $2`,
        ['Recusado', id]
      );
      console.log(`Crédito RECUSADO para empresa ID ${id}`);
      res.status(200).json({ mensagem: "Crédito recusado com sucesso!" });

    } else {
      res.status(400).json({ erro: "Decisão inválida." });
    }
  } catch (erro) {
    console.error("Erro ao salvar decisão:", erro);
    res.status(500).json({ erro: "Ocorreu um erro interno ao salvar a decisão." });
  }
});

app.listen(port, () => console.log(`Servidor rodando na porta ${port}`));

