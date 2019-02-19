import * as R from 'ramda';
import { UserId, Table, Land, User, Player, Watcher, CommandResult, IllegalMoveError } from '../types';
import * as publish from './publish';
import { addSeconds, now } from '../timestamp';
import { hasTurn, findLand, adjustPlayer } from '../helpers';
import { isBorder } from '../maps';
import nextTurn from './turn';
import {
  STATUS_PAUSED,
  STATUS_PLAYING,
  STATUS_FINISHED,
  TURN_SECONDS,
  COLOR_NEUTRAL,
  GAME_START_COUNTDOWN,
} from '../constants';
import logger from '../logger';

export const heartbeat = (user: User, table: Table, clientId: string): CommandResult => {
  const finder = user && user.id
    ? R.propEq('id', user.id)
    : R.propEq('clientId', clientId);

  const existing = R.find(finder, table.watching);
  const watching: ReadonlyArray<Watcher> = existing
    ? table.watching.map(watcher => finder(watcher)
      ? Object.assign({}, watcher, { lastBeat: now() })
      : watcher)
    : table.watching.concat([{
      clientId,
      id: user && user.id ? user.id : null,
      name: user ? user.name : null,
      lastBeat: now()
    }]);

  return { type: 'Heartbeat', watchers: watching };
};

export const enter = (user: User, table: Table, clientId: string): CommandResult | undefined => {
  const existing = R.find(R.propEq('clientId', clientId), table.watching);
  publish.tableStatus(table, clientId);
  if (!existing) {
    publish.enter(table, user ? user.name : null);
    return {
      type: 'Enter',
      watchers: R.append({
        clientId,
        id: user && user.id ? user.id : null,
        name: user ? user.name : null,
        lastBeat: now()
      }, table.watching)
    };
  }
  return;
};

export const exit = (user, table, clientId): CommandResult | undefined => {
  const existing = R.find(R.propEq('clientId', clientId), table.watching);
  if (existing) {
    publish.exit(table, user ? user.name : null);
    return {
      type: 'Exit',
      watchers: R.filter(R.complement(R.propEq('clientId', clientId)), table.watching)
    };
  }
  return;
};

const makePlayer = (user, clientId, playerCount): Player => ({
  id: user.id,
  clientId,
  name: user.name,
  picture: user.picture || '',
  color: playerCount + 1,
  reserveDice: 0,
  out: false,
  outTurns: 0,
  points: user.points,
  level: user.level,
  position: 0,
  score: 0,
  flag: null,
  lastBeat: now(),
});
  
export const join = (user, table: Table, clientId): CommandResult => {
  if (table.status === STATUS_PLAYING) {
    throw new IllegalMoveError('join while STATUS_PLAYING', user.id);
  }
  const existing = table.players.filter(p => p.id === user.id).pop();
  if (existing) {
    throw new IllegalMoveError('already joined', user.id);
  }

  const players = table.players.concat([makePlayer(user, clientId, table.players.length)]);
  const status = table.status === STATUS_FINISHED
    ? STATUS_PAUSED
    : table.status;
  const lands = table.status === STATUS_FINISHED
    ? table.lands.map(land => Object.assign({}, land, {
        points: 1,
        color: -1,
      }))
    : table.lands;
  const turnCount = table.status === STATUS_FINISHED ? 1 : table.turnCount;

  //table.players = table.players.map((player, index) => Object.assign(player, { color: index + 1}));

  let gameStart = table.gameStart;

  if (table.players.length === table.playerSlots) {
    gameStart = now();
  } else {
    if (players.length >= 2 &&
      players.length >= table.startSlots) {
      gameStart = addSeconds(GAME_START_COUNTDOWN);

      publish.event({
        type: 'countdown',
        table: table.name,
        players: players,
      });
    } else {
      publish.event({
        type: 'join',
        table: table.name,
        player: { name: user.name },
      });
    }
  }
  return {
    type: 'Join',
    table: { status, turnCount, gameStart },
    players,
    lands,
  };
};

