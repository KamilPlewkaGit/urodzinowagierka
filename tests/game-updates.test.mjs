
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { createServer } from "node:net";
import { setTimeout } from "node:timers/promises";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const freePort = createServer().listen(0, "127.0.0.1");
await new Promise((resolve) => freePort.once("listening", resolve));
const { port } = freePort.address();
await new Promise((resolve) => freePort.close(resolve));
const origin = "http://127.0.0.1:" + port;
const fixture = fileURLToPath(new URL("./postgres-fixture.cjs", import.meta.url)).replaceAll("\\", "/");
const next = fileURLToPath(new URL("../node_modules/next/dist/bin/next", import.meta.url));

async function request(path, { cookie, body, status = 200, method = "GET" } = {}) {
  const headers = new Headers();
  if (cookie) headers.set("cookie", cookie);
  if (body !== undefined) headers.set("content-type", "application/json");
  const response = await fetch(origin + path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(10_000) });
  const expected = Array.isArray(status) ? status : [status];
  if (!expected.includes(response.status)) assert.fail(path + " (" + response.status + "): " + (await response.clone().text()).slice(0, 250));
  return response;
}

const post = (path, cookie, body, status) => request(path, { cookie, body, status, method: "POST" });
const cookieOf = (response) => response.headers.get("set-cookie").split(";")[0];
const units = (value) => {
  const [whole, fraction = ""] = String(value).split(".");
  return BigInt(whole + fraction.padEnd(4, "0"));
};
const total = (state) => units(state.totalTokens);
const balance = (state, player) => units(state.players.find(({ id }) => id === player.id).tokens);
const points = (state, team) => state.teamScores.find(({ teamId }) => teamId === team).points;
function assertPointChanges(before, after, changes = {}) {
  for (const { teamId } of before.teamScores) {
    assert.equal(points(after, teamId) - points(before, teamId), changes[teamId] ?? 0, teamId);
  }
}

