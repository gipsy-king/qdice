import * as R from "ramda";
import { Table, Player, Land, Watcher, TableInfo, Chatter } from "../types";
import * as maps from "../maps";
import * as db from "../db";
import * as Sentry from "@sentry/node";
import { STATUS_FINISHED } from "../constants";
import * as config from "../tables.config";
import logger from "../logger";
import { isBot } from "./bots";
import { Tedis } from "tedis";

const tedis = new Tedis({
  host: process.env.REDIS_HOST,
});

let memoryTables: { [tag: string]: Table } = {};

export const clearMemoryTables = () => {
  memoryTables = {};
};

const makeTable = (config: any): Table => {
  if (!config.tag) {
    throw new Error("Cannot makeTable without even a tag");
  }
  return {
    name: config.name,
    tag: config.tag,
    mapName: config.mapName,
    players: config.players || [],
    playerSlots: config.playerSlots,
    startSlots: config.startSlots,
    points: config.points,
    status: STATUS_FINISHED,
    gameStart: 0,
    turnIndex: -1,
    turnStart: 0,
    turnActivity: false,
    lands: [],
    adjacency: {
      matrix: [],
      indexes: {},
    },
    stackSize: config.stackSize,
    playerStartCount: 0,
    turnCount: 1,
    roundCount: 0,
    watching: config.watching || [],
    attack: null,
    params: config.params ?? {},
    retired: config.retired || [],
    currentGame: 0,
  };
};

export const getTable = async (tableTag: string): Promise<Table> => {
  if (memoryTables[tableTag] && Math.random() > 0.01) {
    return memoryTables[tableTag];
  }
  let dbTable = await db.getTable(tableTag);
  if (!dbTable) {
    const tableConfig = config.tables
      .filter(config => config.tag === tableTag)
      .pop();
    try {
      const [lands, adjacency] = maps.loadMap(tableConfig.mapName);
      const dbTableData = {
        ...makeTable(tableConfig),
        lands: lands.map(R.omit(["cells"])),
        adjacency,
      };
      dbTable = await db.createTable(dbTableData);
      const [_, adjacency_] = maps.loadMap(dbTable.mapName);
      memoryTables[tableTag] = { ...dbTable, adjacency: adjacency_ };
    } catch (e) {
      logger.error(`could not load map ${tableTag}`);
      throw e;
    }
  }

  const [_, adjacency] = maps.loadMap(dbTable.mapName);
  const table = { ...dbTable, adjacency };

  if (memoryTables[tableTag]) {
    if (!R.equals(memoryTables[tableTag], table)) {
      logger.error("cache diff error");
      const memTable = memoryTables[tableTag];
      if (Object.keys(memTable).length !== Object.keys(table).length) {
        logger.debug(`${Object.keys(memTable)} vs ${Object.keys(table)}`);
      } else {
        for (const key in memTable) {
          if (!R.equals(memTable[key], table[key])) {
            logger.debug(`diff key ${key}`);
          }
        }
      }
      Sentry.captureException(new Error("DB/Memory inconsistent"));
      Sentry.captureEvent({
        message: "CacheError",
        extra: {
          memory: memoryTables[tableTag],
          db: table,
        },
      });
    }
  }

  return table;
};

export const save = async (
  table: Table,
  props?: Partial<Table>,
  players?: readonly Player[],
  lands?: readonly Land[],
  watching?: readonly Watcher[],
  retired?: readonly Player[]
): Promise<Table> => {
  if (props && (props as any).table) {
    throw new Error("bad save");
  }

  if (
    (!props || Object.keys(props).length === 0) &&
    !players &&
    !lands &&
    !watching
  ) {
    console.trace();
    throw new Error("cannot save nothing to table");
  }
  const lands_ = lands
    ? lands.map(land => ({
        emoji: land.emoji,
        color: land.color,
        points: land.points,
        capital: !!land.capital,
      }))
    : undefined;
  const saved =
    (await db.saveTable(
      table.tag,
      props,
      players,
      lands_,
      watching,
      retired
    )) ?? {};
  const result: Table = {
    ...table,
    ...saved,
    lands: lands_ ?? table.lands,
    players: players ?? table.players,
    watching: watching ?? table.watching,
    retired: retired ?? table.retired,
  };

  const [_, adjacency] = maps.loadMap(result.mapName);
  const savedTable = { ...result, adjacency };
  memoryTables[table.tag] = savedTable;
  return savedTable;
};

export const getStatuses = (): readonly TableInfo[] =>
  R.sortWith(
    [
      R.ascend(R.prop("name")),
      // R.descend(R.prop("playerCount")),
      // R.descend(R.prop("watchCount")),
    ],
    Object.values(memoryTables)
      // .filter(table => !table.params.twitter)
      .map(table => ({
        ...R.omit(["lands", "players", "watchers", "adjacency"], table),
        landCount: table.lands.length,
        playerCount: table.players.length,
        watchCount: table.watching.length,
        botCount: table.players.filter(isBot).length,
      }))
  );

export const addChat = async (table: Table, user: Chatter, message: string) => {
  await tedis.lpush(
    "chatlines-" + table.tag,
    JSON.stringify({ user, message })
  );
  await tedis.ltrim("chatlines-" + table.tag, 0, 99);
};

export const getChat = async (table: Table) => {
  return (await tedis.lrange("chatlines-" + table.tag, 0, 99))
    .reverse()
    .map(str => JSON.parse(str));
};
