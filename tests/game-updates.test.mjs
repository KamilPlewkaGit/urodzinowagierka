
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
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
    stdio: ["ignore", "pipe", "pipe"],
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
    assert.equal(Object.values(manifest.labels).filter((label) => label.startsWith("Loga")).length, 38);
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
    for (const bettor of roster.emerald.slice(0, 4)) await move("floor", "bet", { targetTeamId: "royal" }, 200, bettor.cookie);
    for (const bettor of roster.onyx.slice(0, 2)) await move("floor", "bet", { targetTeamId: "ruby" }, 200, bettor.cookie);
    assert.equal(total(await status()) + 240000n, total(before));
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
    await move("floor", "end", { winnerTeamId: "royal" });
    const after = await status();
    assert.deepEqual(after.teamScores, before.teamScores.map((score) => ({
      ...score, points: score.points + (score.teamId === "royal" ? 1 : 0),
    })));
    assert.deepEqual((await status(player.cookie)).teamScores, after.teamScores);
    assert.deepEqual((await status(observer)).teamScores, after.teamScores);
    assert.equal(total(after), total(before));
    assert.equal(balance(after, roster.ruby[0]) - balance(before, roster.ruby[0]), -16000n);
    assert.equal(balance(after, roster.royal[0]) - balance(before, roster.royal[0]), 16000n);
    assert.equal(balance(after, player) - balance(before, player), 20000n);
    await move("floor", "end", { winnerTeamId: "royal" }, 409);
    assert.deepEqual((await status()).teamScores, after.teamScores);

    for (const [categoryId, itemCount] of [["lokalne-miejsca", 49], ["loga", 38]]) {
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
      await move("floor", "end", { winnerTeamId: "ruby" }, 403, player.cookie);
      await move("floor", "end", { winnerTeamId: "ruby" });
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
    const extra = await register("royal");
    const bettor = roster.onyx[0];
    const initial = await status();
    let previousFinish;
    for (const targetTeamId of ["royal", "ruby", null, "royal"]) {
      await move("pojedynki", "configure", { teamAId: "royal", teamBId: "ruby" });
      const duel = (await status()).pojedynki.currentDuel;
      assert.equal(units(duel.betStake), 40000n);
      const blocked = duel.sequence === 3;
      const finish = { eventId: duel.id, winnerTeamId: "royal" };
      if (blocked) await post("/api/admin/players/chips", admin, { playerId: roster.ruby[0].id, tokens: "0.3999" });
      const before = await status();
      if (targetTeamId) {
        await move("pojedynki", "bet", { targetTeamId }, 200, bettor.cookie);
        await move("pojedynki", "bet", { targetTeamId }, 409, bettor.cookie);
        assert.equal(balance(await status(bettor.cookie), bettor) - balance(before, bettor), -40000n);
      }
      await move("pojedynki", "start-duel");
      if (previousFinish) await move("pojedynki", "finish", previousFinish, 409);
      if (blocked) {
        const error = await move("pojedynki", "finish", finish, 409);
        assert.match((await error.json()).error, /ma za mało żetonów/);
        assert.equal(total(await status()) + 40000n, total(before));
        assertPointChanges(before, await status());
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
      if (targetTeamId === "royal") assert.equal(balance(after, bettor) - balance(before, bettor), 20000n);
      if (targetTeamId === "ruby") assert.ok([6666n, 6667n].includes(balance(after, extra) - balance(before, extra)));
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
        assert.match(await page.text(), /Co wrzucił Kamil pani od geografii do cyce[?]/);
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
        assert.equal(balance(after, roster.emerald[0]) - balance(beforeSport, roster.emerald[0]), 20000n);
        assert.equal(balance(after, roster.onyx[0]) - balance(beforeSport, roster.onyx[0]), -40000n);
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
    await fam("configure", { teams });
    await fam("start");
    await fam("open-betting");
    const beforeFam = await status();
    const bettor = roster.onyx[0];
    assert.equal(units(beforeFam.familiada.matches[0].betStake), 80000n);
    await fam("bet", { teamId: "royal" }, { cookie: observer, expected: 403 });
    await fam("bet", { teamId: "royal" }, { cookie: roster.ruby[0].cookie, expected: 409 });
    await fam("bet", { teamId: "royal" }, { cookie: bettor.cookie });
    await fam("bet", { teamId: "royal" }, { cookie: bettor.cookie, expected: 409 });
    assert.equal(total(await status()) + 80000n, total(beforeFam));
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
    assert.equal(balance(afterFam, bettor) - balance(beforeFam, bettor), 20000n);
    const winnerBet = (await status(bettor.cookie)).familiada.matches[0].viewerBet;
    assert.equal(units(winnerBet.stake), 80000n);
    assert.equal(units(winnerBet.payout), 100000n);
    await fam("confirm-match", { teamId: "royal" }, { revision: ready.revision, expected: 409 });
    await fam("correct-match", { matchIndex: 0, teamId: "ruby" }, { expected: 409 });
    await fam("next");
    await fam("open-betting");
    const secondBettor = roster.royal[0];
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
    assert.equal(balance(complete, secondBettor) - balance(afterFam, secondBettor), -80000n);
    const lost = (await status(secondBettor.cookie)).familiada.matches[1].viewerBet;
    assert.equal(lost.result, "lost");
    assert.equal(units(lost.stake), 80000n);
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
    assert.equal(units(firstDuel.payout), 60000n);
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

  await t.test("FINAŁ – cztery koła, korekta punktów, stała para i rozstrzygnięcie remisu", async () => {
    await setSegment("finale");
    const finale = (action, payload, options) => command("finale", "finale", action, payload, options);
    const original = await status();
    await finale("confirm-finalists", { teams: ["royal", "ruby"] });
    await finale("start");
    for (const [index, score] of [10, 3, 0, 5].entries()) {
      const teamId = index % 2 ? "ruby" : "royal";
      await finale("estimate", { value: "10" });
      await finale("direction", { value: "more" });
      assert.equal((await status(roster.onyx[0].cookie)).finale.question.answer, null);
      assert.equal((await status(observer)).finale.question.adminAnswer, undefined);
      await finale("reveal");
      await finale("confirm-winner", { teamId });
      await finale("show-wheel");
      await finale("next", {}, { expected: 409 });
      const before = await status();
      await finale("award", { round: index + 1, points: score }, { revision: before.finale.revision });
      await finale("award", { round: index + 1, points: score }, { revision: before.finale.revision, expected: 409 });
      const after = await status(roster.onyx[0].cookie);
      assert.equal(points(after, teamId) - points(before, teamId), score);
      assert.equal(after.finale.question.points, score);
      if (index === 0) {
        await finale("award", { round: 1, points: 8 });
        assert.equal(points(await status(), teamId) - points(before, teamId), 8);
      }
      assert.deepEqual(after.finale.finalists.map(({ teamId }) => teamId), ["royal", "ruby"]);
      await finale("next");
    }
    await finale("complete", {}, { expected: 409 });
    await finale("overall-winner", { teamId: "ruby" });
    await finale("complete");
    assert.equal((await status()).finale.overallWinner, "ruby");
    assert.equal(total(await status()), total(original));
  });
  await post("/api/auth/logout", observer);
  await request("/api/game/state", { cookie: observer, status: 401 });
});
