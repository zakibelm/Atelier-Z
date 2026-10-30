#!/usr/bin/env node
// Génère team/atelier-z.team.json (format OpenMausBot « openmaus.team ») à partir des skills et des règles du salon.
// Usage : node tools/build-team.mjs
import { writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { root, buildTeam } from "./lib/team.mjs";

const team = buildTeam();
mkdirSync(join(root, "team"), { recursive: true });
const out = join(root, "team", "atelier-z.team.json");
writeFileSync(out, JSON.stringify(team, null, 2) + "\n");
console.log(`OK : ${team.team.members.length} bots, salon « ${team.team.room.name} » -> ${out}`);
