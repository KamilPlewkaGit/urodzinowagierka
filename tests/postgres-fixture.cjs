// Serve Neon-shaped HTTP responses from an isolated PostgreSQL engine for integration tests.
const { PGlite } = require("@electric-sql/pglite");
const database = new PGlite();
const upstream = globalThis.fetch;
const rawTypes = Object.fromEntries([16, 20, 21, 23, 25, 114, 1043, 1114, 1184, 1700, 2950, 3802].map((oid) => [oid, (value) => value]));

if (process.send) {
  process.on("message", async ({ query, params }) => {
    try {
      const { rows } = await database.query(query, params);
      process.send({ rows });
    } catch (error) {
      process.send({ error: error.message });
    }
  });
}

globalThis.fetch = async function (input, options) {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  if (url !== "https://api.invalid/sql") return upstream(input, options);
  const request = JSON.parse(options.body);
  async function execute(connection, { query, params }) {
    const result = await connection.query(query, params, { rowMode: "array", parsers: rawTypes });
    return { rows: result.rows, fields: result.fields, rowCount: result.affectedRows };
  }
  try {
    if (!request.queries) return Response.json(await execute(database, request));
    const results = await database.transaction(async (transaction) => {
      const records = [];
      for (const query of request.queries) records.push(await execute(transaction, query));
      return records;
    });
    return Response.json({ results });
  } catch (error) {
    console.error("Błąd SQL w bazie testowej:", error.message);
    return Response.json({ message: error.message, code: error.code, detail: error.detail }, { status: 400 });
  }
};