export const leave = (user: { id: UserId }, table: Table, clientId?): CommandResult => {
  if (table.status === STATUS_PLAYING) {
    throw new IllegalMoveError('leave while STATUS_PLAYING', user.id);
  }
  const existing = table.players.filter(p => p.id === user.id).pop();
  if (!existing) {
    throw new IllegalMoveError('not joined', user.id);
  }

  const players = table.players.filter(p => p !== existing);

  const gameStart = players.length >= 2 && Math.ceil(table.playerSlots / 2) <= table.players.length
    ? addSeconds(GAME_START_COUNTDOWN)
    : 0;

  const status = table.players.length === 0 && table.status === STATUS_PAUSED
    ? STATUS_FINISHED
    : table.status;

  const coloredPlayers = players.map((player, index) => Object.assign(player, { color: index + 1 }));

  publish.event({
    type: 'join',
    table: table.name,
  });
  return {
    type: 'Leave',
    table: { gameStart, status },
    players: coloredPlayers,
  }
};

export const attack = (user, table: Table, clientId, [emojiFrom, emojiTo]): CommandResult => {
  if (table.status !== STATUS_PLAYING) {
    throw new IllegalMoveError('attack while not STATUS_PLAYING', user.id, emojiFrom, emojiTo);
  }
  if (!hasTurn(table)(user)) {
    throw new IllegalMoveError('attack while not having turn', user.id, emojiFrom, emojiTo);
  }

  const find = findLand(table.lands);
  const fromLand: Land = find(emojiFrom);
  const toLand = find(emojiTo);
  if (!fromLand || !toLand) {
    logger.debug(table.lands.map(l => l.emoji));
    throw new IllegalMoveError('some land not found in attack', user.id, emojiFrom, emojiTo, fromLand, toLand);
  }
  if (fromLand.color === COLOR_NEUTRAL) {
    throw new IllegalMoveError('attack from neutral', user.id, emojiFrom, emojiTo, fromLand, toLand);
  }
  if (fromLand.points === 1) {
    throw new IllegalMoveError('attack from single-die land', user.id, emojiFrom, emojiTo, fromLand, toLand);
  }
  if (fromLand.color === toLand.color) {
    throw new IllegalMoveError('attack same color', user.id, emojiFrom, emojiTo, fromLand, toLand);
  }
  if (!isBorder(table.adjacency, emojiFrom, emojiTo)) {
    throw new IllegalMoveError('attack not border', user.id, emojiFrom, emojiTo, fromLand, toLand);
  }

  const timestamp = now();
  publish.move(table, {
    from: emojiFrom,
    to: emojiTo,
  });
  return {
    type: 'Attack',
    table: {
      turnStart: timestamp,
      turnActivity: true,
      attack: {
        start: timestamp,
        from: emojiFrom,
        to: emojiTo,
        clientId: clientId,
      },
    },
  };
};

export const endTurn = (user: User, table: Table, clientId): CommandResult => {
  if (table.status !== STATUS_PLAYING) {
    throw new IllegalMoveError('endTurn while not STATUS_PLAYING', user.id);
  }
  if (!hasTurn(table)(user)) {
    throw new IllegalMoveError('endTurn while not having turn', user.id);
  }

  const existing = table.players.filter(p => p.id === user.id).pop();
  if (!existing) {
    throw new IllegalMoveError('endTurn but did not exist in game', user.id);
  }

  return nextTurn('EndTurn', table);
};

export const sitOut = (user: User, table: Table, clientId): CommandResult => {
  if (table.status !== STATUS_PLAYING) {
    throw new IllegalMoveError('sitOut while not STATUS_PLAYING', user.id);
  }

  const player = table.players.filter(p => p.id === user.id).pop();
  if (!player) {
    throw new IllegalMoveError('sitOut while not in game', user.id);
  }

  //if (hasTurn({ turnIndex: table.turnIndex, players: table.players })(player)) {
    //return nextTurn('SitOut', table, true);
  //}

  return {
    type: 'SitOut',
    players: adjustPlayer(table.players.indexOf(player), { out: true }, table.players)
  };
};

export const sitIn = (user, table: Table, clientId): CommandResult => {
  if (table.status !== STATUS_PLAYING) {
    throw new IllegalMoveError('sitIn while not STATUS_PLAYING', user.id);
  }
  const player = table.players.filter(p => p.id === user.id).pop();
  if (!player) {
    throw new IllegalMoveError('sitIn while not in game', user.id);
  }

  const players = table.players.map(p => p === player
    ? { ...p, out: false, outTurns: 0 }
    : p);
  return { type: 'SitIn', players };
};

export const chat = (user, table, clientId, payload): void => {
  publish.chat(table, user ? user.name : null, payload);
  return;
};