test("Scenariusze gry w odizolowanej bazie PostgreSQL", { timeout: 120_000 }, async (t) => {
  const child = spawn(process.execPath, ["--require", fixture, next, "start", "-H", "127.0.0.1", "-p", String(port)], {
    env: { ...process.env, DATABASE_URL: "postgresql://fixture:fixture@local-fixture.invalid/game", OBSERVER_PASSWORD: "hasło-testowe-widowni" },
    stdio: ["ignore", "pipe", "pipe", "ipc"],
  });
  let log = "";
  for (const stream of [child.stdout, child.stderr]) stream.on("data", (data) => { log += data.toString(); });
  t.after(() => { child.kill(); if (log.includes("Błąd SQL")) console.error(log); });
  for (let attempt = 0; ; attempt++) {
    if (child.exitCode !== null || attempt === 50) assert.fail("Serwer testowy nie wystartował.\n" + log);
    if (await fetch(origin).then((r) => r.ok).catch(() => false)) break;
    await setTimeout(200);
  }

  const admin = cookieOf(await post("/api/admin/login", undefined, { password: "admin" }));
  async function fixtureQuery(query, params = []) {
    const response = once(child, "message");
    child.send({ query, params });
    const [{ rows, error }] = await response;
    assert.equal(error, undefined);
    return rows;
  }
  const status = async (cookie = admin) => (await request("/api/game/state", { cookie })).json();
  const setSegment = (segmentId) => post("/api/admin/game/segment", admin, { segmentId });
  const move = (segment, action, payload, expected, cookie = admin) => post("/api/segment/" + segment + "/" + action, cookie, payload, expected);
  async function command(segment, key, action, payload = {}, { cookie = admin, expected, revision } = {}) {
    revision ??= (await status(cookie))[key].revision;
    return post("/api/segment/" + segment, cookie, { revision, command: { action, ...payload } }, expected);
  }
  const teams = ["royal", "ruby", "emerald", "onyx"];
  const roster = Object.fromEntries(teams.map((team) => [team, []]));
  async function register(team) {
    const nickname = team + (roster[team].length + 1);
    const response = await post("/api/auth/register", undefined, { nickname, teamId: team }, 201);
    const { player } = await response.json();
    const entry = { ...player, cookie: cookieOf(response) };
    roster[team].push(entry);
    return entry;
  }

  await request("/api/game/state", { status: 401 });
  const empty = await status();
  await post("/api/auth/register", undefined, { nickname: " ObSeRwAtOr ", teamId: "royal" }, 400);
  await post("/api/auth/observer", undefined, { password: "obserwator" }, 401);
  const observer = cookieOf(await post("/api/auth/observer", undefined, { password: "hasło-testowe-widowni" }));
  await request("/api/game/state?widok=obserwator", { cookie: admin, status: 401 });
  const watching = await (await request("/api/game/state?widok=obserwator", { cookie: observer })).json();
  assert.deepEqual(watching.players, empty.players);
  assert.equal(total(watching), total(empty));
  const waiting = await request("/obserwator", { cookie: observer });
  assert.match(await waiting.text(), /Widok obserwatora/);
  assert.equal((await fetch(origin + "/obserwator", { redirect: "manual" })).status, 307);
  assert.equal((await fetch(origin + "/admin", { headers: { cookie: observer }, redirect: "manual" })).status, 307);
  assert.equal((await fetch(origin + "/lobby", { headers: { cookie: observer }, redirect: "manual" })).status, 307);
  await post("/api/game/start", observer, undefined, 403);
  await post("/api/admin/game/reset", observer, undefined, 403);
  await post("/api/admin/game/segment", observer, { segmentId: "the-floor" }, 403);
  await post("/api/admin/players/chips", observer, { playerId: 1, tokens: "500" }, 403);
  await command("gold-challenge", "goldChallenge", "number-vote", { number: 1 }, { cookie: observer, expected: 403 });
  await command("familiada", "familiada", "buzz", {}, { cookie: observer, expected: 403 });
  for (const team of teams) for (let index = 0; index < 5; index++) await register(team);
  await request("/lobby", { cookie: roster.royal[0].cookie });
  await request("/admin", { cookie: admin });
  await post("/api/game/start", admin);
  for (const segmentId of ["solenizant", "the-floor", "sport", "melodia", "pojedynki", "familiada", "gold-challenge", "alkoholicy", "finale"]) {
    await setSegment(segmentId);
    assert.equal((await status(observer)).game.activeSegment, segmentId);
    assert.match(await (await request("/obserwator", { cookie: observer })).text(), new RegExp('data-segment="' + segmentId + '"'));
    await request("/lobby", { cookie: roster.royal[0].cookie });
    await request("/admin", { cookie: admin });
  }

  await t.test("The Floor – materiały, gotowość, zegar, prywatne odpowiedzi i rozliczenie", async () => {
    await setSegment("the-floor");
    const player = roster.emerald[0];
    const manifest = await (await request("/api/segment/floor/preload", { cookie: admin })).json();
    assert.deepEqual(manifest.issues, []);
    const observerManifest = await (await request("/api/segment/floor/preload", { cookie: observer })).json();
    assert.deepEqual(observerManifest.urls, manifest.urls);
    assert.deepEqual(observerManifest.labels, {});
    assert.equal(manifest.urls.length, new Set(manifest.urls).size);
    assert.equal(Object.values(manifest.labels).filter((label) => label.startsWith("Politycy")).length, 50);
    assert.equal(Object.values(manifest.labels).filter((label) => label.startsWith("Lokalne miejsca")).length, 49);
    assert.equal(Object.values(manifest.labels).filter((label) => label.startsWith("Loga")).length, 34);
    const logos = JSON.parse(await readFile("public/the floor/loga/logotypy_the_floor_poprawione_id.json", "utf8"));
    assert.equal(logos.count, 34);
    assert.equal(logos.items.length, logos.count);
    assert.ok(logos.items.every(({ answer }) => !["Dior", "Zara", "Porsche", "DHL"].includes(answer)));
    for (let start = 0; start < manifest.urls.length; start += 8) {
      await Promise.all(manifest.urls.slice(start, start + 8).map(async (url) => {
        const image = await request(url);
        assert.match(image.headers.get("content-type"), /^image\//);
        assert.match(image.headers.get("cache-control"), /immutable/);
        assert.ok((await image.arrayBuffer()).byteLength > 100, url);
      }));
    }
    await request("/the%20floor/politycy/politycy_the_floor.json", { status: 404 });
    const arithmetic = JSON.parse(await readFile("public/the floor/działania/The_Floor_DZIALANIA_100_z_obrazami.json", "utf8"));
    assert.equal(arithmetic.items.length, 100);
    for (const item of arithmetic.items) {
      const [, left, operator, right] = /^(\d+) (×|\+|−) (\d+)$/.exec(item.expression);
      const a = +left, b = +right;
      const answer = operator === "×" ? a * b : operator === "+" ? a + b : a - b;
      assert.equal(+item.answer, answer);
      assert.ok(answer >= 0 && (operator !== "×" || Math.max(a, b) <= 10));
    }
    const host = randomUUID(), remote = randomUUID(), disconnected = randomUUID();
    const report = (cookie, deviceId, decoded) => post("/api/segment/floor/preload", cookie, { deviceId, version: manifest.version, decoded, failed: [] });
    await post("/api/segment/floor/preload", observer, { deviceId: randomUUID(), version: manifest.version, decoded: 0, failed: [] }, 403);
    await report(player.cookie, remote, 0);
    await report(roster.onyx[4].cookie, disconnected, 0);
    await report(admin, host, manifest.urls.length);
    const before = await status();
    await move("floor", "start");
    assert.deepEqual((await status()).theFloor.duels.map((duel) => duel.categoryId), ["znajome-twarze", "lokalne-miejsca", "loga", "od-tylu", "dzialania", "rebusy", "politycy"]);
    await move("floor", "configure", { teamAId: "royal", teamBId: "ruby" });
    assert.equal(units((await status()).theFloor.currentDuel.betStake), 40000n);
    await move("floor", "bet", { targetTeamId: "royal" }, 403, observer);
    await move("floor", "bet", { targetTeamId: "royal" }, 409, roster.ruby[0].cookie);
    const undersupplied = roster.emerald[4];
    const setBalance = (tokens) => post("/api/admin/players/chips", admin, { playerId: undersupplied.id, tokens });
    await setBalance("3.9999");
    await move("floor", "bet", { targetTeamId: "royal" }, 409, undersupplied.cookie);
    await setBalance(before.players.find(({ id }) => id === undersupplied.id).tokens);
    const correctBettors = roster.emerald.slice(0, 4);
    const incorrectBettors = roster.onyx.slice(0, 2);
    for (const bettor of correctBettors) await move("floor", "bet", { targetTeamId: "royal" }, 200, bettor.cookie);
    for (const bettor of incorrectBettors) await move("floor", "bet", { targetTeamId: "ruby" }, 200, bettor.cookie);
    const reserved = await status();
    assert.equal(total(reserved) + 240000n, total(before));
    for (const bettor of [...correctBettors, ...incorrectBettors]) {
      assert.equal(balance(before, bettor), 1000000n);
      assert.equal(balance(reserved, bettor), 960000n);
    }
    assert.match(await (await request("/lobby?widok=segment", { cookie: undersupplied.cookie })).text(), /8 żetonów wypłaty/);
    await move("floor", "start-duel", { deviceId: host }, 409);
    await report(player.cookie, remote, manifest.urls.length);
    await post("/api/auth/logout", roster.onyx[4].cookie);
    const rejoin = await post("/api/auth/register", undefined, { nickname: roster.onyx[4].nickname, teamId: "onyx" });
    roster.onyx[4].cookie = cookieOf(rejoin);
    await move("floor", "start-duel", { deviceId: host });
    const first = (await status()).theFloor;
    const publicFirst = (await status(player.cookie)).theFloor;
    assert.equal(first.currentDuel.teamATimeSeconds, 45);
    assert.equal(publicFirst.currentDuel.activeTeamId, "royal");
    assert.equal(publicFirst.content.prompt.url, first.content.prompt.url);
    assert.equal(publicFirst.content.adminAnswer, undefined);
    assert.equal((await status(observer)).theFloor.content.adminAnswer, undefined);
    assert.equal((await status(observer)).theFloor.currentDuel.viewerBetTargetTeamId, null);
    assert.ok(first.content.adminAnswer);
    await move("floor", "advance", { action: "correct" });
    const second = (await status(player.cookie)).theFloor;
    assert.equal(second.currentDuel.activeTeamId, "ruby");
    assert.notEqual(second.content.prompt.url, first.content.prompt.url);
    for (let pass = 0; pass < 15 && (await status()).theFloor.stage === "live"; pass++) await move("floor", "advance", { action: "pass" });
    const finish = { eventId: first.currentDuel.id, winnerTeamId: "royal" };
    await move("floor", "end", finish);
    const after = await status();
    assert.deepEqual(after.teamScores, before.teamScores.map((score) => ({
      ...score, points: score.points + (score.teamId === "royal" ? 1 : 0),
    })));
    assert.deepEqual((await status(player.cookie)).teamScores, after.teamScores);
    assert.deepEqual((await status(observer)).teamScores, after.teamScores);
    assert.equal(total(after), total(before));
    for (const member of roster.ruby) assert.equal(balance(after, member) - balance(before, member), -32000n);
    for (const member of roster.royal) assert.equal(balance(after, member) - balance(before, member), 16000n);
    for (const bettor of correctBettors) {
      const snapshot = await status(bettor.cookie);
      assert.equal(balance(snapshot, bettor), 1040000n);
      assert.equal(units(snapshot.theFloor.currentDuel.viewerBetPayout), 80000n);
    }
    for (const bettor of incorrectBettors) {
      const snapshot = await status(bettor.cookie);
      assert.equal(balance(snapshot, bettor), 960000n);
      assert.equal(units(snapshot.theFloor.currentDuel.viewerBetPayout), 0n);
    }
    await move("floor", "end", finish, 409);
    for (let refresh = 0; refresh < 2; refresh++) {
      const page = await request("/lobby?widok=segment", { cookie: player.cookie });
      assert.match(await page.text(), /Otrzymujesz 8 żetonów/);
      const refreshed = await status(player.cookie);
      assert.deepEqual(refreshed.players, after.players);
      assert.deepEqual(refreshed.teamScores, after.teamScores);
    }

    for (const [categoryId, itemCount] of [["lokalne-miejsca", 49], ["loga", 34]]) {
      await move("floor", "next");
      await move("floor", "configure", { teamAId: "royal", teamBId: "ruby" });
      await report(admin, host, manifest.urls.length);
      await report(player.cookie, remote, manifest.urls.length);
      await move("floor", "start-duel", { deviceId: host });
      const duel = (await status()).theFloor;
      assert.equal(duel.currentDuel.categoryId, categoryId);
      assert.equal(duel.content.itemCount, itemCount);
      assert.equal(duel.content.prompt.kind, "image");
      assert.ok(duel.content.adminAnswer);
      await move("floor", "advance", { action: "correct" });
      assert.notEqual((await status()).theFloor.content.prompt.url, duel.content.prompt.url);
      for (let pass = 0; pass < 15 && (await status()).theFloor.stage === "live"; pass++) await move("floor", "advance", { action: "pass" });
      await move("floor", "end", finish, 409);
      const nextFinish = { eventId: duel.currentDuel.id, winnerTeamId: "ruby" };
      await move("floor", "end", nextFinish, 403, player.cookie);
      await move("floor", "end", nextFinish);
    }
    const settled = await status();
    assert.equal(points(settled, "royal") - points(before, "royal"), 1);
    assert.equal(points(settled, "ruby") - points(before, "ruby"), 2);
    assert.equal(total(settled), total(before));
    await setSegment("finale");
    assert.equal((await status()).finale.ranking[0].teamId, "ruby");
    await command("finale", "finale", "confirm-finalists", { teams: ["ruby", "royal"] });
    await command("finale", "finale", "start");
    await command("finale", "finale", "restart");
    await setSegment("the-floor");
    await move("floor", "restart");
    const restarted = await status();
    assert.deepEqual(restarted.teamScores, before.teamScores);
    assert.deepEqual(restarted.players, settled.players);
  });

  await t.test("Pojedynki – cztery punkty, korekta, ponowienia i rozliczenia zakładów", async () => {
    await setSegment("pojedynki");
    await move("pojedynki", "start");
    await register("royal");
    const bettor = roster.onyx[0];
    const initial = await status();
    let previousFinish;
    for (const targetTeamId of ["royal", "ruby", null, "royal"]) {
      await move("pojedynki", "configure", { teamAId: "royal", teamBId: "ruby" });
      const duel = (await status()).pojedynki.currentDuel;
      assert.equal(units(duel.betStake), 40000n);
      const blocked = duel.sequence === 3;
      const finish = { eventId: duel.id, winnerTeamId: "royal" };
      if (blocked) await post("/api/admin/players/chips", admin, { playerId: roster.ruby[0].id, tokens: "0.7999" });
      const before = await status();
      if (targetTeamId) {
        await move("pojedynki", "bet", { targetTeamId }, 200, bettor.cookie);
        await move("pojedynki", "bet", { targetTeamId }, 409, bettor.cookie);
        assert.equal(balance(await status(bettor.cookie), bettor) - balance(before, bettor), -40000n);
      }
      await move("pojedynki", "start-duel");
      if (previousFinish) await move("pojedynki", "finish", previousFinish, 409);
      if (blocked) {
        const pending = await status(bettor.cookie);
        const error = await move("pojedynki", "finish", finish, 409);
        assert.match((await error.json()).error, /ma za mało żetonów/);
        const unchanged = await status(bettor.cookie);
        assert.equal(total(unchanged) + 40000n, total(before));
        assert.deepEqual(unchanged.players, pending.players);
        assert.deepEqual(unchanged.pojedynki, pending.pojedynki);
        assertPointChanges(before, unchanged);
        await post("/api/admin/players/chips", admin, { playerId: roster.ruby[0].id, tokens: "100" });
      }
      const liquid = total(await status());
      if (duel.sequence === 0) {
        const path = "/api/segment/pojedynki/finish";
        const responses = await Promise.all([post(path, admin, finish, [200, 409]), post(path, admin, finish, [200, 409])]);
        assert.deepEqual(responses.map((response) => response.status).sort(), [200, 409]);
      } else await move("pojedynki", "finish", finish);
      const after = await status();
      assertPointChanges(before, after, { royal: 1 });
      assert.equal(total(after), liquid + (targetTeamId ? 40000n : 0n));
      if (targetTeamId === "royal") assert.equal(balance(after, bettor) - balance(before, bettor), 40000n);
      if (targetTeamId === "ruby") {
        assert.equal(balance(after, bettor) - balance(before, bettor), -40000n);
        for (const [index, member] of roster.royal.entries()) {
          assert.equal(balance(after, member) - balance(before, member), index < 4 ? 6667n : 6666n);
        }
      }
      previousFinish = finish;
      await move("pojedynki", "next");
    }
    const completed = await status();
    assert.equal(completed.pojedynki.stage, "results");
    assertPointChanges(initial, completed, { royal: 4 });
    const { id: eventId, scoreRevision: correctionRevision } = completed.pojedynki.duels[0];
    const correction = { eventId, correctionRevision, winnerTeamId: "ruby" };
    await move("pojedynki", "finish", correction, 403, bettor.cookie);
    await move("pojedynki", "finish", { ...correction, winnerTeamId: "onyx" }, 409);
    await move("pojedynki", "finish", correction);
    await move("pojedynki", "finish", correction, 409);
    await setSegment("finale");
    const qualification = await status();
    assert.deepEqual(qualification.finale.eligibleOrders, [["royal", "ruby"]]);
    assert.deepEqual(qualification.finale.ranking.slice(0, 2).map(({ teamId, points }) => [teamId, points]), [["royal", 3], ["ruby", 1]]);
    await setSegment("pojedynki");
    const corrected = await status(bettor.cookie);
    assert.match(await (await request("/admin", { cookie: admin })).text(), /Korekta punktacji drużyn/);
    assert.equal(corrected.pojedynki.duels[0].winnerTeamId, "ruby");
    assertPointChanges(completed, corrected, { royal: -1, ruby: 1 });
    assert.deepEqual(corrected.players, completed.players);
    assert.deepEqual(corrected.teamScores, (await status(roster.ruby[0].cookie)).teamScores);
    await move("pojedynki", "restart");
    assertPointChanges(initial, await status());
    assert.deepEqual((await status()).players, completed.players);
  });


  await t.test("SOLENIZANT, SPORT i Familiada – punktacja i wspólna reguła zakładów", async () => {
    await setSegment("solenizant");
    await move("solenizant", "start");
    for (let questionIndex = 0; questionIndex < 6; questionIndex++) {
      if (questionIndex === 2) {
        const page = await request("/obserwator", { cookie: observer });
        assert.match(await page.text(), /Co wrzucił Kamil pani od geografii/);
      }
      await move("solenizant", "scoring", { questionIndex });
      await move("solenizant", "score", { questionIndex, teamIds: teams });
      await move("solenizant", "score", { questionIndex, teamIds: teams }, 409);
    }
    assert.ok((await status()).teamScores.every((row) => row.points === 6));

    await setSegment("sport");
    await move("sport", "start");
    const pairA = { teamAId: "royal", teamBId: "ruby" };
    const pairB = { teamAId: "emerald", teamBId: "onyx" };
    const assignments = teams.flatMap((teamId) => roster[teamId].map((player, index) => ({ teamId, playerId: player.id, number: index + 1 })));
    await move("sport", "configure", { pairA, pairB, assignments });
    await move("sport", "start-challenges");
    const beforeSport = await status();
    await move("sport", "bet", { targetTeamId: "royal" }, 200, roster.emerald[0].cookie);
    await move("sport", "bet", { targetTeamId: "ruby" }, 200, roster.onyx[0].cookie);
    await move("sport", "start-challenge");
    let firstFinish;
    for (let index = 0; index < 8; index++) {
      const before = await status();
      const { currentChallenge } = before.sport;
      assert.equal(currentChallenge.sequence, index);
      assert.equal(units(currentChallenge.betStake), 40000n);
      const winnerTeamId = currentChallenge.pairSlot === "a" ? "royal" : "emerald";
      if (index > 0) {
        await move("sport", "start-challenge");
        if (index === 2) await move("sport", "finish", firstFinish, 409);
      }
      const finish = { eventId: currentChallenge.id, winnerTeamId };
      await move("sport", "finish", finish);
      await move("sport", "finish", finish, 409);
      const after = await status(roster.emerald[0].cookie);
      assertPointChanges(before, after, { [winnerTeamId]: 1 });
      if (index === 0) {
        assert.equal(balance(after, roster.emerald[0]) - balance(beforeSport, roster.emerald[0]), 40000n);
        assert.equal(balance(after, roster.onyx[0]) - balance(beforeSport, roster.onyx[0]), -40000n);
        assert.equal(units(after.sport.currentChallenge.viewerBetPayout), 80000n);
        assert.match(await (await request("/lobby?widok=segment", { cookie: roster.emerald[0].cookie })).text(), /Wypłata brutto to 8 żetonów/);
      } else assert.deepEqual(after.players, before.players);
      if (index === 0) firstFinish = finish;
      await move("sport", "next");
    }
    const afterMain = await status();
    assertPointChanges(beforeSport, afterMain, { royal: 4, emerald: 4 });
    const { id: eventId, scoreRevision: correctionRevision } = afterMain.sport.challenges[2];
    await move("sport", "finish", { eventId, correctionRevision, winnerTeamId: "ruby" });
    const afterCorrection = await status();
    assertPointChanges(afterMain, afterCorrection, { royal: -1, ruby: 1 });
    assert.deepEqual(afterCorrection.players, afterMain.players);
    let previousBonus;
    for (const [index, points] of [7, 3].entries()) {
      await move("sport", "bonus-configure", { requirements: teams.map((teamId) => ({ teamId, limbs: 2 })) });
      await move("sport", "bonus-start");
      const before = await status();
      const bonus = { eventId: before.sport.currentBonus.id, winnerTeamId: teams[index], points };
      if (previousBonus) await move("sport", "bonus-finish", previousBonus, 409);
      await move("sport", "bonus-finish", bonus);
      await move("sport", "bonus-finish", bonus, 409);
      const after = await status();
      assertPointChanges(before, after, { [teams[index]]: points });
      assert.deepEqual(after.players, before.players);
      previousBonus = bonus;
      await move("sport", "next");
    }
    assert.equal((await status()).sport.stage, "results");
    assert.equal(total(await status()), total(beforeSport));
    await move("sport", "restart");
    assertPointChanges(beforeSport, await status(), { royal: 7, ruby: 3 });

    await setSegment("familiada");
    const fam = (action, payload, options) => command("familiada", "familiada", action, payload, options);
    const bettor = roster.onyx[2];
    const secondBettor = roster.royal[0];
    await post("/api/admin/players/chips", admin, { playerId: secondBettor.id, tokens: "100" });
    await fam("configure", { teams });
    await fam("start");
    await fam("open-betting");
    const beforeFam = await status();
    assert.equal(units(beforeFam.familiada.matches[0].betStake), 80000n);
    assert.equal(balance(beforeFam, bettor), 1000000n);
    await fam("bet", { teamId: "royal" }, { cookie: observer, expected: 403 });
    await fam("bet", { teamId: "royal" }, { cookie: roster.ruby[0].cookie, expected: 409 });
    await fam("bet", { teamId: "royal" }, { cookie: bettor.cookie });
    await fam("bet", { teamId: "royal" }, { cookie: bettor.cookie, expected: 409 });
    const reserved = await status();
    assert.equal(total(reserved) + 80000n, total(beforeFam));
    assert.equal(balance(reserved, bettor), 920000n);
    await fam("close-betting");
    for (let index = 0; index < 4; index++) {
      const members = [roster.royal[0], roster.ruby[0]];
      await fam("start-question", { players: members.map((player) => player.id) });
      await fam("activate");
      await fam("buzz", {}, { cookie: members[0].cookie });
      const board = (await status(bettor.cookie)).familiada.round;
      assert.ok(board.answers.every((answer) => answer.revealed === null));
      const publicBoard = (await status(observer)).familiada.round;
      assert.equal(publicBoard.adminAnswers, undefined);
      assert.deepEqual(publicBoard.answers, board.answers);
      const count = board.answers.length;
      if (index === 0) {
        await fam("confirm-match", { teamId: "royal" }, { expected: 409 });
        await fam("answer", { position: 1 });
        assert.equal((await status(observer)).familiada.round.answers[0].revealed.text, "W kościele");
        await fam("answer", { position: 1 }, { expected: 409 });
        for (let strike = 1; strike <= 3; strike++) {
          await fam("mistake");
          const current = (await status()).familiada;
          assert.equal(current.round.strikes, strike);
          assert.equal(current.round.pool, 5);
          assert.equal(current.stage, strike === 3 ? "steal" : "play");
        }
        await fam("answer", { position: 2 });
        await fam("answer", { position: 3 });
        const current = (await status()).familiada;
        assert.equal(current.round.winner, "ruby");
        assert.equal(current.round.pool, 9);
      } else {
        let pool = 0;
        for (const { position } of board.answers) {
          await fam("answer", { position });
          pool += count - position + 1;
          const { round } = (await status(bettor.cookie)).familiada;
          assert.equal(round.answers[position - 1].revealed.points, count - position + 1);
          assert.equal(round.pool, pool);
        }
      }
      await fam("next");
      assertPointChanges(beforeFam, await status());
    }
    const ready = (await status()).familiada;
    assert.deepEqual(ready.matches[0].scores, [108, 9]);
    await fam("confirm-match", { teamId: "ruby" }, { expected: 409 });
    await fam("confirm-match", { teamId: "royal" }, { revision: ready.revision });
    const afterFam = await status();
    assertPointChanges(beforeFam, afterFam, { royal: 1 });
    assert.equal(total(afterFam), total(beforeFam));
    assert.equal(balance(afterFam, bettor), 1080000n);
    for (const member of roster.ruby) assert.equal(balance(afterFam, member) - balance(beforeFam, member), -16000n);
    const winnerBet = (await status(bettor.cookie)).familiada.matches[0].viewerBet;
    assert.equal(units(winnerBet.stake), 80000n);
    assert.equal(units(winnerBet.payout), 160000n);
    await fam("confirm-match", { teamId: "royal" }, { revision: ready.revision, expected: 409 });
    await fam("correct-match", { matchIndex: 0, teamId: "ruby" }, { expected: 409 });
    await fam("next");
    await fam("open-betting");
    assert.equal(balance(afterFam, secondBettor), 1000000n);
    await fam("bet", { teamId: "onyx" }, { cookie: secondBettor.cookie });
    await fam("bet", { teamId: "onyx" }, { cookie: bettor.cookie, expected: 409 });
    assert.equal(balance(await status(secondBettor.cookie), secondBettor) - balance(afterFam, secondBettor), -80000n);
    await fam("close-betting");
    for (const [index, leader] of [0, 1, 1, 0].entries()) {
      const members = [roster.emerald[0], roster.onyx[0]];
      await fam("start-question", { players: members.map((player) => player.id) });
      await fam("respondent", { playerId: members[leader].id });
      await fam("answer", { position: index === 3 ? 2 : 1 });
      if (index === 3) await fam("mistake");
      for (let attempt = 0; attempt < 4; attempt++) await fam("mistake");
      const { round } = (await status()).familiada;
      assert.equal(round.stealFailed, true);
      assert.equal(round.winner, members[leader].teamId);
      await fam("next");
      assertPointChanges(afterFam, await status());
    }
    assert.deepEqual((await status()).familiada.matches[1].scores, [11, 11]);
    await fam("confirm-match", { teamId: "emerald" });
    await fam("complete");
    const complete = await status();
    assert.equal(complete.familiada.stage, "completed");
    assert.equal(total(complete), total(beforeFam));
    assert.equal(balance(complete, secondBettor), 920000n);
    const lost = (await status(secondBettor.cookie)).familiada.matches[1].viewerBet;
    assert.equal(lost.result, "lost");
    assert.equal(units(lost.stake), 80000n);
    assert.equal(units(lost.payout), 0n);
    assertPointChanges(beforeFam, complete, { royal: 1, emerald: 1 });
    await fam("correct-match", { matchIndex: 1, teamId: "onyx" }, { revision: complete.familiada.revision });
    await fam("correct-match", { matchIndex: 1, teamId: "emerald" }, { revision: complete.familiada.revision, expected: 409 });
    const corrected = await status(bettor.cookie);
    assertPointChanges(beforeFam, corrected, { royal: 1, onyx: 1 });
    assert.deepEqual(corrected.players, complete.players);
    assert.deepEqual(corrected.familiada.matches[1].scores, [11, 11]);
    await fam("restart");
    assertPointChanges(beforeFam, await status());
  });

  await t.test("ALKOHOLICY – remis w Kalamburach, dwa niezależne pojedynki i brak punktów za wygraną", async () => {
    await setSegment("alkoholicy");
    const alk = (action, payload, options) => command("alkoholicy", "alkoholicy", action, payload, options);
    await alk("start");
    await alk("order", { teams });
    await alk("open-charades");
    const bettor = roster.onyx[0];
    const beforeCharades = total(await status());
    await alk("bet", { game: 1, teamId: "royal" }, { cookie: bettor.cookie });
    assert.equal(total(await status()) + 20000n, beforeCharades);
    await alk("start-charades");
    for (const teamId of teams) {
      await alk("score-charades", { teamId, points: 1 });
      await alk("next-team");
    }
    await alk("settle-charades");
    assert.equal(total(await status()), beforeCharades);
    assert.equal((await status(bettor.cookie)).alkoholicy.charadesMarket.viewerBet.result, "refunded");
    await alk("next-game");
    const before = await status();
    for (const [index, opponent] of ["ruby", "emerald"].entries()) {
      await alk("duel-teams", { teams: ["royal", opponent] });
      await alk("open-duel");
      const open = await status();
      assert.equal(units(open.alkoholicy.duelMarket.betStake), 40000n);
      await alk("bet", { game: 2 + index, teamId: index ? opponent : "royal" }, { cookie: bettor.cookie });
      assert.equal(balance(await status(bettor.cookie), bettor) - balance(open, bettor), -40000n);
      await alk("start-duel");
      await alk("finish-duel", { teamId: "royal" });
      await alk("finish-duel", { teamId: "royal" }, { expected: 409 });
      const settled = await status(bettor.cookie);
      assert.equal(total(settled), total(open));
      assert.equal(balance(settled, bettor) - balance(open, bettor), index === 0 ? 40000n : -40000n);
      if (index === 0) {
        await alk("complete", {}, { expected: 409 });
        await alk("next-duel");
      }
    }
    const after = await status();
    assert.equal(total(after), total(before));
    assert.deepEqual(after.teamScores, before.teamScores);
    const firstDuel = (await status(bettor.cookie)).alkoholicy.duelMarkets[0].viewerBet;
    assert.equal(firstDuel.result, "won");
    assert.equal(units(firstDuel.payout), 80000n);
    assert.equal((await status(bettor.cookie)).alkoholicy.duelMarkets[1].viewerBet.result, "lost");
    await alk("complete");
  });

  await t.test("Jaka to melodia – pięć piosenek, dwa punkty i składki po 5 żetonów", async () => {
    await setSegment("melodia");
    await move("melodia", "configure", { teamIds: teams });
    await move("melodia", "start");
    let songId;
    for (const [index, team] of ["royal", "ruby", "emerald", "ruby", "onyx"].entries()) {
      const { currentSong, songs } = (await status()).melodia;
      songId = currentSong.id;
      assert.equal(songs.length, 5);
      await move("melodia", "scoring", { songId });
      const player = (await status(roster.onyx[0].cookie)).melodia;
      assert.equal(player.currentSong.id, songId);
      assert.equal(player.currentSong.bids, undefined);
      await move("melodia", "score", { songId, winnerTeamId: team, artistCorrect: index === 0 || index === 1, titleCorrect: index === 0 || index === 3 });
      if (index < 4) await move("melodia", "next", { songId });
    }
    assert.deepEqual((await status()).melodia.leadingTeamIds, ["royal", "ruby"]);
    await move("melodia", "winner", { songId, winnerTeamId: "emerald" }, 409);
    await move("melodia", "winner", { songId, winnerTeamId: "royal" });
    const preview = (await status()).melodia.transferPreview;
    const payload = { songId, winnerTeamId: "royal", rosterIds: preview.map((row) => row.playerId).sort((a, b) => a - b) };
    const poor = roster.ruby[0];
    const original = (await status()).players.find((player) => player.id === poor.id).tokens;
    await post("/api/admin/players/chips", admin, { playerId: poor.id, tokens: "4.9999" });
    const blocked = total(await status());
    await move("melodia", "settle", payload, 409);
    assert.equal(total(await status()), blocked);
    await post("/api/admin/players/chips", admin, { playerId: poor.id, tokens: original });
    const before = await status();
    await move("melodia", "settle", payload);
    const after = await status();
    assert.equal(total(after), total(before));
    assert.equal(after.melodia.reward.pool, "75.0000");
    assert.equal(balance(after, roster.royal[0]) - balance(before, roster.royal[0]), 125000n);
    assert.equal(balance(after, poor) - balance(before, poor), -50000n);
    await move("melodia", "settle", payload, 409);
    await move("melodia", "complete", { songId });
  });

  await t.test("Złoty segment – punkt zwycięzcy, punkt za każdy głos, korekty i wypłaty", async () => {
    await setSegment("gold-challenge");
    const gold = (action, payload, options) => command("gold-challenge", "goldChallenge", action, payload, options);
    await gold("teams", { teams });
    for (const team of teams) {
      await gold("nominate", { playerId: roster[team][0].id }, { cookie: roster[team][1].cookie });
      await gold("representative", { playerId: roster[team][0].id });
    }
    await gold("prepare");
    const before = await status();
    await gold("start");
    const during = await status();
    assertPointChanges(before, during);
    assert.equal(total(during) + 2100000n, total(before));
    assert.equal(balance(before, roster.royal[0]) - balance(during, roster.royal[0]), 100000n);
    await gold("start", {}, { expected: 409 });
    await gold("winner", { playerId: roster.royal[0].id });
    const first = await status();
    assertPointChanges(before, first, { royal: 1 });
    assert.equal(total(first), total(before));
    assert.equal(balance(first, roster.royal[0]) - balance(before, roster.royal[0]), 250000n);
    await gold("winner", { playerId: roster.royal[0].id }, { expected: 409 });
    await gold("correct-winner", { playerId: roster.ruby[0].id }, { revision: first.goldChallenge.revision });
    await gold("correct-winner", { playerId: roster.royal[0].id }, { revision: first.goldChallenge.revision, expected: 409 });
    const correctedFirst = await status();
    assertPointChanges(before, correctedFirst, { ruby: 1 });
    assert.deepEqual(correctedFirst.players, first.players);
    await gold("complete", {}, { expected: 409 });
    await gold("next-game");
    await gold("number-open");
    const bettor = roster.emerald[0];
    await gold("number-vote", { number: 1 }, { cookie: bettor.cookie });
    await gold("number-vote", { number: 2 }, { cookie: bettor.cookie, expected: 409 });
    assert.equal((await status()).goldChallenge.adminNumbers.counts, undefined);
    await gold("number-close");
    await gold("number-confirm", { number: 6 });
    assertPointChanges(correctedFirst, await status());
    const publicState = (await status(bettor.cookie)).goldChallenge;
    assert.equal(publicState.adminNumbers, undefined);
    assert.equal(publicState.sixPendingNumber, undefined);
    await gold("number-settle");
    assert.ok((await status()).goldChallenge.sixResult.void);
    assert.equal(total(await status()), total(before));
    assertPointChanges(correctedFirst, await status());
    await gold("correct-number", { number: 1 });
    assertPointChanges(correctedFirst, await status(), { emerald: 1 });
    assert.deepEqual((await status()).players, first.players);
    await gold("number-restart");
    assertPointChanges(correctedFirst, await status());
    for (const [index, player] of roster.emerald.entries()) await gold("number-vote", { number: index < 3 ? 4 : 1 }, { cookie: player.cookie });
    await gold("number-vote", { number: 4 }, { cookie: roster.ruby[0].cookie });
    await gold("number-close");
    await gold("number-vote", { number: 4 }, { cookie: roster.onyx[0].cookie, expected: 409 });
    await gold("number-confirm", { number: 4 });
    const pending = await status();
    assertPointChanges(correctedFirst, pending);
    await gold("number-settle", {}, { revision: pending.goldChallenge.revision });
    const after = await status();
    assertPointChanges(correctedFirst, after, { emerald: 3, ruby: 1 });
    assert.equal(total(after), total(before));
    assert.equal(after.goldChallenge.sixResult.correct, 4);
    assert.equal(after.goldChallenge.sixResult.incorrect, 2);
    assert.equal(balance(after, bettor) - balance(first, bettor), 50000n);
    assert.equal(balance(after, roster.ruby[0]) - balance(first, roster.ruby[0]), 50000n);
    assert.equal(balance(after, roster.emerald[4]) - balance(first, roster.emerald[4]), -100000n);
    await gold("number-settle", {}, { revision: pending.goldChallenge.revision, expected: 409 });
    await gold("complete");
    await setSegment("sport");
    await setSegment("gold-challenge");
    const rejoined = cookieOf(await post("/api/auth/register", undefined, { nickname: bettor.nickname, teamId: bettor.teamId }));
    assert.deepEqual((await status(rejoined)).teamScores, after.teamScores);
    assert.deepEqual((await status(roster.ruby[0].cookie)).teamScores, after.teamScores);
    await gold("correct-number", { number: 1 });
    const correctedNumber = await status(rejoined);
    assertPointChanges(correctedFirst, correctedNumber, { emerald: 2 });
    assert.deepEqual(correctedNumber.players, after.players);
    await gold("correct-number", { number: 6 });
    assertPointChanges(correctedFirst, await status());
    assert.deepEqual((await status()).players, after.players);
  });

  await t.test("Pełny reset usuwa punkty i pozwala rozpocząć niezależną grę", async () => {
    await post("/api/admin/game/reset", admin);
    const reset = await status();
    assert.ok(reset.teamScores.every((team) => team.points === 0));
    assert.ok(reset.players.every((player) => units(player.tokens) === 1000000n));
    await post("/api/game/start", admin);
    await setSegment("solenizant");
    await move("solenizant", "start");
    await move("solenizant", "scoring", { questionIndex: 0 });
    await move("solenizant", "score", { questionIndex: 0, teamIds: ["royal", "ruby"] });
  });

  await t.test("FINAŁ – sześć pytań, punkty i jednokrotna nagroda z transferów", async () => {
    await setSegment("finale");
    const finale = (action, payload, options) => command("finale", "finale", action, payload, options);
    const original = await status();
    const questions = [
      ["Ile procent kobiet w wieku produkcyjnym (tj. 18–60 lat) nie pracuje?", "20,3%"],
      ["Ilu Polaków nosi nazwisko Plewka?", "1483"],
      ["Ilu Polaków zginęło podczas II wojny światowej?", "5,9 mln"],
      ["Ile lat średnio trwa małżeństwo przed rozwodem?", "15 lat"],
      ["Jaki procent Polaków w wieku 18–44 lat uważa, że to mężczyzna powinien płacić za kobietę na randce?", "61%"],
      ["Ile razy łącznie odwiedzono polskie kina w 2025 roku?", "49,7 miliona razy"],
    ];
    assert.equal(original.finale.questionCount, 6);
    await finale("confirm-finalists", { teams: ["royal", "ruby"] });
    await finale("start");
    for (const [index, score] of [10, 3, 0, 5, 4, 4].entries()) {
      const teamId = index % 2 ? "ruby" : "royal";
      const current = await status();
      const question = current.finale.question;
      assert.equal(question.number, index + 1);
      assert.deepEqual([question.text, question.adminAnswer], questions[index]);
      if (index === 4) {
        const page = await request("/obserwator", { cookie: observer });
        assert.match((await page.text()).replaceAll("<!-- -->", ""), /Pytanie 5 z 6/);
        await finale("complete", {}, { expected: 409 });
        await finale("estimate", { value: "101" }, { expected: 409 });
      }
      if (index === 5) await finale("estimate", { value: "49700000,1" }, { expected: 409 });
      await finale("estimate", { value: ["10", "1450", "5900000", "16", "55", "49700000"][index] });
      await finale("direction", { value: "more" });
      assert.equal((await status(roster.onyx[0].cookie)).finale.question.answer, null);
      assert.equal((await status(observer)).finale.question.adminAnswer, undefined);
      await finale("reveal");
      const revealed = await status(observer);
      assert.equal(revealed.finale.question.answer, questions[index][1]);
      await finale("confirm-winner", { teamId }, { revision: revealed.finale.revision });
      await finale("confirm-winner", { teamId }, { revision: revealed.finale.revision, expected: 409 });
      assertPointChanges(revealed, await status(), { [teamId]: 1 });
      await finale("show-wheel");
      if (index === 5) assert.match(await (await request("/obserwator", { cookie: observer })).text(), /KOŁO FORTUNY/);
      await finale("next", {}, { expected: 409 });
      const before = await status();
      await finale("award", { round: index + 1, points: score }, { revision: before.finale.revision });
      await finale("award", { round: index + 1, points: score }, { revision: before.finale.revision, expected: 409 });
      const after = await status(roster.onyx[0].cookie);
      assert.equal(points(after, teamId) - points(before, teamId), score);
      assert.equal(after.finale.question.points, score);
      assert.equal(after.finale.chipReward, null);
      assert.deepEqual(after.players, original.players);
      if (index === 0) {
        await finale("award", { round: 1, points: 8 });
        assert.equal(points(await status(), teamId) - points(before, teamId), 8);
      }
      assert.deepEqual(after.finale.finalists.map(({ teamId }) => teamId), ["royal", "ruby"]);
      await finale("next");
    }
    const summary = await status();
    assert.equal(summary.finale.stage, "summary");
    assert.deepEqual(summary.finale.roundPoints, [8, 3, 0, 5, 4, 4]);
    assert.deepEqual(summary.finale.overallLeaders, ["royal", "ruby"]);
    assertPointChanges(original, summary, { royal: 15, ruby: 15 });
    await finale("complete", {}, { expected: 409 });
    await finale("overall-winner", { teamId: "ruby" });
    const removed = roster.emerald[3];
    await post("/api/admin/players/remove", admin, { playerId: removed.id });
    const ready = await status();
    await finale("complete", {}, { cookie: observer, expected: 403 });
    await finale("complete", {}, { cookie: roster.ruby[0].cookie, expected: 403 });
    assert.doesNotMatch(await (await request("/obserwator", { cookie: observer })).text(), /otrzymał.*żetony/);
    const poor = roster.emerald[0];
    const setBalance = (player, tokens) => post("/api/admin/players/chips", admin, { playerId: player.id, tokens });
    await setBalance(poor, "0.6665");
    const unfunded = await status();
    const blocked = await finale("complete", {}, { expected: 409 });
    assert.match((await blocked.json()).error, /za mało żetonów/);
    const unchanged = await status();
    assert.deepEqual(unchanged.players, unfunded.players);
    assert.deepEqual(unchanged.finale, unfunded.finale);
    await setBalance(poor, "100");

    const outcomes = await Promise.all([
      finale("complete", {}, { revision: ready.finale.revision, expected: [200, 409] }),
      finale("complete", {}, { revision: ready.finale.revision, expected: [200, 409] }),
    ]);
    assert.deepEqual(outcomes.map(({ status }) => status).sort(), [200, 409]);
    const complete = await status();
    assert.equal(complete.finale.stage, "completed");
    assert.equal(complete.finale.overallWinner, "ruby");
    assert.deepEqual(complete.finale.chipReward, { id: ready.finale.revision, perWinner: 2 });
    assert.equal(total(complete), total(ready));
    assertPointChanges(ready, complete);
    const winners = ready.players.filter(({ teamId }) => teamId === "ruby");
    const contributors = ready.players.filter(({ teamId }) => teamId !== "ruby").sort((a, b) => a.id - b.id);
    assert.equal(winners.length, 5);
    assert.equal(contributors.length, 15);
    for (const player of winners) assert.equal(balance(complete, player) - balance(ready, player), 20000n);
    for (const [index, player] of contributors.entries()) {
      assert.equal(balance(ready, player) - balance(complete, player), index < 10 ? 6667n : 6666n);
    }
    const [inactive] = await fixtureQuery("SELECT tokens::TEXT AS tokens FROM players WHERE id = $1", [removed.id]);
    assert.equal(units(inactive.tokens), 1000000n);
    assert.ok(complete.players.every((player) => units(player.tokens) >= 0n));
    await finale("complete", {}, { expected: 409 });
    for (const cookie of [roster.ruby[0].cookie, roster.onyx[0].cookie, observer]) {
      const page = await request(cookie === observer ? "/obserwator" : "/lobby?widok=segment", { cookie });
      assert.match(await page.text(), /ZWYCIĘZCY FINAŁU!.*Każdy zawodnik zwycięskiej drużyny otrzymał/);
      const refreshed = await status(cookie);
      assert.deepEqual(refreshed.players, complete.players);
      assert.deepEqual(refreshed.finale, complete.finale);
    }

    const late = await register("onyx");
    const originalContributor = roster.onyx[0];
    await post("/api/admin/players/remove", admin, { playerId: originalContributor.id });
    const winningPlayer = roster.ruby[0];
    await setBalance(winningPlayer, "1.9999");
    const blockedRestart = await finale("restart", {}, { expected: 409 });
    assert.match((await blockedRestart.json()).error, /cofnąć wypłaty finałowej/);
    assert.deepEqual((await status()).finale, complete.finale);
    await setBalance(winningPlayer, "102");
    await finale("restart");
    const restarted = await status();
    assert.equal(restarted.finale.stage, "intro");
    assert.equal(restarted.finale.chipReward, null);
    assertPointChanges(original, restarted);
    const [originalRosterMember] = await fixtureQuery("SELECT tokens::TEXT AS tokens FROM players WHERE id = $1", [originalContributor.id]);
    assert.equal(units(originalRosterMember.tokens), 1000000n);
    assert.equal(balance(restarted, late), 1000000n);
    assert.ok(restarted.players.every((player) => units(player.tokens) === 1000000n));
  });

  await t.test("Starsza otwarta stawka i historyczna wypłata pozostają zapisane", async () => {
    await setSegment("pojedynki");
    await move("pojedynki", "start");
    const configure = () => move("pojedynki", "configure", { teamAId: "royal", teamBId: "ruby" });
    const bettor = roster.emerald[4];
    const bet = () => move("pojedynki", "bet", { targetTeamId: "royal" }, 200, bettor.cookie);

    await configure();
    const before = await status(bettor.cookie);
    const oldEventId = before.pojedynki.currentDuel.id;
    await bet();
    await move("pojedynki", "start-duel");
    // Seed the previous version's settlement: 4 chips returned and 2 paid by the losing team.
    await fixtureQuery(`
      WITH old_duel AS (
        UPDATE pojedynki_duels SET stage = 'result', winner_team_id = 'royal', settled_at = NOW(), ended_at = NOW()
        WHERE id = $1 RETURNING id
      ), old_bet AS (
        UPDATE pojedynki_bets SET result = 'won', payout = 6, settled_at = NOW()
        WHERE duel_id = $1 AND bettor_id = $2 RETURNING bettor_id
      ), old_stage AS (
        UPDATE game_state SET pojedynki_stage = 'result' WHERE id = 1
      )
      UPDATE players SET tokens = tokens + CASE WHEN id = $2 THEN 6 ELSE -0.4 END
      WHERE id = $2 OR (active AND team_id = 'ruby')
    `, [oldEventId, bettor.id]);
    const historical = await status(bettor.cookie);
    assert.equal(total(historical), total(before));
    assert.equal(balance(historical, bettor) - balance(before, bettor), 20000n);
    assert.equal(units(historical.pojedynki.currentDuel.viewerBetPayout), 60000n);
    await move("pojedynki", "finish", { eventId: oldEventId, winnerTeamId: "royal" }, 409);
    assert.deepEqual((await status(bettor.cookie)).players, historical.players);

    await move("pojedynki", "next");
    await configure();
    const { id: eventId } = (await status()).pojedynki.currentDuel;
    await fixtureQuery("UPDATE pojedynki_duels SET bet_stake = 2 WHERE id = $1", [eventId]);
    assert.equal(units((await status()).pojedynki.currentDuel.betStake), 20000n);
    await bet();
    const open = await status(bettor.cookie);
    assert.equal(balance(historical, bettor) - balance(open, bettor), 20000n);
    await move("pojedynki", "start-duel");
    await move("pojedynki", "finish", { eventId, winnerTeamId: "royal" });
    const settled = await status(bettor.cookie);
    assert.equal(total(settled), total(historical));
    assert.equal(balance(settled, bettor) - balance(historical, bettor), 20000n);
    assert.equal(units(settled.pojedynki.currentDuel.viewerBetPayout), 40000n);
    assert.deepEqual(settled.pojedynki.duels[0], historical.pojedynki.duels[0]);
  });

  await t.test("Zakłady za 10 i 4 żetony rozliczają własne stawki w tej samej rundzie", async () => {
    await move("pojedynki", "next");
    await move("pojedynki", "configure", { teamAId: "royal", teamBId: "ruby" });
    const before = await status();
    const { id: eventId, betStake } = before.pojedynki.currentDuel;
    assert.equal(units(betStake), 40000n);
    const correct = roster.onyx[1], incorrect = roster.onyx[2], standard = roster.onyx[3];
    assert.equal(balance(before, correct), 1000000n);
    assert.equal(balance(before, incorrect), 1000000n);
    // Exercise a recorded 10-chip stake without changing the game's configured stakes.
    await fixtureQuery(`
      WITH held AS (
        UPDATE players SET tokens = tokens - 10 WHERE id IN ($2, $3) RETURNING id
      )
      INSERT INTO pojedynki_bets (duel_id, bettor_id, target_team_id, stake)
      SELECT $1, id, CASE WHEN id = $2 THEN 'royal' ELSE 'ruby' END, 10 FROM held
    `, [eventId, correct.id, incorrect.id]);
    await move("pojedynki", "bet", { targetTeamId: "royal" }, 200, standard.cookie);
    const reserved = await status();
    assert.equal(balance(reserved, correct), 900000n);
    assert.equal(balance(reserved, incorrect), 900000n);
    assert.equal(total(reserved) + 240000n, total(before));
    await move("pojedynki", "start-duel");
    const finish = { eventId, winnerTeamId: "royal" };
    await move("pojedynki", "finish", finish);
    await move("pojedynki", "finish", finish, 409);
    const after = await status(correct.cookie);
    assert.equal(balance(after, correct), 1100000n);
    assert.equal(balance(after, incorrect), 900000n);
    assert.equal(balance(after, standard) - balance(before, standard), 40000n);
    assert.equal(units(after.pojedynki.currentDuel.viewerBetPayout), 200000n);
    for (const member of roster.ruby) assert.equal(balance(before, member) - balance(after, member), 28000n);
    for (const [index, member] of roster.royal.entries()) {
      assert.equal(balance(after, member) - balance(before, member), index < 4 ? 16667n : 16666n);
    }
    assert.equal(total(after), total(before));
  });

  await t.test("Starszy finał wznawia grę od pytania 5 lub zachowuje zakończony wynik", async () => {
    await setSegment("finale");
    const original = await status();
    const ranking = original.finale.ranking;
    const winner = ranking[0].teamId;
    const oldSummary = {
      stage: "summary", ranking, finalists: ranking.slice(0, 2), questionIndex: 3, overallWinner: winner,
      rounds: Array.from({ length: 4 }, () => ({ estimate: 10, direction: "more", winner, points: 0 })),
    };
    const seed = (state) => fixtureQuery("UPDATE game_state SET finale_state = $1::JSONB, finale_revision = gen_random_uuid()", [JSON.stringify(state)]);
    await seed(oldSummary);
    const resumed = await status();
    assert.equal(resumed.finale.stage, "question");
    assert.equal(resumed.finale.question.number, 5);
    assert.deepEqual(resumed.finale.winners, [winner, winner, winner, winner, null, null]);
    await command("finale", "finale", "complete", {}, { expected: 409 });
    await command("finale", "finale", "estimate", { value: "60" });
    assert.equal((await status()).finale.question.estimate, 60);
    await seed({ ...oldSummary, stage: "completed", finalRanking: ranking });
    const archived = await status();
    assert.equal(archived.finale.questionCount, 4);
    assert.equal(archived.finale.overallWinner, winner);
    assert.equal(archived.finale.chipReward, null);
    await command("finale", "finale", "complete", {}, { expected: 409 });
    assert.deepEqual((await status()).players, original.players);
  });
  await post("/api/auth/logout", observer);
  await request("/api/game/state", { cookie: observer, status: 401 });
});
